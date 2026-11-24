import {describe, expect, it, vi} from 'vitest'

vi.mock('../../../../lib/db/models/all/index.js', () => ({default: {loadDevices: vi.fn(async() => [
    {present: true, status: 3, ready: true, provider: {name: 'p1'}}
])}}))
vi.mock('../../../../lib/db/models/user/index.js', () => ({default: {getUsers: vi.fn(async() => [{privilege: 'admin'}])}}))
vi.mock('../../../../lib/db/models/group/index.js', () => ({default: {getGroups: vi.fn(async() => [])}}))

import {getMetrics} from '../../../../lib/units/api/controllers/metrics.js'

const response = () => {
    const res: any = {status: vi.fn(), json: vi.fn(), send: vi.fn(), set: vi.fn(), setHeader: vi.fn()}
    res.status.mockReturnValue(res)
    return res
}

describe('GET /metrics', () => {
    it('is refused to a plain user', async() => {
        const res = response()
        await getMetrics({user: {privilege: 'user'}}, res)

        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.send).not.toHaveBeenCalled()
    })

    it('serves the metrics to an administrator', async() => {
        const res = response()
        await getMetrics({user: {privilege: 'admin'}}, res)

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.set).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'))
        expect(res.send.mock.calls[0][0]).toContain('rehub_devices_available{app="rehub"} 1')
    })
})
