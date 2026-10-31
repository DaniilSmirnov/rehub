// A device that leaves while someone is using it is usually rebooting. With the processor's
// --auto-restore-owner the departing owner is recorded on the device row as a claim
// (`restoreOwner`), and the device is handed back to them when its new worker reports ready.

// How long a device is held for its owner once it disappears, long enough for a reboot to finish
export const OWNER_CLAIM_TIMEOUT = 120_000

export interface OwnerClaim {
    email: string
    usage?: string | null
    // The lease timeout the owner had, in ms
    timeout?: number | null
    expiresAt: number
}

interface ClaimedDevice {
    owner?: unknown
    group?: {id?: string} | null
    restoreOwner?: OwnerClaim | null
}

interface ClaimUser {
    groups?: {subscribed?: string[]}
}

// The half of a claim that can be judged from the device row alone. A claim that fails this can
// never be honoured, so it is not holding the device either.
export function isClaimLive(device: ClaimedDevice | null | undefined, now: number): boolean {
    const claim = device?.restoreOwner
    if (!claim?.email) {
        return false
    }

    // Someone took the device while it was coming back
    if (device!.owner) {
        return false
    }

    // Negated so that a missing or unparseable expiresAt refuses rather than restores
    if (!(claim.expiresAt > now)) {
        return false
    }

    // The device can be moved out of its group while it is away
    return Boolean(device!.group?.id)
}

// A claim is honoured only if the user could still take the device as a fresh request
export function isRestorable(device: ClaimedDevice, user: ClaimUser | null | undefined, now: number): boolean {
    if (!user || !isClaimLive(device, now)) {
        return false
    }

    return (user.groups?.subscribed ?? []).includes(device.group!.id!)
}
