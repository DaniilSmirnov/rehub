import { Page, WebSocket } from '@playwright/test'

// One scrcpy packet as the device sends it over the screen WebSocket:
// a 12-byte header, then the payload of a media packet
// (lib/units/device/resources/util/scrcpy-stream.ts)
export type ScrcpyPacket =
    | { type: 'session', width: number, height: number }
    | { type: 'media', config: boolean, keyFrame: boolean, payload: Buffer }

const HEADER_LENGTH = 12

export function parseScrcpyPacket(data: Buffer): ScrcpyPacket | null {
    if (data.length < HEADER_LENGTH) {
        return null
    }
    if (data[0] & 0x80) {
        return { type: 'session', width: data.readUInt32BE(4), height: data.readUInt32BE(8) }
    }
    if (data.readUInt32BE(8) !== data.length - HEADER_LENGTH) {
        return null
    }
    return {
        type: 'media'
        , config: (data[0] & 0x40) !== 0
        , keyFrame: (data[0] & 0x20) !== 0
        , payload: data.subarray(HEADER_LENGTH)
    }
}

// Types of the H.264 NAL units of an Annex B payload (7 = SPS, 8 = PPS, 5 = IDR slice)
export function nalUnitTypes(payload: Buffer): number[] {
    const types: number[] = []
    for (let i = 0; i + 3 < payload.length; i++) {
        if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1) {
            types.push(payload[i + 3] & 0x1f)
            i += 2
        }
    }
    return types
}

export interface ScreenStream {
    socket: WebSocket
    banner: Record<string, unknown> | null
    packets: ScrcpyPacket[]
    // Binary messages that are not scrcpy packets (JPEG frames of minicap…)
    invalid: number
    closed: boolean
}

// Records the device screen WebSockets the page opens: the one that gets the
// "start {banner}" message is the screen stream
export class ScreenStreamRecorder {
    readonly streams: ScreenStream[] = []

    constructor(page: Page) {
        page.on('websocket', socket => {
            const stream: ScreenStream = { socket, banner: null, packets: [], invalid: 0, closed: false }
            socket.on('framereceived', ({ payload }) => {
                if (typeof payload === 'string') {
                    if (payload.startsWith('start ')) {
                        stream.banner = JSON.parse(payload.substring('start '.length))
                        if (!this.streams.includes(stream)) {
                            this.streams.push(stream)
                        }
                    }
                    return
                }
                const packet = parseScrcpyPacket(payload)
                if (packet) {
                    stream.packets.push(packet)
                }
                else {
                    stream.invalid += 1
                }
            })
            socket.on('close', () => {
                stream.closed = true
            })
        })
    }

    get current(): ScreenStream | undefined {
        return this.streams[this.streams.length - 1]
    }

    // What the current stream got so far
    stats() {
        const packets = this.current?.packets ?? []
        const media = packets.filter(p => p.type === 'media')
        return {
            codec: this.current?.banner?.codec
            , sessions: packets.filter(p => p.type === 'session').length
            , configs: media.filter(p => p.config).length
            , keyFrames: media.filter(p => !p.config && p.keyFrame).length
            , frames: media.filter(p => !p.config).length
            , invalid: this.current?.invalid ?? 0
        }
    }
}
