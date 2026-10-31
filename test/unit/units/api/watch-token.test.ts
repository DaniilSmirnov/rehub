import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../lib/db/api.js', () => ({default: {loadDevice: vi.fn()}}))

import dbapi from '../../../../lib/db/api.js'
import * as jwtutil from '../../../../lib/util/jwtutil.js'
import {getDeviceWatchToken} from '../../../../lib/units/api/controllers/devices.js'

const response = () => {
    const res = {status: vi.fn(), json: vi.fn(), setHeader: vi.fn()}
    res.status.mockReturnValue(res)
    return res
}
const request = () => ({
    params: {serial: 's1'},
    user: {email: 'viewer@x', groups: {subscribed: ['g1']}},
    options: {secret: 'secret'}
})
const automated = {serial: 's1', present: true, ready: true, usage: 'automation', owner: {email: 'ci@x'}}

describe('GET /devices/{serial}/watch', () => {
    beforeEach(() => vi.mocked(dbapi.loadDevice).mockReset())

    it('issues a watch token for a device under automation in a group the user can see', async() => {
        vi.mocked(dbapi.loadDevice).mockResolvedValue(automated)
        const res = response()
        await getDeviceWatchToken(request(), res)

        expect(dbapi.loadDevice).toHaveBeenCalledWith(['g1'], 's1')
        expect(res.status).toHaveBeenCalledWith(200)
        const {token} = res.json.mock.calls[0][0]
        expect(jwtutil.decode(token, 'secret')).toEqual({email: 'viewer@x', watch: 's1'})
    })

    it('refuses a device used by hand', async() => {
        vi.mocked(dbapi.loadDevice).mockResolvedValue({...automated, usage: null})
        const res = response()
        await getDeviceWatchToken(request(), res)

        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.json.mock.calls[0][0]).not.toHaveProperty('token')
    })

    it('answers 404 for a device outside the user groups', async() => {
        vi.mocked(dbapi.loadDevice).mockResolvedValue(null)
        const res = response()
        await getDeviceWatchToken(request(), res)

        expect(res.status).toHaveBeenCalledWith(404)
    })
})
