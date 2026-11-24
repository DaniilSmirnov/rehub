import { renderHook } from '@testing-library/react'

import { getPageTitle, usePageTitle } from './use-page-title.hook'

describe('usePageTitle', () => {
  test('puts the title before the app name', () => {
    expect(getPageTitle('Samsung Galaxy S24')).toBe('Samsung Galaxy S24 – reHub')
  })

  test('shows only the app name for an empty title', () => {
    expect(getPageTitle(' ')).toBe('reHub')
    expect(getPageTitle()).toBe('reHub')
  })

  test('sets the tab title and restores it on unmount', () => {
    const { rerender, unmount } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'iPhone 15' },
    })

    expect(document.title).toBe('iPhone 15 – reHub')

    rerender({ title: 'iPhone 16' })
    expect(document.title).toBe('iPhone 16 – reHub')

    unmount()
    expect(document.title).toBe('reHub')
  })
})
