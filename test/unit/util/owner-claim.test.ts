import {describe, expect, it} from 'vitest'
import {isClaimLive, isRestorable} from '../../../lib/util/owner-claim.js'
import deviceutil from '../../../lib/util/deviceutil.js'
import datautil from '../../../lib/util/datautil.js'

const NOW = 1_000_000
const claimed = (overrides: any = {}) => ({
    serial: 's1',
    present: true,
    ready: true,
    using: false,
    owner: null,
    group: {id: 'g1'},
    restoreOwner: {email: 'u@x', usage: null, timeout: 900000, expiresAt: NOW + 1000},
    ...overrides
})

describe('isClaimLive', () => {
    it('holds an unowned device until the claim expires', () => {
        expect(isClaimLive(claimed(), NOW)).toBe(true)
        expect(isClaimLive(claimed(), NOW + 1000)).toBe(false)
    })

    it('does not hold a device without a claim', () => {
        expect(isClaimLive(claimed({restoreOwner: null}), NOW)).toBe(false)
        expect(isClaimLive(null, NOW)).toBe(false)
    })

    it('gives way to whoever took the device', () => {
        expect(isClaimLive(claimed({owner: {email: 'other@x'}}), NOW)).toBe(false)
    })

    it('refuses a claim without a valid expiry', () => {
        expect(isClaimLive(claimed({restoreOwner: {email: 'u@x'}}), NOW)).toBe(false)
        expect(isClaimLive(claimed({restoreOwner: {email: 'u@x', expiresAt: 'soon'}}), NOW)).toBe(false)
    })

    it('drops a claim on a device moved out of its group', () => {
        expect(isClaimLive(claimed({group: null}), NOW)).toBe(false)
    })
})

describe('isRestorable', () => {
    it('restores only to a user who can still use the device group', () => {
        expect(isRestorable(claimed(), {groups: {subscribed: ['g1']}}, NOW)).toBe(true)
        expect(isRestorable(claimed(), {groups: {subscribed: ['g2']}}, NOW)).toBe(false)
        expect(isRestorable(claimed(), {}, NOW)).toBe(false)
        expect(isRestorable(claimed(), null, NOW)).toBe(false)
    })

    it('does not restore an expired claim', () => {
        expect(isRestorable(claimed(), {groups: {subscribed: ['g1']}}, NOW + 5000)).toBe(false)
    })
})

describe('claimed devices', () => {
    const live = () => claimed({restoreOwner: {email: 'u@x', expiresAt: Date.now() + 60_000}})

    it('are not addable while held', () => {
        expect(deviceutil.isAddable(live())).toBe(false)
        expect(deviceutil.isAddable(claimed({restoreOwner: {email: 'u@x', expiresAt: Date.now() - 1}}))).toBe(true)
        expect(deviceutil.isAddable(claimed({restoreOwner: null}))).toBe(true)
    })

    it('report only that they are held, never for whom', () => {
        const device: any = live()
        datautil.normalize(device, {email: 'other@x'})
        expect(device.claimed).toBe(true)
        expect(device).not.toHaveProperty('restoreOwner')
        expect(deviceutil.isAddable(device)).toBe(false)
    })

    it('report an expired claim as not held', () => {
        const device: any = claimed({restoreOwner: {email: 'u@x', expiresAt: Date.now() - 1}})
        datautil.normalize(device, {email: 'other@x'})
        expect(device.claimed).toBe(false)
    })
})
