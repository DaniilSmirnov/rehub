import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../../../lib/db/api.js', () => ({
    default: {
        loadDeviceBySerial: vi.fn(),
        loadUser: vi.fn(),
        loadAccessTokenById: vi.fn()
    }
}))

import dbapi from '../../../../lib/db/api.js'
import * as jwtutil from '../../../../lib/util/jwtutil.js'
import {accessTokenAuth} from '../../../../lib/units/api/helpers/securityHandlers.js'

const secret = 'secret'
const user = {email: 'owner@example.com', name: 'Owner', privilege: 'user'}

describe('accessTokenAuth', () => {
    beforeEach(() => {
        vi.mocked(dbapi.loadDeviceBySerial).mockResolvedValue({serial: 'S1', owner: user})
        vi.mocked(dbapi.loadUser).mockResolvedValue(user)
    })

    // Anyone can send these headers: they used to log in as the device owner
    it('rejects a request that only names a device and a channel', async() => {
        const req: any = {headers: {channel: 'any', device: 'S1'}, options: {secret}}

        await expect(accessTokenAuth(req)).rejects.toMatchObject({status: 401})
        expect(req.internalJwt).toBeUndefined()
        expect(dbapi.loadDeviceBySerial).not.toHaveBeenCalled()
    })

    // How a device reads a file from storage
    it('accepts a device request that carries the user token', async() => {
        const jwt = jwtutil.encode({payload: {email: user.email, name: user.name}, secret})
        const req: any = {
            headers: {channel: 'any', device: 'S1', authorization: `Bearer ${jwt}`},
            options: {secret}
        }

        await expect(accessTokenAuth(req)).resolves.toBe(true)
        expect(req.user).toBe(user)
        expect(req.internalJwt).toBe(jwt)
    })
})
