import { fireEvent, render, within } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ScreenQualitySelector } from './screen-quality-selector'

import type { ButtonHTMLAttributes, PropsWithChildren, Ref } from 'react'

const controls = vi.hoisted(() => ({ currentQuality: 40, changeDeviceQuality: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

vi.mock('inversify-react', () => ({ useInjection: () => controls }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// Only replace VKUI's visual primitives; exercise the real popover, native
// slider and outside-click hook across two documents.
vi.mock('@vkontakte/vkui', () => ({
  ['Button']: ({ children, onClick, title }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button title={title} type='button' onClick={onClick}>
      {children}
    </button>
  ),
  ['Caption']: ({ children }: PropsWithChildren) => <span>{children}</span>,
  ['Flex']: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ['Card']: ({ children, getRootRef }: PropsWithChildren<{ getRootRef?: Ref<HTMLDivElement> }>) => (
    <div ref={getRootRef}>{children}</div>
  ),
}))

it('changes quality and dismisses the menu using events in the PiP document', () => {
  const iframe = document.createElement('iframe')

  document.body.append(iframe)
  const pipDocument = iframe.contentDocument!
  const view = render(createPortal(<ScreenQualitySelector useNativeSlider />, pipDocument.body))

  try {
    const screen = within(pipDocument.body)

    fireEvent.click(screen.getByTitle('Quality'))
    const slider = screen.getByRole('slider', { name: 'Quality' })

    expect(slider).toHaveValue('40')
    fireEvent.change(slider, { target: { value: '70' } })
    expect(controls.changeDeviceQuality).toHaveBeenCalledWith(70)
    fireEvent.click(pipDocument.body)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  } finally {
    view.unmount()
    iframe.remove()
  }
})

it('keeps the quality menu inside the PiP viewport on opening and resizing', () => {
  const iframe = document.createElement('iframe')

  document.body.append(iframe)
  const pipWindow = iframe.contentWindow!
  const pipDocument = iframe.contentDocument!

  Object.defineProperty(pipWindow, 'innerWidth', { value: 360, configurable: true })
  let anchorLeft = -180

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function viewportBounds(this: HTMLElement) {
    const shift = Number.parseFloat(this.style.getPropertyValue('--popover-offset-x')) || 0

    return {
      left: anchorLeft + shift,
      right: anchorLeft + shift + 280,
      width: 280,
      height: 80,
      top: 0,
      bottom: 80,
      x: anchorLeft + shift,
      y: 0,
      toJSON: () => ({}),
    }
  })
  // iframe elements have a separate realm/prototype.
  const pipElement = pipDocument.createElement('div')

  vi.spyOn(Object.getPrototypeOf(pipElement), 'getBoundingClientRect').mockImplementation(function pipBounds(this: HTMLElement) {
    const shift = Number.parseFloat(this.style.getPropertyValue('--popover-offset-x')) || 0

    return {
      left: anchorLeft + shift,
      right: anchorLeft + shift + 280,
      width: 280,
      height: 80,
      top: 0,
      bottom: 80,
      x: anchorLeft + shift,
      y: 0,
      toJSON: () => ({}),
    }
  })
  const view = render(createPortal(<ScreenQualitySelector useNativeSlider />, pipDocument.body))

  try {
    const screen = within(pipDocument.body)

    fireEvent.click(screen.getByTitle('Quality'))
    const menu = screen.getByRole('slider', { name: 'Quality' }).parentElement!

    expect(menu.getBoundingClientRect().left).toBe(8)
    expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(352)
    anchorLeft = 260
    fireEvent.resize(pipWindow)
    expect(menu.getBoundingClientRect().left).toBe(72)
    expect(menu.getBoundingClientRect().right).toBe(352)
  } finally {
    view.unmount()
    iframe.remove()
  }
})
