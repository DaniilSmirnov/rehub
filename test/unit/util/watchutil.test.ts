import {describe, expect, it} from 'vitest'
import * as jwtutil from '../../../lib/util/jwtutil.js'
import {encodeWatchToken, isAutomated, screenRole, WATCH_TOKEN_TTL} from '../../../lib/util/watchutil.js'

const SECRET = 'secret'

describe('isAutomated', () => {
    const device = (overrides = {}) =>
        ({serial: 's1', present: true, ready: true, usage: 'automation', owner: {email: 'ci@x'}, ...overrides})

    it('accepts a ready device reserved for automation', () => {
        expect(isAutomated(device())).toBe(true)
    })

    it.each([
        ['manual use', {usage: null}],
        ['a free device', {owner: null}],
        ['an absent device', {present: false}],
        ['a device that is not ready', {ready: false}]
    ])('rejects %s', (_name, overrides) => {
        expect(isAutomated(device(overrides))).toBe(false)
    })
})

describe('watch tokens', () => {
    it('carry the viewer and the one device they open, and expire', () => {
        const now = Date.now()
        const token = encodeWatchToken('viewer@x', 's1', SECRET, now)
        expect(jwtutil.decode(token, SECRET)).toEqual({email: 'viewer@x', watch: 's1'})
        expect(jwtutil.decode(encodeWatchToken('viewer@x', 's1', SECRET, now - WATCH_TOKEN_TTL - 1), SECRET)).toBeNull()
    })
})

describe('screenRole', () => {
    const automation = {email: 'ci@x', usage: 'automation'}

    it('lets the owner in with their session token', () => {
        expect(screenRole({email: 'ci@x'}, 's1', automation)).toBe('owner')
        expect(screenRole({email: 'me@x'}, 's1', {email: 'me@x', usage: null})).toBe('owner')
    })

    it('refuses anyone else with a session token', () => {
        expect(screenRole({email: 'viewer@x'}, 's1', automation)).toBeNull()
    })

    it('lets a watch token in only for its device while under automation', () => {
        expect(screenRole({email: 'viewer@x', watch: 's1'}, 's1', automation)).toBe('watcher')
        expect(screenRole({email: 'viewer@x', watch: 's2'}, 's1', automation)).toBeNull()
        expect(screenRole({email: 'viewer@x', watch: 's1'}, 's1', {email: 'u@x', usage: null})).toBeNull()
    })

    it('never makes the owner of a watch token the owner of the stream', () => {
        expect(screenRole({email: 'ci@x', watch: 's1'}, 's1', automation)).toBe('watcher')
    })

    it('refuses everyone on a free device', () => {
        expect(screenRole({email: 'ci@x'}, 's1', null)).toBeNull()
        expect(screenRole({email: 'viewer@x', watch: 's1'}, 's1', null)).toBeNull()
    })
})
