import { memo } from 'react'
import cn from 'classnames'
import { useColorScheme } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import ReHubIcon from '@/assets/re-hub.svg?react'
import EmulatorHubIcon from '@/assets/emulator-hub.svg?react'

import styles from './dynamic-logo.module.css'

type DynamicLogoProps = {
  width?: number
  height?: number
  className?: string
  logoType?: 'reHub' | 'emulatorHub'
}

export const DynamicLogo = memo(({ width, height, className, logoType = 'reHub' }: DynamicLogoProps) => {
  const colorScheme = useColorScheme()

  return (
    <>
      <ConditionalRender conditions={[logoType === 'reHub']}>
        <ReHubIcon
          className={cn(className, { [styles.darkLogo]: colorScheme === 'dark' })}
          height={height}
          title='reHub'
          width={width}
        />
      </ConditionalRender>
      <ConditionalRender conditions={[logoType === 'emulatorHub']}>
        <EmulatorHubIcon
          className={cn(className, { [styles.darkLogo]: colorScheme === 'dark' })}
          height={height}
          title='EmulatorHub'
          width={width}
        />
      </ConditionalRender>
    </>
  )
})
