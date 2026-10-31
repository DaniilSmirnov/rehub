import client from 'prom-client'
import * as apiutil from './apiutil.js'
import {DeviceStatus} from '../wire/wire.js'

type Counts = Record<string, number>

export type DeviceState =
    'absent' | 'present' | 'offline' | 'unauthorized' | 'preparing' | 'unhealthy' | 'available' | 'busy'

export interface MetricsDevice {
    present?: boolean
    ready?: boolean
    status?: number
    manufacturer?: string
    owner?: object | null
    provider?: {name?: string} | null
}

export interface MetricsUser {
    privilege?: string
}

export interface MetricsGroup {
    isActive?: boolean
    state?: string
    class?: string
}

// Aggregate device states, computed the way the device list does (ui get-device-state.util.ts).
// 'using' and 'automation' are left out: they only make sense for a given user session.
export const DEVICE_STATES: DeviceState[] = [
    'absent', 'present', 'offline', 'unauthorized', 'preparing', 'unhealthy', 'available', 'busy'
]
export const GROUP_STATES = [apiutil.PENDING, apiutil.READY, apiutil.WAITING]
export const GROUP_CLASSES = Object.keys(apiutil.CLASS_DURATION)
export const USER_PRIVILEGES = [apiutil.ROOT, apiutil.ADMIN, apiutil.USER]

export const register = new client.Registry()

register.setDefaultLabels({app: 'rehub'})
client.collectDefaultMetrics({register})

const gauge = (name: string, help: string, labelNames: string[] = []) =>
    new client.Gauge({name, help, labelNames, registers: [register]})

export const gauges = {
    devicesTotal: gauge('rehub_devices_total', 'Number of devices known, whether they are present or not'),
    devicesByState: gauge('rehub_devices_by_state', 'Number of devices per aggregate device state', ['state']),
    devicesAvailable: gauge('rehub_devices_available', 'Number of devices in the available state'),
    devicesBusy: gauge('rehub_devices_busy', 'Number of devices in the busy state'),
    providersTotal: gauge('rehub_providers_total', 'Number of distinct providers serving at least one present device'),
    usersTotal: gauge('rehub_users_total', 'Number of users known'),
    usersByPrivilege: gauge('rehub_users_by_privilege', 'Number of users per privilege', ['privilege']),
    groupsTotal: gauge('rehub_groups_total', 'Number of groups known'),
    groupsActive: gauge('rehub_groups_active', 'Number of groups which are currently active'),
    groupsByState: gauge('rehub_groups_by_state', 'Number of groups per group state', ['state']),
    groupsByClass: gauge('rehub_groups_by_class', 'Number of groups per group class', ['class'])
}

const zeroFill = (values: string[]): Counts =>
    Object.fromEntries(values.map(value => [value, 0]))

// Counts only the known label values, so that a corrupted database row can't create an unbounded
// number of time series
const count = (counts: Counts, value: string | undefined) => {
    if (value !== undefined && Object.hasOwn(counts, value)) {
        counts[value] += 1
    }
}

const setLabeled = (target: client.Gauge, label: string, counts: Counts) => {
    target.reset()
    for (const [value, total] of Object.entries(counts)) {
        target.set({[label]: value}, total)
    }
}

export const deviceState = (device: MetricsDevice): DeviceState => {
    if (!device.present) {
        return 'absent'
    }
    switch (device.status) {
    case DeviceStatus.OFFLINE:
        return 'offline'
    case DeviceStatus.UNAUTHORIZED:
        return 'unauthorized'
    case DeviceStatus.UNHEALTHY:
        return 'unhealthy'
    case DeviceStatus.PREPARING:
        // An iPhone reports PREPARING while it is up and free
        return device.manufacturer === 'Apple' ? 'available' : 'present'
    case DeviceStatus.ONLINE:
        if (!device.ready) {
            return 'preparing'
        }
        return device.owner ? 'busy' : 'available'
    default:
        return 'present'
    }
}

export const aggregateDevices = (devices: MetricsDevice[]) => {
    const stats = {total: devices.length, available: 0, busy: 0, providers: 0, byState: zeroFill(DEVICE_STATES)}
    const providers = new Set<string>()

    for (const device of devices) {
        const state = deviceState(device)
        count(stats.byState, state)
        if (state === 'available') {
            stats.available += 1
        }
        if (state === 'busy') {
            stats.busy += 1
        }
        if (device.present && device.provider?.name) {
            providers.add(device.provider.name)
        }
    }
    stats.providers = providers.size
    return stats
}

export const aggregateUsers = (users: MetricsUser[]) => {
    const stats = {total: users.length, byPrivilege: zeroFill(USER_PRIVILEGES)}
    for (const user of users) {
        count(stats.byPrivilege, user.privilege)
    }
    return stats
}

export const aggregateGroups = (groups: MetricsGroup[]) => {
    const stats = {total: groups.length, active: 0, byState: zeroFill(GROUP_STATES), byClass: zeroFill(GROUP_CLASSES)}
    for (const group of groups) {
        if (group.isActive) {
            stats.active += 1
        }
        count(stats.byState, group.state)
        count(stats.byClass, group.class)
    }
    return stats
}

export const update = (devices: MetricsDevice[], users: MetricsUser[], groups: MetricsGroup[]) => {
    const deviceStats = aggregateDevices(devices)
    const userStats = aggregateUsers(users)
    const groupStats = aggregateGroups(groups)

    gauges.devicesTotal.set(deviceStats.total)
    gauges.devicesAvailable.set(deviceStats.available)
    gauges.devicesBusy.set(deviceStats.busy)
    gauges.providersTotal.set(deviceStats.providers)
    setLabeled(gauges.devicesByState, 'state', deviceStats.byState)

    gauges.usersTotal.set(userStats.total)
    setLabeled(gauges.usersByPrivilege, 'privilege', userStats.byPrivilege)

    gauges.groupsTotal.set(groupStats.total)
    gauges.groupsActive.set(groupStats.active)
    setLabeled(gauges.groupsByState, 'state', groupStats.byState)
    setLabeled(gauges.groupsByClass, 'class', groupStats.byClass)
}
