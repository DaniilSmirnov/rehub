import logger from './logger.js'
import {isClaimLive} from './owner-claim.js'
var log = logger.createLogger('util:deviceutil')
var deviceutil = Object.create(null)
deviceutil.isOwnedByUser = function(device, user) {
    return device.present &&
        device.ready &&
        device.owner &&
        (device.owner.email === user.email || user.privilege === 'admin') &&
        device.using
}
deviceutil.isAddable = function(device, user) {
    return device.present &&
        device.ready &&
        !device.using &&
        !device.owner &&
        // Held for whoever is coming back to it after a reboot: ready and unowned, but not free
        !device.claimed &&
        !isClaimLive(device, Date.now())
}

/** @returns {() => void} stop */
deviceutil.progressUp = (sendProgress, value = 0, incr = 10, max = 50) => {
    let timer
    const loop = () => {
        timer = setTimeout(() => {
            value += incr
            if (value >= max) {
                sendProgress('pushing_app', max)
                return
            }
            sendProgress('pushing_app', value)
            loop()
        }, 500)
    }
    loop()
    return () => clearTimeout(timer)
}
export default deviceutil
