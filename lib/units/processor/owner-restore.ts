// Hands a device that only left to reboot back to whoever was using it, by replaying the join its
// dead worker can no longer do. Settles the claim either way, so it never outlives one boot.
import {isClaimLive, isRestorable, type OwnerClaim} from '../../util/owner-claim.js'

interface RestoreUser {
    email: string
    name: string
    group: string
    groups?: {subscribed?: string[]}
    adbKeys?: Array<{fingerprint: string, publicKey?: string}>
}

export interface OwnerRestoreDeps {
    loadUser: (email: string) => Promise<RestoreUser | null | undefined>
    clearClaim: (serial: string) => Promise<unknown>
    // Sends the device a GroupMessage on behalf of the user
    join: (user: RestoreUser, claim: OwnerClaim) => void
    log: {info: (...args: any[]) => void, important: (...args: any[]) => void}
    now?: () => number
}

export async function restoreDeviceOwner(device: any, deps: OwnerRestoreDeps): Promise<boolean> {
    const claim: OwnerClaim | null | undefined = device?.restoreOwner
    if (!claim) {
        return false
    }

    const now = (deps.now ?? Date.now)()

    // Everything but the user's group access is on the row already, so an expired or superseded
    // claim is dropped without a users read
    if (!isClaimLive(device, now)) {
        deps.log.info('Not restoring device "%s" to "%s"', device.serial, claim.email)
        await deps.clearClaim(device.serial)
        return false
    }

    // The claim stays on the row until the join lands and clears it, because it is what stops the
    // device being handed to someone else between being ready and being owned again
    const user = await deps.loadUser(claim.email)
    if (!user || !isRestorable(device, user, now)) {
        deps.log.info('Not restoring device "%s" to "%s"', device.serial, claim.email)
        await deps.clearClaim(device.serial)
        return false
    }

    deps.log.important('Restoring device "%s" to "%s"', device.serial, user.email)
    deps.join(user, claim)
    return true
}
