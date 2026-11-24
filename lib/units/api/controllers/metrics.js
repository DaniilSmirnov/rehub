import * as apiutil from '../../../util/apiutil.js'
import AllModel from '../../../db/models/all/index.js'
import UserModel from '../../../db/models/user/index.js'
import GroupModel from '../../../db/models/group/index.js'
import * as metrics from '../../../util/metrics.js'

const DEVICE_FIELDS = {present: 1, ready: 1, status: 1, manufacturer: 1, owner: 1, provider: 1}

// Counted on scrape rather than on a timer, so that the values are the ones of the very moment
// Prometheus asked for them
export async function getMetrics(req, res) {
    // The admin tag of the operation is only enforced by the security handler for access tokens,
    // not for browser sessions, hence this explicit check
    if (req.user.privilege === apiutil.USER) {
        return apiutil.respond(res, 403, 'Forbidden: privileged operation (admin)')
    }

    try {
        const [devices, users, groups] = await Promise.all([
            AllModel.loadDevices(undefined, DEVICE_FIELDS),
            UserModel.getUsers(),
            GroupModel.getGroups({})
        ])
        metrics.update(devices, users, groups)
        res.set('Content-Type', metrics.register.contentType)
        res.status(200).send(await metrics.register.metrics())
    }
    catch (err) {
        apiutil.internalError(res, 'Failed to get metrics: ', err.stack)
    }
}

export default {
    getMetrics
}
