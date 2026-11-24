import { H264ScreenDecoder } from '@/store/device-screen-store/h264-screen-decoder'

/*
 * Read-only screen stream of a device under automation. Connects with a watch token, asks for
 * frames and draws them; it never sends input or resizes the stream, so the test is not disturbed.
 */

export type WatchStatus = 'connecting' | 'watching' | 'finished' | 'denied' | 'disconnected' | 'unsupported'

export type WatchSink = {
  draw: (image: CanvasImageSource & { width: number; height: number }) => void
  status: (status: WatchStatus) => void
}

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'binaryType'> & {
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
}

export class WatchScreen {
  private socket: SocketLike | null = null
  private decoder: H264ScreenDecoder | null = null
  private closed = false

  constructor(
    private readonly sink: WatchSink,
    private readonly createSocket: (url: string, protocol: string) => SocketLike = (url, protocol) =>
      new WebSocket(url, protocol)
  ) {}

  open(url: string, token: string): void {
    this.sink.status('connecting')

    const socket = this.createSocket(url, `access_token.${token}`)

    socket.binaryType = 'arraybuffer'
    socket.onmessage = (event) => this.onMessage(socket, event)
    socket.onclose = (event) => this.onClose(event)
    this.socket = socket
  }

  close(): void {
    this.closed = true
    this.decoder?.close()
    this.decoder = null
    this.socket?.close()
    this.socket = null
  }

  private onMessage(socket: SocketLike, { data }: MessageEvent<ArrayBuffer | string>): void {
    if (data instanceof ArrayBuffer) {
      if (this.decoder) {
        this.decoder.push(data)

        return
      }

      createImageBitmap(new Blob([data])).then((image) => this.sink.draw(image))

      return
    }

    if (data.startsWith('start ')) {
      let codec: string | undefined

      try {
        codec = JSON.parse(data.slice('start '.length))?.codec
      } catch {
        codec = undefined
      }

      this.useCodec(codec)

      return
    }

    try {
      const message = JSON.parse(data)

      if (message?.type === 'auth_success') {
        socket.send('on')
        this.sink.status('watching')
      }
    } catch {
      /* ping and other plain messages */
    }
  }

  private useCodec(codec?: string): void {
    if (codec !== 'h264') {
      this.decoder?.close()
      this.decoder = null

      return
    }

    if (this.decoder) return

    if (!H264ScreenDecoder.isSupported()) {
      this.sink.status('unsupported')

      return
    }

    this.decoder = new H264ScreenDecoder(
      (frame) => {
        createImageBitmap(frame)
          .then((image) => this.sink.draw(image))
          .finally(() => frame.close())
      },
      (error) => console.warn('Screen decoder error, waiting for the next key frame:', error)
    )
  }

  private onClose(event: CloseEvent): void {
    this.decoder?.close()
    this.decoder = null
    this.socket = null

    if (this.closed) return

    if (event.code === 1008) {
      this.sink.status(event.reason === 'Automation finished' ? 'finished' : 'denied')

      return
    }

    this.sink.status('disconnected')
  }
}
