import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { deviceConnectionRequired } from '@/config/inversify/decorators'

import { GroupService } from './group-service'

@injectable()
@deviceConnectionRequired()
export class BookingService {
  constructor(
    @inject(CONTAINER_IDS.groupService) private groupService: GroupService,
    @inject(CONTAINER_IDS.deviceBySerialStore) private deviceBySerialStore: DeviceBySerialStore
  ) {
    makeAutoObservable(this)

    this.init()
  }

  async init(): Promise<void> {
    await this.deviceBySerialStore.fetch()
  }

  get bookedBeforeTime(): string {
    const device = this.deviceBySerialStore.deviceQueryResult().data

    if (!device?.owner || !device.statusChangedAt || !device.bookedBefore || device.bookedBefore <= 1) return ''

    const expireTime = new Date(device.statusChangedAt).getTime() + device.bookedBefore

    return Number.isFinite(expireTime) ? new Date(expireTime).toISOString() : ''
  }

  async reBookDevice(): Promise<void> {
    const device = await this.deviceBySerialStore.fetch()

    if (!device?.serial) return

    await this.groupService.invite(device.serial, device.group)
    await this.deviceBySerialStore.refetch()
  }
}
