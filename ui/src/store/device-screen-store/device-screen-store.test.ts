import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/store/device-by-serial-store', () => ({ ['DeviceBySerialStore']: class {} }))
vi.mock('@/store/device-error-modal-store', () => ({ deviceErrorModalStore: {} }))
vi.mock('@/store/auth-store', () => ({ authStore: {} }))
vi.mock('@/config/inversify/decorators', () => ({ deviceConnectionRequired: () => () => {} }))

import { DeviceScreenStore } from './device-screen-store'

// Exercise the renderer without starting device sessions or network connections.
interface Renderer {
  canvasWrapper: { ownerDocument: { defaultView: Window; visibilityState?: string } }
  pendingFrame: VideoFrame | null
  animationFrame: number | null
  animationWindow: Window | null
  disposed: boolean
  h264Decoder: null
  renderImage: ReturnType<typeof vi.fn>
  updateBounds: ReturnType<typeof vi.fn>
  determineAspectRatioMode: ReturnType<typeof vi.fn>
  onDecodedFrame(frame: VideoFrame): void
  refreshRenderingWindow(): void
  closeH264Decoder(): void
}

const renderer = (): Renderer =>
  Object.assign(Object.create(DeviceScreenStore.prototype), {
    canvasWrapper: { ownerDocument: { defaultView: window } },
    pendingFrame: null,
    animationFrame: null,
    animationWindow: null,
    disposed: false,
    h264Decoder: null,
    renderImage: vi.fn(),
    updateBounds: vi.fn(),
    determineAspectRatioMode: vi.fn(),
  })

describe('screen rendering across PiP windows', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('moves a queued frame from the hidden opener to the PiP animation clock', async () => {
    const openerRequest = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const openerCancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const pipRequest = vi.fn().mockReturnValue(2)
    const pip = { requestAnimationFrame: pipRequest, cancelAnimationFrame: vi.fn() } as unknown as Window
    const frame = { close: vi.fn() } as unknown as VideoFrame
    const image = { close: vi.fn() }

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(image))
    const store = renderer()

    store.onDecodedFrame(frame)
    expect(openerRequest).toHaveBeenCalledOnce()
    store.canvasWrapper = { ownerDocument: { defaultView: pip } }
    store.refreshRenderingWindow()
    expect(openerCancel).toHaveBeenCalledWith(1)
    expect(pipRequest).toHaveBeenCalledOnce()
    pipRequest.mock.calls[0][0](0)
    await vi.waitFor(() => expect(store.renderImage).toHaveBeenCalledWith(image))
    expect(frame.close).toHaveBeenCalledOnce()
  })

  it('drops stale frames and renders only the latest queued frame', async () => {
    const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const first = { close: vi.fn() } as unknown as VideoFrame
    const latest = { close: vi.fn() } as unknown as VideoFrame
    const createBitmap = vi.fn().mockResolvedValue({ close: vi.fn() })

    vi.stubGlobal('createImageBitmap', createBitmap)
    const store = renderer()

    store.onDecodedFrame(first)
    store.onDecodedFrame(latest)
    expect(first.close).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledOnce()
    request.mock.calls[0][0](0)
    await vi.waitFor(() => expect(latest.close).toHaveBeenCalledOnce())
    expect(createBitmap).toHaveBeenCalledWith(latest)
  })

  it('cancels pending rendering and releases the queued frame on teardown', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const frame = { close: vi.fn() } as unknown as VideoFrame
    const store = renderer()

    store.onDecodedFrame(frame)
    store.closeH264Decoder()
    expect(cancel).toHaveBeenCalledWith(1)
    expect(frame.close).toHaveBeenCalledOnce()
    expect(store.pendingFrame).toBeNull()
  })
})
