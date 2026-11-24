/* Test fixtures use labels rather than translated product strings. */
/* eslint-disable i18next/no-literal-string */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDevicePictureInPicture } from './use-device-picture-in-picture.hook'

describe('device picture-in-picture', () => {
  let iframe: HTMLIFrameElement
  let pip: Window
  const requestWindow = vi.fn()

  beforeEach(() => {
    iframe = document.createElement('iframe')
    document.body.append(iframe)
    pip = iframe.contentWindow!
    vi.spyOn(pip, 'close').mockImplementation(() => {
      pip.dispatchEvent(new Event('pagehide'))
    })
    requestWindow.mockReset().mockResolvedValue(pip)
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow } })
  })

  afterEach(() => {
    cleanup()
    iframe.remove()
    Reflect.deleteProperty(window, 'documentPictureInPicture')
    vi.restoreAllMocks()
  })

  it('detects unsupported browsers without requesting a window', async () => {
    Reflect.deleteProperty(window, 'documentPictureInPicture')
    const { result } = renderHook(() => useDevicePictureInPicture(vi.fn()))

    expect(result.current.isSupported).toBe(false)
    await act(() => result.current.open())
    expect(requestWindow).not.toHaveBeenCalled()
  })

  it('preserves React state, keyboard and button events when moving and restoring the viewport', async () => {
    const unmounted = vi.fn()
    const moved = vi.fn()
    const onKeyDown = vi.fn()
    const Counter = () => {
      const [count, setCount] = useState(0)

      useEffect(() => unmounted, [])

      return (
        <>
          <button type='button' onClick={() => setCount(count + 1)}>
            Count {count}
          </button>
          <input aria-label='keyboard' onKeyDown={onKeyDown} />
        </>
      )
    }

    const Device = () => {
      const view = useDevicePictureInPicture(moved)

      return (
        <>
          <button type='button' onClick={view.open}>
            Open PiP
          </button>
          <div ref={view.inlineRef} data-testid='inline' />
          {createPortal(<Counter />, view.container)}
        </>
      )
    }

    const screen = render(<Device />)
    const original = screen.getByText('Count 0')

    await act(async () => {
      fireEvent.click(screen.getByText('Open PiP'))
    })
    expect(pip.document.body.contains(original)).toBe(true)
    fireEvent.click(original)
    expect(original.textContent).toBe('Count 1')
    fireEvent.keyDown(pip.document.querySelector('input')!, { key: 'a' })
    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(unmounted).not.toHaveBeenCalled()

    act(() => pip.close())
    expect(screen.getByTestId('inline').contains(original)).toBe(true)
    expect(original.textContent).toBe('Count 1')
    expect(moved).toHaveBeenCalledTimes(2)
    expect(unmounted).not.toHaveBeenCalled()
  })

  it('copies styles and theme tokens without inheriting the main page layout', async () => {
    const style = document.createElement('style')

    style.textContent = '.device { color: red; }'
    document.head.append(style)
    const Device = () => {
      const view = useDevicePictureInPicture(vi.fn())

      return (
        <div className='layout vkui--vkBase--dark'>
          <div ref={view.inlineRef} style={{ ['--device-theme']: 'dark' } as React.CSSProperties} />
          <button type='button' onClick={view.open}>
            Open PiP
          </button>
        </div>
      )
    }

    const screen = render(<Device />)

    await act(async () => {
      fireEvent.click(screen.getByText('Open PiP'))
    })
    expect(pip.document.head.textContent).toContain('.device { color: red; }')
    expect(pip.document.body.classList.contains('vkui--vkBase--dark')).toBe(true)
    expect(pip.document.body.classList.contains('layout')).toBe(false)
    expect(pip.document.body.style.getPropertyValue('--device-theme')).toBe('dark')
    style.remove()
  })

  it('resolves icon references in PiP and copies symbols registered after opening', async () => {
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')

    sprite.id = '__SVG_SPRITE_NODE__'
    sprite.innerHTML = '<symbol id="home"><path d="M0 0H10V10Z" /></symbol>'
    document.body.append(sprite)
    const { result } = renderHook(() => useDevicePictureInPicture(vi.fn()))

    result.current.container.innerHTML = '<svg><use href="#home" /></svg>'

    try {
      await act(() => result.current.open())
      const use = pip.document.querySelector('use')!
      const symbolId = use.getAttribute('href')!.slice(1)

      expect(pip.document.getElementById(symbolId)?.tagName).toBe('symbol')
      expect(pip.document.getElementById(symbolId)).not.toBe(document.getElementById(symbolId))
      expect(document.getElementById(symbolId)).not.toBeNull()

      const returnIcon = document.createElementNS('http://www.w3.org/2000/svg', 'symbol')

      returnIcon.id = 'return-to-tab'
      sprite.append(returnIcon)
      await waitFor(() => expect(pip.document.getElementById('return-to-tab')).not.toBeNull())

      act(() => pip.close())
      returnIcon.id = 'changed-after-close'
      await act(async () => {
        await Promise.resolve()
      })
      expect(pip.document.getElementById('changed-after-close')).toBeNull()
    } finally {
      sprite.remove()
    }
  })

  it('ignores duplicate requests while a window is opening', async () => {
    let resolve!: (value: Window) => void

    requestWindow.mockReturnValue(
      new Promise<Window>((done) => {
        resolve = done
      })
    )
    const { result } = renderHook(() => useDevicePictureInPicture(vi.fn()))
    let pending!: Promise<void>

    act(() => {
      pending = result.current.open()
    })
    await act(() => result.current.open())
    expect(requestWindow).toHaveBeenCalledOnce()
    await act(async () => {
      resolve(pip)
      await pending
    })
    expect(result.current.isOpen).toBe(true)
  })

  it('reports denied requests without moving the viewport', async () => {
    requestWindow.mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
    const { result } = renderHook(() => useDevicePictureInPicture(vi.fn()))

    await act(() => result.current.open())
    expect(result.current.isOpen).toBe(false)
    expect(result.current.error).toBe(true)
    expect(pip.document.body.children).toHaveLength(0)
  })

  it('closes PiP on unmount', async () => {
    const { result, unmount } = renderHook(() => useDevicePictureInPicture(vi.fn()))

    await act(() => result.current.open())
    unmount()
    expect(pip.close).toHaveBeenCalledOnce()
    expect(pip.document.body.children).toHaveLength(0)
  })

  it('closes a delayed window if the device was unmounted while opening', async () => {
    let resolve!: (value: Window) => void

    requestWindow.mockReturnValue(
      new Promise<Window>((done) => {
        resolve = done
      })
    )
    const { result, unmount } = renderHook(() => useDevicePictureInPicture(vi.fn()))
    let opening!: Promise<void>

    act(() => {
      opening = result.current.open()
    })
    unmount()
    await act(async () => {
      resolve(pip)
      await opening
    })
    expect(pip.close).toHaveBeenCalledOnce()
    expect(pip.document.body.children).toHaveLength(0)
  })
})
