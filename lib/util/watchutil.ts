// Read-only viewing of devices under automation.
//
// A device reserved through the API carries usage "automation". Users who can see the device's
// group may watch its screen without taking it: the API checks access and hands out a short-lived
// watch token, and the device's screen stream accepts that token as a viewer for as long as the
// automation lease it was issued for lasts. Viewers never get input, and their stream messages
// cannot change the projection the owner sees.
import * as jwtutil from './jwtutil.js'

export const AUTOMATION_USAGE = 'automation'

// Only needs to outlive connecting to the screen; the stream itself ends with the automation lease
export const WATCH_TOKEN_TTL = 60_000

export interface WatchableDevice {
    serial: string
    present?: boolean
    ready?: boolean
    usage?: string | null
    owner?: {email?: string} | null
}

export interface ScreenLease {
    email: string
    usage?: string | null
}

export type ScreenRole = 'owner' | 'watcher'

export const isAutomated = (device: WatchableDevice | null | undefined): boolean =>
    Boolean(device?.present && device.ready && device.owner?.email && device.usage === AUTOMATION_USAGE)

export function encodeWatchToken(email: string, serial: string, secret: string, now = Date.now()): string {
    return jwtutil.encode({payload: {email, watch: serial}, secret, exp: now + WATCH_TOKEN_TTL})
}

// Decides what the bearer of a decoded screen token may do with the current lease. A watch token
// is bound to one device and is only good while that device is under automation.
export function screenRole(
    user: {email?: string, watch?: string} | null | undefined,
    serial: string,
    lease: ScreenLease | null | undefined
): ScreenRole | null {
    if (!user?.email || !lease) {
        return null
    }

    if (user.watch !== undefined) {
        return user.watch === serial && lease.usage === AUTOMATION_USAGE ? 'watcher' : null
    }

    return lease.email === user.email ? 'owner' : null
}
