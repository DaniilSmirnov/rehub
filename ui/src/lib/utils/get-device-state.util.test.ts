import { describe, expect, it } from 'vitest'

import { DeviceState } from '@/types/enums/device-state.enum'

import { getDeviceState } from './get-device-state.util'

import type { Device } from '@/generated/types'

const device = (overrides: Partial<Device>): Device =>
  ({ present: true, status: 3, ready: true, using: false, owner: null, ...overrides }) as Device

describe('getDeviceState', () => {
  it('marks a device someone else automates as watchable, not just busy', () => {
    expect(getDeviceState(device({ owner: { email: 'ci@x' } as Device['owner'], usage: 'automation' }))).toBe(
      DeviceState.AUTOMATED
    )
  })

  it('keeps a device someone else uses by hand busy', () => {
    expect(getDeviceState(device({ owner: { email: 'u@x' } as Device['owner'], usage: null as never }))).toBe(
      DeviceState.BUSY
    )
  })

  it('keeps my own automation as automation', () => {
    expect(
      getDeviceState(device({ owner: { email: 'me@x' } as Device['owner'], using: true, usage: 'automation' }))
    ).toBe(DeviceState.AUTOMATION)
  })
})
