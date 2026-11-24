import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>
}

type PictureInPictureWindow = Window & { documentPictureInPicture?: DocumentPictureInPicture }

// Keep the portal target stable. Moving it between documents preserves both the
// streaming canvas and React's delegated keyboard/navigation event handlers.
export const useDevicePictureInPicture = (onMove: () => void) => {
  const [container] = useState(() => document.createElement('div'))
  const inlineRef = useRef<HTMLDivElement>(null)
  const pipRef = useRef<Window | null>(null)
  const opening = useRef(false)
  const mounted = useRef(false)
  const moveRef = useRef(onMove)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState(false)
  const api = (window as PictureInPictureWindow).documentPictureInPicture

  moveRef.current = onMove

  useLayoutEffect(() => {
    inlineRef.current?.append(container)
  }, [container])

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
      pipRef.current?.close()
      container.remove()
    }
  }, [container])

  const close = useCallback(() => pipRef.current?.close(), [])

  const open = useCallback(async () => {
    if (!api || opening.current) return

    if (pipRef.current && !pipRef.current.closed) {
      pipRef.current.focus()

      return
    }

    opening.current = true
    setError(false)

    try {
      const pip = await api.requestWindow({ width: 360, height: 720 })

      if (!mounted.current) {
        pip.close()

        return
      }

      pipRef.current = pip
      const source = inlineRef.current
      const syncStyles = () => {
        pip.document.head.replaceChildren(
          ...Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'), (node) => node.cloneNode(true))
        )
        pip.document.title = document.title
        pip.document.documentElement.lang = document.documentElement.lang
        pip.document.documentElement.dir = document.documentElement.dir
        pip.document.body.className = ancestors(source)
          .flatMap((node) => Array.from(node.classList))
          .filter((name) => name.startsWith('vkui--'))
          .join(' ')

        // VKUI puts theme tokens on ancestors of the device, rather than :root.
        if (source) {
          const computed = getComputedStyle(source)

          pip.document.body.style.fontFamily = computed.fontFamily
          pip.document.body.style.fontSize = computed.fontSize
          pip.document.body.style.colorScheme = computed.colorScheme

          for (let i = 0; i < computed.length; i++) {
            const name = computed[i]

            if (name.startsWith('--')) pip.document.body.style.setProperty(name, computed.getPropertyValue(name))
          }
        }

        Object.assign(pip.document.body.style, { margin: '0', height: '100dvh', overflow: 'hidden' })
      }

      syncStyles()
      const observer = new MutationObserver(syncStyles)

      // VK icons render <use href="#...">, while their symbols are registered
      // in the opener's shared sprite. Fragment references resolve locally in
      // PiP, so keep a separate sprite there, including lazily mounted icons.
      const sprite = document.getElementById('__SVG_SPRITE_NODE__')
      const syncSprite = () => {
        if (!sprite) return

        const clone = sprite.cloneNode(true)
        const previous = pip.document.getElementById(sprite.id)

        if (previous) previous.replaceWith(clone)
        else pip.document.body.prepend(clone)
      }

      const spriteObserver = new MutationObserver(syncSprite)

      syncSprite()

      if (sprite) spriteObserver.observe(sprite, { childList: true, subtree: true, attributes: true })

      observer.observe(document.head, { childList: true, subtree: true, characterData: true })

      for (const node of [document.documentElement, document.body, ...ancestors(source)]) {
        observer.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'lang', 'dir'] })
      }

      pip.addEventListener(
        'pagehide',
        () => {
          observer.disconnect()
          spriteObserver.disconnect()
          pipRef.current = null

          if (mounted.current) {
            inlineRef.current?.append(container)
            setIsOpen(false)
            moveRef.current()
          }
        },
        { once: true }
      )

      pip.document.body.append(container)
      setIsOpen(true)
      moveRef.current()
    } catch {
      pipRef.current?.close()

      if (mounted.current) setError(true)
    } finally {
      opening.current = false
    }
  }, [api, container])

  return { container, inlineRef, isSupported: Boolean(api), isOpen, error, open, close }
}

const ancestors = (node: HTMLElement | null): HTMLElement[] => {
  const nodes: HTMLElement[] = []

  for (let parent = node?.parentElement; parent; parent = parent.parentElement) nodes.push(parent)

  return nodes
}
