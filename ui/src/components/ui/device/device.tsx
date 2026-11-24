import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { Button, Flex } from '@vkontakte/vkui'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { useInjection } from 'inversify-react'

import { ErrorFallback } from '@/components/lib/error-fallback'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useDevicePictureInPicture } from '@/lib/hooks/use-device-picture-in-picture.hook'

import { DeviceTopBar } from './device-top-bar'
import { DeviceScreen } from './device-screen'
import { DeviceNavigationButtons } from './device-navigation-buttons'

import styles from './device.module.css'

export const Device = observer(() => {
  const { t } = useTranslation()
  const deviceLifecycleService = useInjection(CONTAINER_IDS.deviceLifecycleService)
  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const pip = useDevicePictureInPicture(() => deviceScreenStore.refreshRenderingWindow())

  pip.container.className = styles.viewport

  useEffect(() => {
    deviceLifecycleService.prepareDevice()

    return () => {
      deviceLifecycleService.cleanupDevice()
    }
  }, [])

  return (
    <Flex className={styles.device} direction='column' noWrap>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {pip.error && (
          <div className={styles.pipError} role='alert'>
            {t('Could not open picture-in-picture. Try again from the device tab.')}
          </div>
        )}
        <div ref={pip.inlineRef} className={styles.viewportHost}>
          {pip.isOpen && (
            <div className={styles.placeholder}>
              <span>{t('Device is open in picture-in-picture')}</span>
              <Button onClick={pip.close}>{t('Return to tab')}</Button>
            </div>
          )}
        </div>
        {createPortal(
          <>
            <DeviceTopBar
              isPictureInPictureOpen={pip.isOpen}
              isPictureInPictureSupported={pip.isSupported}
              onPictureInPicture={() => {
                void pip.open()
              }}
              onReturnToTab={
                pip.isOpen
                  ? () => {
                      pip.close()
                      window.focus()
                    }
                  : undefined
              }
            />
            <DeviceScreen />
            <DeviceNavigationButtons />
          </>,
          pip.container
        )}
      </ErrorBoundary>
    </Flex>
  )
})
