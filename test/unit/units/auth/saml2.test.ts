import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {AddressInfo} from 'node:net'
import type {Server} from 'node:http'
import {createApp, samlConfig} from '../../../../lib/units/auth/saml2.js'

describe('SAML 2.0 auth unit', () => {
    let dir: string
    let certPath: string
    let server: Server
    let base: string

    const saml = () => ({
        entryPoint: 'http://idp.test/sso',
        issuer: 'devicehub',
        certPath,
        callbackUrl: 'http://app.test/auth/saml/callback'
    })

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saml2-test-'))
        certPath = path.join(dir, 'idp.cert')
        fs.writeFileSync(certPath, 'MIIC-not-a-real-certificate')
    })

    afterAll(() => fs.rmSync(dir, {recursive: true, force: true}))

    beforeEach(async() => {
        const app = createApp({
            secret: 'secret',
            appUrl: 'http://app.test/',
            docsUrl: 'http://docs.test/',
            saml: saml()
        })
        server = app.listen(0)
        await new Promise(resolve => server.once('listening', resolve))
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterEach(() => new Promise<void>(resolve => server.close(() => resolve())))

    it('passes the certificate as idpCert and checks signatures by default', () => {
        expect(samlConfig(saml())).toEqual({
            entryPoint: 'http://idp.test/sso',
            issuer: 'devicehub',
            callbackUrl: 'http://app.test/auth/saml/callback',
            idpCert: 'MIIC-not-a-real-certificate',
            wantAssertionsSigned: true,
            wantAuthnResponseSigned: true
        })
    })

    it('passes the audience and signature settings through', () => {
        expect(samlConfig({
            ...saml(),
            audience: 'urn:devicehub',
            wantAssertionsSigned: false,
            wantAuthnResponseSigned: false
        })).toMatchObject({
            audience: 'urn:devicehub',
            wantAssertionsSigned: false,
            wantAuthnResponseSigned: false
        })
    })

    // The UI asks for it on every page: it must not start a login
    it('answers /auth/docs without going to the identity provider', async() => {
        const res = await fetch(`${base}/auth/docs`, {redirect: 'manual'})

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({success: true, docsUrl: 'http://docs.test/'})
    })

    it('serves the service provider metadata', async() => {
        const res = await fetch(`${base}/auth/saml/metadata`, {redirect: 'manual'})

        expect(res.status).toBe(200)
        expect(await res.text()).toContain('http://app.test/auth/saml/callback')
    })

    it('sends a login to the identity provider', async() => {
        const res = await fetch(`${base}/auth/saml/`, {redirect: 'manual'})

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toMatch(/^http:\/\/idp\.test\/sso\?SAMLRequest=/)
    })
})
