import {describe, expect, it, vi} from 'vitest'
import {GroupManager} from '../../../../lib/units/base-device/plugins/group.js'

const inactivity = () => ({start: vi.fn(), stop: vi.fn(), keepalive: vi.fn()}) as any
const owner = (email: string) => ({email, name: email, group: `${email}-group`})

describe('GroupManager lease', () => {
    it('reports who holds the device and for what', () => {
        const group = new GroupManager(inactivity())
        expect(group.lease()).toBeNull()

        group.join(owner('ci@x'), 1000, 'automation', [])
        expect(group.lease()).toEqual({email: 'ci@x', usage: 'automation'})

        group.join(owner('u@x'), 1000, '', [])
        expect(group.lease()).toEqual({email: 'u@x', usage: null})

        group.leave('ungroup_request')
        expect(group.lease()).toBeNull()
    })

    it('reports a debug lease taken over remote ADB', async() => {
        const group = new GroupManager(inactivity())
        await group.joinExclusive(owner('dev@x'), [], 1000)
        expect(group.lease()).toEqual({email: 'dev@x', usage: 'debug'})

        await group.leaveExclusive('released')
        expect(group.lease()).toBeNull()
    })
})
