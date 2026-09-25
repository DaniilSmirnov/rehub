import {describe, expect, it} from 'vitest'
import yargs from 'yargs/yargs'
import * as authOpenid from '../../../lib/cli/auth-openid/index.js'
import * as authOauth2 from '../../../lib/cli/auth-oauth2/index.js'

function parseOptions(
    command: {command: string; builder: (yargs: ReturnType<typeof yargs>) => unknown},
    args: string[]
) {
    return yargs(args)
        .command({
            command: command.command,
            builder: command.builder as never,
            handler: () => {}
        })
        .exitProcess(false)
        .parseSync()
}

describe('auth command flags', () => {
    it('accepts all required auth-openid command-line flags', () => {
        const argv = parseOptions(authOpenid, [
            'auth-openid',
            '--app-url', 'http://devicehub:7100',
            '--secret', 'secret',
            '--openid-identifier-url', 'https://identity.example.com',
            '--openid-client-id', 'client-id',
            '--openid-client-secret', 'client-secret'
        ])

        expect(argv).toMatchObject({
            appUrl: 'http://devicehub:7100',
            secret: 'secret',
            openidIdentifierUrl: 'https://identity.example.com',
            openidClientId: 'client-id',
            openidClientSecret: 'client-secret'
        })
    })

    it('accepts all required auth-oauth2 command-line flags', () => {
        const argv = parseOptions(authOauth2, [
            'auth-oauth2',
            '--app-url', 'http://devicehub:7100',
            '--secret', 'secret',
            '--oauth-authorization-url', 'https://identity.example.com/authorize',
            '--oauth-token-url', 'https://identity.example.com/token',
            '--oauth-userinfo-url', 'https://identity.example.com/userinfo',
            '--oauth-client-id', 'client-id',
            '--oauth-client-secret', 'client-secret',
            '--oauth-callback-url', 'http://devicehub:7100/auth/oauth/callback',
            '--oauth-scope', 'openid profile email'
        ])

        expect(argv).toMatchObject({
            appUrl: 'http://devicehub:7100',
            secret: 'secret',
            oauthAuthorizationUrl: 'https://identity.example.com/authorize',
            oauthTokenUrl: 'https://identity.example.com/token',
            oauthUserinfoUrl: 'https://identity.example.com/userinfo',
            oauthClientId: 'client-id',
            oauthClientSecret: 'client-secret',
            oauthCallbackUrl: 'http://devicehub:7100/auth/oauth/callback',
            oauthScope: 'openid profile email'
        })
    })
})
