/*
 * ADB key updates on the users collection. Opt-in, against a throwaway database:
 *   MONGODB_INTEGRATION_TESTS=1 npx vitest run test/unit/db/user-adb-keys.integration.test.ts
 * MONGODB_PORT_27017_TCP points to the server (default mongodb://127.0.0.1:27017).
 */
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'

const enabled = process.env.MONGODB_INTEGRATION_TESTS === '1'

describe.skipIf(!enabled)('user ADB keys (real MongoDB)', () => {
    let db: any
    let users: any
    const keys = () => db.connection.collection('users').findOne({email: 'u@example.test'}).then((user: any) => user.adbKeys)

    beforeAll(async() => {
        process.env.MONGODB_DB_NAME = `devicehub_test_${process.pid}_${Date.now()}`
        db = (await import('../../../lib/db/index.js')).default
        users = await import('../../../lib/db/models/user/model.js')
        await db.connect()
    })

    afterAll(async() => {
        await db?.connection.dropDatabase()
        await db?.connection.client.close()
    })

    beforeEach(async() => {
        await db.connection.collection('users').deleteMany({})
        await db.connection.collection('users').insertOne({email: 'u@example.test', adbKeys: []})
    })

    it('keeps the full key when it is given', async() => {
        await users.insertUserAdbKey('u@example.test', {title: 't', fingerprint: 'aa', publicKey: 'KEY aa'})
        expect(await keys()).toEqual([{title: 't', fingerprint: 'aa', publicKey: 'KEY aa'}])
    })

    it('fills in the full key of a key added by its fingerprint, once', async() => {
        await users.insertUserAdbKey('u@example.test', {title: 'a', fingerprint: 'aa'})
        await users.insertUserAdbKey('u@example.test', {title: 'b', fingerprint: 'bb'})

        expect(await users.setUserAdbPublicKey('u@example.test', 'bb', 'KEY bb')).toBe(true)
        expect(await users.setUserAdbPublicKey('u@example.test', 'bb', 'OTHER')).toBe(false)
        expect(await users.setUserAdbPublicKey('u@example.test', 'cc', 'KEY cc')).toBe(false)

        expect(await keys()).toEqual([
            {title: 'a', fingerprint: 'aa'},
            {title: 'b', fingerprint: 'bb', publicKey: 'KEY bb'}
        ])
    })
})
