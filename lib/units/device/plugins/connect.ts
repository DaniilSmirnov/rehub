import util from 'util'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import lifecycle from '../../../util/lifecycle.js'
import * as streamutil from '../../../util/streamutil.js'
import adb from '../support/adb.js'
import connector, {DEVICE_TYPE} from '../../base-device/support/connector.js'
import transport from '../../base-device/support/transport.js'
import group from './group.js'
import solo from './solo.js'
import urlformat from '../../base-device/support/urlformat.js'
import identity from './util/identity.js'
import data from './util/data.js'
import minirev from '../resources/minirev.js'
import type TcpUsbServer from '@u4/adbkit/dist/adb/tcpusb/server.d.ts'
import {attachReverse, type ReverseSession} from './adb-reverse/session.ts'
import {Adb} from '@u4/adbkit'
import type ExtendedPublicKey from '@u4/adbkit/dist/models/ExtendedPublicKey.d.ts'
import wireutil from '../../../wire/util.js'
import {AdbPublicKeyMessage} from '../../../wire/wire.js'
import {encodePublicKey} from '../../../util/adbkeyutil.js'

interface Key {
    fingerprint: string
    comment: string
}

export default syrup.serial()
    .dependency(adb)
    .dependency(transport)
    .dependency(group)
    .dependency(solo)
    .dependency(urlformat)
    .dependency(connector)
    .dependency(identity)
    .dependency(data)
    .dependency(minirev)
    .define(async(options, adb, transport, group, solo, urlformat, connector, identity, data, minirev) => {
        const log = logger.createLogger('device:plugins:connect')
        let activeServer: TcpUsbServer | null = null
        const activeSessions = new Set<ReverseSession>()
        // The owner's full adb public keys. A signature made with one of them is accepted at once,
        // the way a device accepts a key in its adb_keys, so the adb client reports "connected"
        // instead of falling back to sending its public key and reporting "failed to authenticate".
        // The bridge reads this array on every signature, so it is only ever changed in place. It
        // holds nothing but the current owner's keys and is emptied when the owner leaves.
        const knownKeys: ExtendedPublicKey[] = []
        let owner: {email: string, keys: string[]} | null = null
        // Set to true before deliberate minirev kill so the stream-end
        // listener doesn't trigger lifecycle.fatal().
        let stoppingMinirev = false

        // Launch the minirev binary on the device and wait until its abstract
        // socket is ready to accept connections. Mirrors what the former
        // forward plugin did in startService() + awaitServer().
        async function startMinirev(): Promise<void> {
            stoppingMinirev = false
            log.info('Launching minirev service')
            const out = await adb.getDevice(options.serial).shell(['exec', minirev.bin])
            // Don't use lifecycle.share — it would fatal on deliberate stop().
            // Instead watch for unexpected termination only.
            streamutil.talk(log, 'Minirev says: "%s"', out)
            out.on('end', () => {
                if (!stoppingMinirev && !lifecycle.ending) {
                    log.fatal('Minirev shell ended we shall share its fate')
                    lifecycle.fatal()
                }
            })
            out.on('error', (err: Error) => {
                if (!stoppingMinirev && !lifecycle.ending) {
                    log.fatal('Minirev shell error: %s', err?.message || err)
                    lifecycle.fatal()
                }
            })
        }

        async function awaitMinirev(times = 5, delay = 100): Promise<void> {
            log.info('Waiting for minirev socket')
            try {
                const conn = await adb.getDevice(options.serial).openLocal('localabstract:minirev')
                conn.end()
            } catch (err: any) {
                if (/closed/.test(err.message) && times > 1) {
                    await new Promise(r => setTimeout(r, delay))
                    return awaitMinirev(times - 1, delay * 2)
                }
                throw err
            }
        }

        const plugin = {
            serial: options.serial,
            port: options.connectPort,
            url: options.connectUrl ||
                urlformat(options.connectUrlPattern, options.connectPort, identity.model, data ? data.name.id : ''),
            auth: (key: Key): boolean => false,
            start: async() => {
                log.info('Starting connect plugin')

                await startMinirev()
                await awaitMinirev()

                return new Promise((resolve, reject) => {
                    const auth = async(key: Key) => {
                        if (!plugin.auth(key)) throw new Error('ADB key is not allowed for the current owner')
                    }

                    activeServer = adb.createTcpUsbBridge(plugin.serial, {auth, knownPublicKeys: knownKeys})
                        .on('listening', () => resolve(plugin.url))
                        .on('error', err => {
                            log.warn('Remote ADB bridge error: %s', err.message)
                            reject(err)
                        })
                        .on('connection', conn => {
                            // @ts-ignore
                            log.info('New remote ADB connection from %s', conn.remoteAddress)
                            conn.on('userActivity', () => group.keepalive())

                            const openMinirev = async(devicePort: number) => {
                                const conn = await adb.getDevice(plugin.serial).openLocal('localabstract:minirev')
                                const header = Buffer.alloc(4)
                                header.writeUInt16LE(0, 0)
                                header.writeUInt16LE(devicePort, 2)
                                conn.write(header)
                                return conn as unknown as import('./adb-reverse/session.ts').MinirevStream
                            }

                            const session: ReverseSession = attachReverse(conn as never, openMinirev, err => {
                                log.warn('Closing remote ADB connection: %s', err instanceof Error ? err.message : String(err))
                            })
                            activeSessions.add(session)

                            conn.on('end', () => {
                                session.end()
                                activeSessions.delete(session)
                            })
                        })

                    activeServer!.listen(plugin.port)
                    log.info(util.format('Listening on port %d', plugin.port))
                })
            },
            stop: async() => {
                if (!activeServer) {
                    return
                }

                log.info('Stop connect plugin')

                const waitServerClose = new Promise<void>((resolve) => {
                    activeServer!.on('close', () => {
                        resolve()
                    })
                })

                activeServer.end()
                activeServer.close()
                await waitServerClose

                activeServer = null

                // Kill minirev on device so the next session can bind the
                // abstract socket without "Address already in use".
                stoppingMinirev = true
                await minirev.stop().catch((err: any) => {
                    log.warn('Failed to stop minirev: %s', err?.message || err)
                })
            },
            end: async() => {
                if (connector.started && activeServer) {
                    activeServer.end()
                }
            }
        }

        const addKnownKey = (key: ExtendedPublicKey) => {
            if (!knownKeys.some(known => known.fingerprint === key.fingerprint)) {
                knownKeys.push(key)
            }
        }

        // A key the owner added by its fingerprint alone: send the full key along to be stored, so
        // that the next connection is accepted on its signature
        const reportPublicKey = (key: ExtendedPublicKey) => {
            if (!owner?.keys.includes(key.fingerprint)) {
                return
            }
            try {
                transport.send([
                    wireutil.global,
                    wireutil.pack(AdbPublicKeyMessage, {
                        serial: options.serial,
                        email: owner.email,
                        fingerprint: key.fingerprint,
                        publicKey: encodePublicKey(key)
                    })
                ])
            }
            catch (err: any) {
                log.warn('Unable to report ADB public key "%s": %s', key.fingerprint, err?.message)
            }
        }

        // Only the full keys of the owner's own fingerprints count
        const setKnownKeys = async(keys: string[], publicKeys: string[]) => {
            const parsed = await Promise.all(publicKeys.map(async publicKey => {
                try {
                    return await Adb.util.parsePublicKey(publicKey)
                }
                catch (err: any) {
                    log.warn('Ignoring unparseable ADB public key: %s', err?.message)
                    return null
                }
            }))
            knownKeys.length = 0
            for (const key of parsed) {
                if (key && keys.includes(key.fingerprint)) {
                    addKnownKey(key)
                }
            }
        }

        const setAllowedKeys = (email: string | undefined, keys: string[] = [], publicKeys: string[] = []) => {
            owner = email ? {email, keys} : null
            knownKeys.length = 0
            plugin.auth = key => {
                if (keys.length && !keys.includes(key.fingerprint)) {
                    log.warn('Remote ADB key is not allowed for the current owner')
                    return false
                }
                const extended = key as ExtendedPublicKey
                if ('n' in extended && !knownKeys.some(known => known.fingerprint === key.fingerprint)) {
                    reportPublicKey(extended)
                    // Later connections in this session go through without the round trip
                    addKnownKey(extended)
                }
                return true
            }
            return setKnownKeys(keys, publicKeys)
        }
        group.on('join', e => setAllowedKeys(e.owner?.email, e.adbKeys, e.adbPublicKeys))

        group.on('leave', () => {
            for (const session of activeSessions) {
                session.end()
            }
            activeSessions.clear()
        })

        connector.init({
            serial: options.serial,
            storageUrl: options.storageUrl,
            urlWithoutAdbPort: options.urlWithoutAdbPort,
            deviceType: DEVICE_TYPE.ANDROID,
            handlers: plugin
        })

        lifecycle.observe(() => connector.stop())
        group.on('leave', () => {
            plugin.auth = (key) => false
            owner = null
            knownKeys.length = 0
            return connector.stop()
        })
    })
