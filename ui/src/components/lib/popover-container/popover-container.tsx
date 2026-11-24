import { cloneElement, useLayoutEffect, useRef, useState } from 'react'
import cn from 'classnames'
import { Card } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { useClickOutside } from '@/lib/hooks/use-click-outside.hook'

import styles from './popover-container.module.css'

import type { MouseEvent, ReactElement, ReactNode } from 'react'

type PopoverContainerProps = {
  children: ReactElement
  content: (onClose: () => void) => ReactNode
  className?: string
}

export const PopoverContainer = ({ children, content, className }: PopoverContainerProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useClickOutside(cardRef, () => setIsMenuOpen(false))

  useLayoutEffect(() => {
    const card = cardRef.current
    const ownerWindow = card?.ownerDocument.defaultView

    if (!isMenuOpen || !card || !ownerWindow) return undefined

    const keepInViewport = () => {
      const bounds = card.getBoundingClientRect()
      const previousShift = Number.parseFloat(card.style.getPropertyValue('--popover-offset-x')) || 0
      const originalLeft = bounds.left - previousShift
      const maxLeft = Math.max(8, ownerWindow.innerWidth - bounds.width - 8)
      const left = Math.min(Math.max(originalLeft, 8), maxLeft)

      card.style.setProperty('--popover-offset-x', `${left - originalLeft}px`)
    }

    keepInViewport()
    ownerWindow.addEventListener('resize', keepInViewport)
    ownerWindow.addEventListener('scroll', keepInViewport, true)
    const observer = new ResizeObserver(keepInViewport)

    observer.observe(card)

    return () => {
      observer.disconnect()
      ownerWindow.removeEventListener('resize', keepInViewport)
      ownerWindow.removeEventListener('scroll', keepInViewport, true)
    }
  }, [isMenuOpen])

  const onMenuOpen = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    setIsMenuOpen((isOpen) => !isOpen)
  }

  return (
    <div className={styles.popoverContainer}>
      <ConditionalRender conditions={[isMenuOpen]}>
        <Card className={cn(styles.menu, className)} getRootRef={cardRef} mode='shadow'>
          {content(() => setIsMenuOpen(false))}
        </Card>
      </ConditionalRender>
      {cloneElement(children, { onClick: onMenuOpen })}
    </div>
  )
}
