import {Adb} from '@u4/adbkit'

interface AdbPublicKeyStore {
    setUserAdbPublicKey(email: string, fingerprint: string, publicKey: string): Promise<boolean>
}

interface AdbPublicKeyReport {
    email: string
    fingerprint: string
    publicKey: string
}

/*
 * Keys added by fingerprint alone, or before full keys were kept, get theirs the first time the
 * owner connects with them. The key comes from the device, so it has to hash to the fingerprint
 * it is filed under before it is trusted, and it only fills in a key the user already has.
 */
export const storeAdbPublicKey = async(users: AdbPublicKeyStore, message: AdbPublicKeyReport): Promise<boolean> => {
    const key = await Adb.util.parsePublicKey(message.publicKey)
    if (key.fingerprint !== message.fingerprint) {
        throw new Error('Public key does not match its fingerprint')
    }
    return users.setUserAdbPublicKey(message.email, message.fingerprint, message.publicKey)
}
