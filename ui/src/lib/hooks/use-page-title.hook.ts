import { useEffect } from 'react'

const APP_TITLE = 'reHub'

export const getPageTitle = (title?: string): string => {
  const trimmed = title?.trim()

  return trimmed ? `${trimmed} – ${APP_TITLE}` : APP_TITLE
}

/* Puts the given title in the browser tab while the component is mounted */
export const usePageTitle = (title?: string): void => {
  useEffect(() => {
    document.title = getPageTitle(title)
  }, [title])

  useEffect(
    () => (): void => {
      document.title = APP_TITLE
    },
    []
  )
}
