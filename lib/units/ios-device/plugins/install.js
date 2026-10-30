import {v4 as uuidv4} from 'uuid'
import syrup from '@devicefarmer/stf-syrup'
import logger from '../../../util/logger.js'
import wireutil from '../../../wire/util.js'
import Promise from 'bluebird'
import {execFile} from 'child_process'
import * as promiseutil from '../../../util/promiseutil.js'
import router from '../../base-device/support/router.js'
import transport from '../../base-device/support/transport.js'
import storage from '../../base-device/support/storage.js'
import deviceutil from '../../../util/deviceutil.js'
import {InstallMessage, UninstallIosMessage} from '../../../wire/wire.js'
import * as goIos from '../support/go-ios.js'

// idb gets its arguments as an argv array: the bundle id comes from the user and
// must never reach a shell
export const runIdb = (args) => {
    return new Promise((resolve, reject) => {
        execFile('idb', args, (error, stdout) => {
            if (error) {
                reject(error)
            }
            resolve(stdout)
        })
    })
}

// CFBundleIdentifier: letters, digits, hyphens, underscores and dots, never starting with a
// hyphen that idb would read as an option
const BUNDLE_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/

const checkBundleId = (bundleId) => {
    if (typeof bundleId !== 'string' || !BUNDLE_ID.test(bundleId)) {
        throw new Error(`Invalid bundle id "${bundleId}"`)
    }
    return bundleId
}

// With the go-ios backend (Linux) the same operations go through go-ios, also without a shell
export const runGoIos = (goIosPath, args) => Promise.resolve(goIos.runGoIos(goIosPath, args))

export const installApp = (udid, filepath, goIosPath) => goIosPath ?
    runGoIos(goIosPath, goIos.installArgs(udid, filepath)) :
    runIdb(['install', filepath, `--udid=${udid}`])

export const launchApp = (udid, bundleId, goIosPath) =>
    Promise.try(() => goIosPath ?
        runGoIos(goIosPath, goIos.launchArgs(udid, checkBundleId(bundleId))) :
        runIdb(['launch', checkBundleId(bundleId), `--udid=${udid}`]))

export const uninstallApp = (udid, bundleId, goIosPath) =>
    Promise.try(() => goIosPath ?
        runGoIos(goIosPath, goIos.uninstallArgs(udid, checkBundleId(bundleId))) :
        runIdb(['uninstall', checkBundleId(bundleId), `--udid=${udid}`]))

export default syrup.serial()
    .dependency(router)
    .dependency(transport)
    .dependency(storage)
    .define(function(options, router, transport, storage) {
        const log = logger.createLogger('ios-device:plugins:install')
        const reply = wireutil.reply(options.serial)
        const goIosPath = options.iosBackend === 'go-ios' && !options.isSimulator ?
            options.goIosPath || 'ios' :
            undefined

        router.on(InstallMessage, async function(channel, message) {
            log.info('Installing application from "%s"', message.href)
            const jwt = message.jwt

            const sendProgress = (data, progress) =>
                transport.send([channel, reply.progress(data, progress)])

            sendProgress('starting', 0)

            const stopProgressUp = deviceutil.progressUp(sendProgress)

            const {path, cleanup} = await storage.download(message.href, channel, jwt, null, uuidv4() + '.ipa')
            stopProgressUp()

            let guesstimate = 60
            sendProgress('installing_app', guesstimate)
            // '/var/folders/0t/sq4p1g716_n_nvj602_j2dnw0000gp/T/tmp-62584-3cTw404sw38m'
            // '/var/folders/0t/sq4p1g716_n_nvj602_j2dnw0000gp/T/tmp-62584-3cTw404sw38m/4f0787e8-8e45-4d27-b145-e2101c474656.ipa'
            promiseutil.periodicNotify(installApp(options.serial, path, goIosPath), 250)
                .progressed(() => {
                    guesstimate = Math.min(95, guesstimate + 1.5 * (95 - guesstimate) / 35)
                    sendProgress('installing_app', Math.round(guesstimate))
                })
                .then((result) => {
                    transport.send([channel, reply.okay('INSTALL_SUCCEEDED')])
                    if (message.launch) {
                        const bundleId = String(result).match(/Installed:?\s+([\w.-]+)/i)?.[1]
                        if (!bundleId) {
                            // go-ios does not report the bundle id it installed
                            log.warn('Unable to detect bundle id from idb install output: %s', result)
                            return
                        }

                        sendProgress('launching_app', 100)
                        launchApp(options.serial, bundleId, goIosPath)
                            .catch((err) => {
                                log.warn('Application launch after install failed: %s', err.message)
                            })
                    }
                })
                .catch((err) => {
                    let errorReply = 'INSTALL_ERROR_UNKNOWN'
                    log.error('Installation of package failed', err.stack)
                    if (err.stack.includes('ApplicationVerificationFailed')) {
                        errorReply = 'INSTALL_ERROR_APP_SIGNING'
                    }
                    if (err.stack.includes('not in the bundles supported architectures')) {
                        errorReply = 'INSTALL_ERROR_APP_ARCHITECTURE'
                    }
                    if (err.stack.includes('Exit Code 1 is not acceptable [0]')) {
                        errorReply = 'INSTALL_ERROR_IDB_INTERNAL_ERROR'
                    }
                    transport.send([channel, reply.fail(errorReply)])
                })
                .finally(() => {
                    log.info('Deleting temp file')
                    cleanup()
                })
        })
        router.on(UninstallIosMessage, async function(channel, message) {
            const reply = wireutil.reply(options.serial)
            try {
                await uninstallApp(options.serial, message.packageName, goIosPath)
                transport.send([channel, reply.okay()])
            }
            catch (err) {
                transport.send([channel, reply.fail(err?.message || String(err))])
            }
        })
    })
