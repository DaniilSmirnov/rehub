import { useEffect, useState } from 'react'
import cn from 'classnames'
import { useNavigate } from 'react-router'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { ButtonGroup, EllipsisText, Flex, Button } from '@vkontakte/vkui'
import {
  Icon24CancelOutline,
  Icon24VerticalRectangle9x16Outline,
  Icon28DevicesOutline,
  Icon24PictureInPicture16x9Outline,
  Icon24PictureInPictureOut16x9Outline,
} from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { ScreenQualitySelector } from '@/components/ui/screen-quality-selector'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { usePageTitle } from '@/lib/hooks/use-page-title.hook'

import { getMainRoute } from '@/constants/route-paths'

import styles from './device-top-bar.module.css'

interface DeviceTopBarProps {
  isPictureInPictureOpen?: boolean
  isPictureInPictureSupported?: boolean
  onPictureInPicture?: () => void
  onReturnToTab?: () => void
}

export const DeviceTopBar = observer((props: DeviceTopBarProps) => {
  const { isPictureInPictureOpen, isPictureInPictureSupported, onPictureInPicture, onReturnToTab } = props
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)

  const deviceScreenStore = useInjection(CONTAINER_IDS.deviceScreenStore)
  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)
  const deviceDisconnection = useInjection(CONTAINER_IDS.deviceDisconnection)

  const { data: device } = deviceBySerialStore.deviceQueryResult()

  const deviceTitle =
    device?.platform === 'Android' ? `${device?.manufacturer || ''} ${device?.marketName || ''}` : device?.model || ''
  const currentRotation = `${t('Current rotation:')} ${deviceScreenStore.getScreenRotation}°`

  usePageTitle(deviceTitle)

  useEffect(() => {
    const onPopState = () => {
      window.history.pushState({ modalOpened: true }, '')

      setIsConfirmationOpen(true)
    }

    window.addEventListener('popstate', onPopState)
    window.history.pushState({ modalOpened: false }, '')

    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  return (
    <Flex align='center' className={styles.deviceHeader} id='deviceTopBar' justify='space-between'>
      <Flex align='center' className={styles.deviceName} id='deviceName' noWrap>
        <Icon28DevicesOutline className={styles.icon} height={25} width={25} />
        <EllipsisText>{deviceTitle}</EllipsisText>
      </Flex>
      <ButtonGroup align='center' gap='none' mode='horizontal'>
        {!onReturnToTab && (
          <Button
            appearance='neutral'
            aria-label={t('Picture-in-picture')}
            aria-pressed={isPictureInPictureOpen}
            before={<Icon24PictureInPicture16x9Outline />}
            className={styles.topButton}
            disabled={!isPictureInPictureSupported || device?.platform === 'Tizen'}
            mode='tertiary'
            title={
              isPictureInPictureSupported
                ? t('Picture-in-picture')
                : t('Interactive picture-in-picture is not supported in this browser')
            }
            onClick={onPictureInPicture}
          />
        )}
        <Button
          appearance='neutral'
          before={<Icon24VerticalRectangle9x16Outline />}
          borderRadiusMode='inherit'
          className={styles.topButton}
          disabled={!deviceScreenStore.isScreenRotated}
          mode='tertiary'
          title={`${t('Portrait')} (${currentRotation})`}
          onClick={() => deviceControlStore.tryToRotate('portrait')}
        />
        <Button
          appearance='neutral'
          before={<Icon24VerticalRectangle9x16Outline />}
          borderRadiusMode='inherit'
          className={cn(styles.topButton, styles.landscape)}
          disabled={deviceScreenStore.isScreenRotated}
          mode='tertiary'
          title={`${t('Landscape')} (${currentRotation})`}
          onClick={() => deviceControlStore.tryToRotate('landscape')}
        />
        <ConditionalRender conditions={[device?.platform === 'Android']}>
          <ScreenQualitySelector useNativeSlider={Boolean(onReturnToTab)} />
        </ConditionalRender>
        <Button
          appearance='neutral'
          aria-label={onReturnToTab ? t('Return to tab') : t('Stop Using')}
          borderRadiusMode='inherit'
          className={styles.topButton}
          mode='tertiary'
          title={onReturnToTab ? t('Return to tab') : t('Stop Using')}
          before={
            onReturnToTab ? (
              <Icon24PictureInPictureOut16x9Outline />
            ) : (
              <Icon24CancelOutline fill='var(--vkui--color_icon_negative)' />
            )
          }
          onClick={onReturnToTab || (() => setIsConfirmationOpen(true))}
        />
      </ButtonGroup>
      <WarningModal
        description={t('Are you sure? Device will be cleaned')}
        isOpen={isConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsConfirmationOpen(false)}
        onOk={async () => {
          if (!device?.serial) return

          await deviceDisconnection.stopUsingDevice(device.serial)

          navigate(getMainRoute(), { replace: true })
        }}
      />
    </Flex>
  )
})
