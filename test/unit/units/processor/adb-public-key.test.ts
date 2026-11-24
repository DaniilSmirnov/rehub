import {describe, expect, it, vi} from 'vitest'
import {Adb} from '@u4/adbkit'
import {storeAdbPublicKey} from '../../../../lib/units/processor/adb-public-key.js'
import {publicKey} from '../../util/adbkeyutil.test.js'

describe('processor: storing reported ADB public keys', () => {
    it('stores a key that hashes to its fingerprint', async() => {
        const {fingerprint} = await Adb.util.parsePublicKey(publicKey)
        const users = {setUserAdbPublicKey: vi.fn(async() => true)}

        await expect(storeAdbPublicKey(users, {email: 'user@example.test', fingerprint, publicKey})).resolves.toBe(true)
        expect(users.setUserAdbPublicKey).toHaveBeenCalledWith('user@example.test', fingerprint, publicKey)
    })

    it('refuses a key filed under another fingerprint', async() => {
        const users = {setUserAdbPublicKey: vi.fn(async() => true)}

        await expect(storeAdbPublicKey(users, {
            email: 'user@example.test',
            fingerprint: '00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff',
            publicKey
        })).rejects.toThrow(/fingerprint/)
        expect(users.setUserAdbPublicKey).not.toHaveBeenCalled()
    })

    it('refuses something that is not a key', async() => {
        const users = {setUserAdbPublicKey: vi.fn(async() => true)}

        await expect(storeAdbPublicKey(users, {email: 'user@example.test', fingerprint: 'aa', publicKey: 'nope'}))
            .rejects.toThrow()
        expect(users.setUserAdbPublicKey).not.toHaveBeenCalled()
    })
})
