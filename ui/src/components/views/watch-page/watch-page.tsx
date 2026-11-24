import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { View, Panel, Group, Header, Placeholder } from '@vkontakte/vkui'

import { getDeviceWatchToken } from '@/api/openstf-api'
import { WatchScreen, type WatchStatus } from '@/services/watch-screen/watch-screen'

import { queries } from '@/config/queries/query-key-store'

import styles from './watch-page.module.css'

const STATUS_TEXT: Record<WatchStatus, string> = {
  connecting: 'Connecting…',
  watching: 'View only',
  finished: 'Automation finished',
  denied: 'This device is not under automation',
  disconnected: 'Screen disconnected',
  unsupported: 'This browser cannot play the device screen',
}

/* Read-only view of a device under automation: no ownership, no input */
export const WatchPage = () => {
  const { t } = useTranslation()
  const { serial = '' } = useParams()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<WatchStatus>('connecting')
  const { data: device } = useQuery({ ...queries.devices.bySerial(serial), refetchOnWindowFocus: false })
  const url = device?.display?.url

  useEffect(() => {
    if (!url) return undefined

    const screen = new WatchScreen({
      status: setStatus,
      draw: (image) => {
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d')

        if (!canvas || !context) return

        if (canvas.width !== image.width || canvas.height !== image.height) {
          canvas.width = image.width
          canvas.height = image.height
        }

        context.drawImage(image, 0, 0)
      },
    })

    getDeviceWatchToken(serial)
      .then((token) => screen.open(url, token))
      .catch(() => setStatus('denied'))

    return () => screen.close()
  }, [serial, url])

  return (
    <View activePanel='watch'>
      <Panel id='watch'>
        <Group header={<Header size='s'>{device?.name || device?.model || serial}</Header>}>
          <div className={styles.status} data-status={status}>
            {t(STATUS_TEXT[status])}
          </div>
          {status === 'watching' ? (
            <canvas ref={canvasRef} className={styles.screen} />
          ) : (
            <Placeholder>{t(STATUS_TEXT[status])}</Placeholder>
          )}
        </Group>
      </Panel>
    </View>
  )
}
