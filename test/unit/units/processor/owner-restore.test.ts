import {describe, expect, it, vi} from 'vitest'
import {restoreDeviceOwner} from '../../../../lib/units/processor/owner-restore.js'

const NOW = 1_000_000
const user = {email: 'u@x', name: 'u', group: 'ug', groups: {subscribed: ['g1']}, adbKeys: [{fingerprint: 'fp'}]}
const device = (restoreOwner: any, overrides: any = {}) =>
    ({serial: 's1', owner: null, group: {id: 'g1'}, restoreOwner, ...overrides})
const claim = {email: 'u@x', usage: 'automation', timeout: 900000, expiresAt: NOW + 1000}

const deps = (loaded: any = user) => ({
    loadUser: vi.fn(async () => loaded),
    clearClaim: vi.fn(async () => ({})),
    join: vi.fn(),
    log: {info: vi.fn(), important: vi.fn()},
    now: () => NOW
})

describe('restoreDeviceOwner', () => {
    it('does nothing for a device without a claim', async () => {
        const d = deps()
        expect(await restoreDeviceOwner(device(null), d)).toBe(false)
        expect(await restoreDeviceOwner(null, d)).toBe(false)
        expect(d.loadUser).not.toHaveBeenCalled()
        expect(d.clearClaim).not.toHaveBeenCalled()
        expect(d.join).not.toHaveBeenCalled()
    })

    it('joins the device back to its owner and keeps the claim until the join lands', async () => {
        const d = deps()
        expect(await restoreDeviceOwner(device(claim), d)).toBe(true)
        expect(d.loadUser).toHaveBeenCalledWith('u@x')
        expect(d.join).toHaveBeenCalledWith(user, claim)
        expect(d.clearClaim).not.toHaveBeenCalled()
    })

    it('drops an expired claim without reading the user', async () => {
        const d = deps()
        expect(await restoreDeviceOwner(device({...claim, expiresAt: NOW - 1}), d)).toBe(false)
        expect(d.loadUser).not.toHaveBeenCalled()
        expect(d.clearClaim).toHaveBeenCalledWith('s1')
        expect(d.join).not.toHaveBeenCalled()
    })

    it('drops the claim of a user who lost access to the device group', async () => {
        const d = deps({...user, groups: {subscribed: ['other']}})
        expect(await restoreDeviceOwner(device(claim), d)).toBe(false)
        expect(d.clearClaim).toHaveBeenCalledWith('s1')
        expect(d.join).not.toHaveBeenCalled()
    })

    it('drops the claim of a deleted user', async () => {
        const d = deps(null)
        expect(await restoreDeviceOwner(device(claim), d)).toBe(false)
        expect(d.clearClaim).toHaveBeenCalledWith('s1')
        expect(d.join).not.toHaveBeenCalled()
    })
})
