import {describe, expect, it} from 'vitest'
import * as metrics from '../../../lib/util/metrics.js'
import {DeviceStatus} from '../../../lib/wire/wire.js'

const online = {present: true, status: DeviceStatus.ONLINE, ready: true}

describe('metrics', () => {
    describe('deviceState', () => {
        it('tells the device states apart like the device list does', () => {
            expect(metrics.deviceState({present: false, status: DeviceStatus.ONLINE})).toBe('absent')
            expect(metrics.deviceState({present: true, status: DeviceStatus.OFFLINE})).toBe('offline')
            expect(metrics.deviceState({present: true, status: DeviceStatus.UNAUTHORIZED})).toBe('unauthorized')
            expect(metrics.deviceState({present: true, status: DeviceStatus.UNHEALTHY})).toBe('unhealthy')
            expect(metrics.deviceState({...online, ready: false})).toBe('preparing')
            expect(metrics.deviceState(online)).toBe('available')
            expect(metrics.deviceState({...online, owner: {email: 'u@x'}})).toBe('busy')
            expect(metrics.deviceState({present: true, status: DeviceStatus.CONNECTING})).toBe('present')
        })

        it('counts a free iPhone as available', () => {
            expect(metrics.deviceState({present: true, status: DeviceStatus.PREPARING, manufacturer: 'Apple'}))
                .toBe('available')
        })
    })

    it('aggregates devices and counts the providers of present devices once', () => {
        const stats = metrics.aggregateDevices([
            {...online, provider: {name: 'p1'}},
            {...online, owner: {}, provider: {name: 'p1'}},
            {...online, provider: {name: 'p2'}},
            {present: false, provider: {name: 'p3'}}
        ])

        expect(stats).toMatchObject({total: 4, available: 2, busy: 1, providers: 2})
        expect(stats.byState).toMatchObject({available: 2, busy: 1, absent: 1, offline: 0})
    })

    it('ignores unknown label values', () => {
        const users = metrics.aggregateUsers([{privilege: 'admin'}, {privilege: 'user'}, {privilege: 'bogus'}])
        expect(users.total).toBe(3)
        expect(users.byPrivilege).toEqual({root: 0, admin: 1, user: 1})

        const groups = metrics.aggregateGroups([
            {isActive: true, state: 'ready', class: 'once'},
            {isActive: false, state: 'nope', class: 'nope'}
        ])
        expect(groups).toMatchObject({total: 2, active: 1})
        expect(groups.byState).toEqual({pending: 0, ready: 1, waiting: 0})
        expect(groups.byClass.once).toBe(1)
        expect(Object.keys(groups.byClass)).not.toContain('nope')
    })

    it('exposes the counts in the Prometheus format', async() => {
        metrics.update([{...online, provider: {name: 'p1'}}], [{privilege: 'admin'}], [])
        const body = await metrics.register.metrics()

        expect(body).toContain('rehub_devices_total{app="rehub"} 1')
        expect(body).toContain('rehub_devices_by_state{state="available",app="rehub"} 1')
        expect(body).toContain('rehub_providers_total{app="rehub"} 1')
        expect(body).toContain('rehub_users_by_privilege{privilege="admin",app="rehub"} 1')
        expect(body).toContain('process_cpu_user_seconds_total')
    })
})
