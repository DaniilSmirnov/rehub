import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { observable, runInAction } from 'mobx'

vi.mock('@/services/group-service', () => ({ ['GroupService']: class {} }))
vi.mock('@/store/device-by-serial-store', () => ({ ['DeviceBySerialStore']: class {} }))

import { BookingService } from './booking-service'

const setup = () => {
  const state = observable({
    data: {
      serial: 'device',
      owner: { email: 'user@example.com' } as { email: string } | null,
      statusChangedAt: '2026-11-24T10:00:00.000Z',
      bookedBefore: 900_000,
      group: { id: 'root', origin: 'root' },
    },
  })
  const store = {
    fetch: vi.fn(async () => state.data),
    refetch: vi.fn(async () => ({ data: state.data })),
    deviceQueryResult: () => state,
  }
  const group = { invite: vi.fn(async () => undefined) }
  const service = new BookingService(group as never, store as never)

  return { service, state, store, group }
}

describe('BookingService', () => {
  it('shows live booking updates and clears the deadline on release', () => {
    const { service, state } = setup()
    expect(service.bookedBeforeTime).toBe('2026-11-24T10:15:00.000Z')
    runInAction(() => {
      state.data.statusChangedAt = '2026-11-24T10:10:00.000Z'
    })
    expect(service.bookedBeforeTime).toBe('2026-11-24T10:25:00.000Z')
    runInAction(() => {
      state.data.owner = null
    })
    expect(service.bookedBeforeTime).toBe('')
  })

  it.each([0, 1])('does not show an expiration for unlimited timeout %s', (timeout) => {
    const { service, state } = setup()
    runInAction(() => {
      state.data.bookedBefore = timeout
    })
    expect(service.bookedBeforeTime).toBe('')
  })

  it('refreshes after renewal completes and displays the renewed booking', async () => {
    const { service, state, store, group } = setup()
    group.invite.mockImplementation(async () => {
      runInAction(() => {
        state.data.statusChangedAt = '2026-11-24T10:10:00.000Z'
      })
    })
    store.refetch.mockImplementation(async () => {
      expect(group.invite).toHaveBeenCalledWith('device', state.data.group)
      expect(state.data.statusChangedAt).toBe('2026-11-24T10:10:00.000Z')

      return { data: state.data }
    })
    await service.reBookDevice()
    expect(store.refetch).toHaveBeenCalledTimes(1)
    expect(service.bookedBeforeTime).toBe('2026-11-24T10:25:00.000Z')
  })

  it('does not refresh or change the deadline after a failed renewal', async () => {
    const { service, store, group } = setup()
    group.invite.mockRejectedValue(new Error('offline'))
    await expect(service.reBookDevice()).rejects.toThrow('offline')
    expect(store.refetch).not.toHaveBeenCalled()
    expect(service.bookedBeforeTime).toBe('2026-11-24T10:15:00.000Z')
  })
})
