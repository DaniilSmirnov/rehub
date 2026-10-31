import { describe, expect, it, vi } from 'vitest'

import { WatchScreen, type WatchStatus } from './watch-screen'

const fakeSocket = () => ({
  binaryType: 'blob' as BinaryType,
  send: vi.fn(),
  close: vi.fn(),
  onopen: null as ((event: Event) => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
  onclose: null as ((event: CloseEvent) => void) | null,
})

const setup = () => {
  const socket = fakeSocket()
  const statuses: WatchStatus[] = []
  const createSocket = vi.fn(() => socket)
  const screen = new WatchScreen({ draw: vi.fn(), status: (status) => statuses.push(status) }, createSocket)

  screen.open('ws://device/screen', 'watch-token')

  const message = (data: string | ArrayBuffer) => socket.onmessage!({ data } as MessageEvent)
  const close = (code: number, reason = '') => socket.onclose!({ code, reason } as CloseEvent)

  return { socket, statuses, createSocket, screen, message, close }
}

describe('WatchScreen', () => {
  it('connects with the watch token and asks for frames once authenticated', () => {
    const { socket, statuses, createSocket, message } = setup()

    expect(createSocket).toHaveBeenCalledWith('ws://device/screen', 'access_token.watch-token')
    expect(socket.send).not.toHaveBeenCalled()

    message(JSON.stringify({ type: 'auth_success' }))

    expect(socket.send).toHaveBeenCalledWith('on')
    expect(statuses).toEqual(['connecting', 'watching'])
  })

  it('never sends input or resizes the stream', () => {
    const { socket, message } = setup()

    message(JSON.stringify({ type: 'auth_success' }))
    message('start {"realWidth":1080,"realHeight":1920}')
    message('ping')

    expect(socket.send.mock.calls).toEqual([['on']])
  })

  it('reports that automation finished when the device ends the lease', () => {
    const { statuses, close } = setup()

    close(1008, 'Automation finished')

    expect(statuses.at(-1)).toBe('finished')
  })

  it('reports a refused viewer and a lost connection apart', () => {
    const refused = setup()
    const lost = setup()

    refused.close(1008, 'Authentication failed')
    lost.close(1006)

    expect(refused.statuses.at(-1)).toBe('denied')
    expect(lost.statuses.at(-1)).toBe('disconnected')
  })

  it('stays quiet when the page closes it', () => {
    const { statuses, screen, socket } = setup()

    screen.close()
    socket.onclose?.({ code: 1000 } as CloseEvent)

    expect(socket.close).toHaveBeenCalled()
    expect(statuses).toEqual(['connecting'])
  })
})
