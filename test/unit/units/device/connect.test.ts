import {EventEmitter} from 'node:events'
import {Duplex, PassThrough} from 'node:stream'
import {generateKeyPairSync, privateEncrypt, constants} from 'node:crypto'
import {afterEach, describe, expect, it, vi} from 'vitest'
// Load the public entry first, as in the reverse tests, to initialize adbkit's import cycle.
import '@u4/adbkit'
import TcpUsbSocket from '../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/socket.js'
import Packet from '../../../../node_modules/@u4/adbkit/dist/adb/tcpusb/packet.js'
import Auth from '../../../../node_modules/@u4/adbkit/dist/adb/auth.js'

vi.mock('../../../../lib/units/device/support/adb.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/transport.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/plugins/group.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/plugins/solo.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/urlformat.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/base-device/support/connector.js', () => ({default: {consume() {}}, DEVICE_TYPE: {ANDROID: 0}}))
vi.mock('../../../../lib/units/device/plugins/util/identity.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/plugins/util/data.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/units/device/resources/minirev.js', () => ({default: {consume() {}}}))
vi.mock('../../../../lib/util/lifecycle.js', () => ({default: {observe: vi.fn(), fatal: vi.fn(), ending: false}}))
vi.mock('../../../../lib/util/streamutil.js', () => ({talk: vi.fn()}))

const {encodePublicKey} = await import('../../../../lib/util/adbkeyutil.js')

const connect = (await import('../../../../lib/units/device/plugins/connect.js')).default
const pair = generateKeyPairSync('rsa', {modulusLength: 2048})
const modulus = Buffer.from(pair.publicKey.export({format: 'jwk'}).n!, 'base64url')
// adbkit only uses the modulus and exponent; Montgomery fields are not read.
const publicStruct = Buffer.alloc(524)
publicStruct.writeUInt32LE(64)
Buffer.from(modulus).reverse().copy(publicStruct, 8)
publicStruct.writeUInt32LE(65537, 520)
const publicKey = `${publicStruct.toString('base64')} test@devicehub\0`
const fingerprint = (await Auth.parsePublicKey(publicKey.slice(0, -1))).fingerprint
// The same key with real Montgomery fields, as a user would store it
const storedKey = encodePublicKey(Object.assign(await Auth.parsePublicKey(publicKey.slice(0, -1)), {fingerprint: ''}))
const storedFingerprint = (await Auth.parsePublicKey(storedKey)).fingerprint

class ClientStream extends Duplex {
    remoteAddress = '127.0.0.1'
    writes: Buffer[] = []
    setNoDelay() {}
    _read() {}
    _write(bytes: Buffer, _encoding: string, callback: () => void) { this.writes.push(bytes); callback() }
}

const closing: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of closing.splice(0)) await close(); vi.clearAllMocks() })

async function setup(silent: boolean, keys?: string[], publicKeys?: string[]) {
    const group = Object.assign(new EventEmitter(), {keepalive: vi.fn()})
    const transport = {send: vi.fn()}
    let handlers: any, bridgeOptions: any
    const sockets: any[] = []
    const server = Object.assign(new EventEmitter(), {
        listen: vi.fn(() => queueMicrotask(() => server.emit('listening'))),
        end: vi.fn(() => sockets.forEach(socket => socket.end())),
        close: vi.fn(() => server.emit('close'))
    })
    const openLocal = vi.fn(async () => new PassThrough())
    const client = {getDevice: () => ({shell: async () => new PassThrough(), openLocal,
        getProperties: async () => ({'ro.product.name': 'test', 'ro.product.model': 'test', 'ro.product.device': 'test'})}),
    createTcpUsbBridge: (_serial: string, options: any) => { bridgeOptions = options; return server }}
    const connector = {init: (options: any) => { handlers = options.handlers }, stop: vi.fn(async () => {})}
    await connect.invoke({silent, serial: 'serial', connectPort: 7401}, client, transport, group,
        {}, () => 'localhost:7401', connector, {model: 'test'}, {name: {id: 'test'}}, {bin: 'minirev', stop: async () => {}})
    group.emit('join', {owner: {email: 'owner@example.test'}, adbKeys: keys, adbPublicKeys: publicKeys})
    // The full keys are parsed asynchronously
    await new Promise(resolve => setTimeout(resolve, 10))
    await handlers.start()
    closing.push(() => handlers.stop())
    const socket = () => {
        const stream = new ClientStream()
        const connection = new TcpUsbSocket(client as any, 'serial', stream as any, bridgeOptions) as any
        // TcpUsbServer forwards client errors to the server, just like the real bridge.
        connection.on('error', (error: Error) => server.emit('error', error))
        sockets.push(connection)
        server.emit('connection', connection)
        return {connection, stream}
    }
    const sign = (connection: any, validSignature = true) => {
        connection.token = Buffer.alloc(20, 7)
        const digestInfo = Buffer.concat([Buffer.from('3021300906052b0e03021a05000414', 'hex'), connection.token])
        const signature = privateEncrypt({key: pair.privateKey, padding: constants.RSA_PKCS1_PADDING}, digestInfo)
        if (!validSignature) connection.token[0] ^= 1
        return signature
    }
    const authenticate = (connection: any, validSignature = true, key = publicKey) => {
        connection.signature = sign(connection, validSignature)
        connection.reader.emit('packet', {command: Packet.A_AUTH, arg0: 3, arg1: 0, data: Buffer.from(key)})
    }
    // What a client sends first: a signature, which a device accepts outright for a key it knows
    const sendSignature = (connection: any) => {
        connection.version = 0x01000000
        connection.maxPayload = 4096
        connection.reader.emit('packet', {command: Packet.A_AUTH, arg0: 2, arg1: 0, data: sign(connection)})
    }
    return {group, server, socket, authenticate, sendSignature, handlers, openLocal, transport}
}

describe('remote ADB authentication', () => {
    it.each([false, true])('allows a valid RSA client when owner has no saved keys (silent: %s)', async silent => {
        const h = await setup(silent, [])
        const {connection} = h.socket()
        h.authenticate(connection)
        await vi.waitFor(() => expect(connection.authorized).toBe(true))
    })

    it.each([
        [false, 'unknown key'], [true, 'unknown key'], [false, 'bad signature'], [true, 'bad signature'],
        [false, 'malformed key'], [true, 'malformed key']
    ] as const)('closes only the failed connection (silent: %s, %s) and accepts the next client', async (silent, reason) => {
        const h = await setup(silent, reason === 'unknown key' ? ['different'] : [fingerprint])
        const rejected = h.socket()
        h.authenticate(rejected.connection, reason !== 'bad signature', reason === 'malformed key' ? 'broken key\0' : publicKey)
        await vi.waitFor(() => expect(rejected.connection.ended).toBe(true))
        expect(rejected.connection.authorized).toBe(false)
        expect(h.server.close).not.toHaveBeenCalled()
        h.group.emit('join', {adbKeys: [fingerprint]})
        const accepted = h.socket()
        h.authenticate(accepted.connection)
        await vi.waitFor(() => expect(accepted.connection.authorized).toBe(true))
    })

    it('denies authentication after release', async () => {
        const h = await setup(true, [fingerprint])
        const accepted = h.socket()
        h.authenticate(accepted.connection)
        await vi.waitFor(() => expect(accepted.connection.authorized).toBe(true))
        h.group.emit('leave')
        const rejected = h.socket()
        h.authenticate(rejected.connection)
        await vi.waitFor(() => expect(rejected.connection.ended).toBe(true))
        expect(rejected.connection.authorized).toBe(false)
    })

    it('does not open a reverse tunnel before RSA authentication', async () => {
        const h = await setup(true, [])
        const {connection} = h.socket()
        h.openLocal.mockClear()
        connection.reader.emit('packet', {command: Packet.A_OPEN, arg0: 1, arg1: 0,
            data: Buffer.from('reverse:forward:tcp:7000;tcp:8000\0')})
        await vi.waitFor(() => expect(connection.ended).toBe(true))
        expect(h.openLocal).not.toHaveBeenCalled()
    })
})

describe('remote ADB authentication with stored public keys', () => {
    it('accepts the signature of a key the owner stored in full', async () => {
        const h = await setup(false, [storedFingerprint], [storedKey])
        const {connection} = h.socket()
        h.sendSignature(connection)
        await vi.waitFor(() => expect(connection.authorized).toBe(true))
        expect(h.transport.send).not.toHaveBeenCalled()
    })

    it('ignores stored keys that are not among the owner\'s fingerprints', async () => {
        const h = await setup(false, ['different'], [storedKey])
        const {connection, stream} = h.socket()
        h.sendSignature(connection)
        await vi.waitFor(() => expect(stream.writes.length).toBeGreaterThan(0))
        expect(connection.authorized).toBe(false)
    })

    it('sends the full key along when the owner has only its fingerprint', async () => {
        const h = await setup(false, [storedFingerprint], [])
        const {connection} = h.socket()
        h.authenticate(connection, true, `${storedKey}\0`)
        await vi.waitFor(() => expect(connection.authorized).toBe(true))
        await vi.waitFor(() => expect(h.transport.send).toHaveBeenCalledOnce())
        const packed = Buffer.from(h.transport.send.mock.calls[0][0][1]).toString('latin1')
        expect(packed).toContain('owner@example.test')
        expect(packed).toContain(storedFingerprint)

        // The next connection goes through on its signature alone
        const next = h.socket()
        h.sendSignature(next.connection)
        await vi.waitFor(() => expect(next.connection.authorized).toBe(true))
        expect(h.transport.send).toHaveBeenCalledOnce()
    })

    it('stores nothing for an owner without keys', async () => {
        const h = await setup(false, [], [])
        const {connection} = h.socket()
        h.authenticate(connection)
        await vi.waitFor(() => expect(connection.authorized).toBe(true))
        expect(h.transport.send).not.toHaveBeenCalled()
    })

    it('forgets the stored keys when the owner leaves', async () => {
        const h = await setup(false, [storedFingerprint], [storedKey])
        h.group.emit('leave')
        const {connection, stream} = h.socket()
        h.sendSignature(connection)
        await vi.waitFor(() => expect(stream.writes.length).toBeGreaterThan(0))
        expect(connection.authorized).toBe(false)
    })
})
