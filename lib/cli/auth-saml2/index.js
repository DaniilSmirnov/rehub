import saml2 from '../../units/auth/saml2.js'
export const command = 'auth-saml2'
// Signatures are checked unless the legacy variable explicitly says "false"
const envFlag = value => value === undefined || !/^(false|0|no)$/i.test(value)
export const describe = 'Start a SAML 2.0 auth unit.'
export const builder = function(yargs) {
    return yargs
        .env('DH')
        .option('app-url', {
            alias: 'a',
            describe: 'URL to the app unit.',
            type: 'string',
            demand: true
        })
        .option('port', {
            alias: 'p',
            describe: 'The port to bind to.',
            type: 'number',
            default: process.env.PORT || 7120
        })
        .option('saml-id-provider-entry-point-url', {
            describe: 'SAML 2.0 identity provider URL.',
            type: 'string',
            default: process.env.SAML_ID_PROVIDER_ENTRY_POINT_URL,
            demand: true
        })
        .option('saml-id-provider-issuer', {
            describe: 'SAML 2.0 identity provider issuer.',
            type: 'string',
            default: process.env.SAML_ID_PROVIDER_ISSUER,
            demand: true
        })
        .option('saml-id-provider-cert-path', {
            describe: 'SAML 2.0 identity provider certificate file path.',
            type: 'string',
            default: process.env.SAML_ID_PROVIDER_CERT_PATH,
            demand: true
        })
        .option('saml-id-provider-callback-url', {
            describe: 'SAML 2.0 identity provider callback URL ' +
            'in the form of scheme://host[:port]/auth/saml/callback.',
            type: 'string',
            default: process.env.SAML_ID_PROVIDER_CALLBACK_URL,
            demand: true
        })
        .option('saml-id-provider-audience', {
            describe: 'SAML 2.0 audience expected in the assertions. ' +
            'Defaults to the issuer.',
            type: 'string',
            default: process.env.SAML_ID_PROVIDER_AUDIENCE
        })
        .option('saml-id-provider-want-assertions-signed', {
            describe: 'Whether the identity provider must sign the assertions. ' +
            'Negate with --no-saml-id-provider-want-assertions-signed.',
            type: 'boolean',
            default: envFlag(process.env.SAML_ID_PROVIDER_WANT_ASSERTIONS_SIGNED)
        })
        .option('saml-id-provider-want-authn-response-signed', {
            describe: 'Whether the identity provider must sign the authentication responses. ' +
            'Negate with --no-saml-id-provider-want-authn-response-signed.',
            type: 'boolean',
            default: envFlag(process.env.SAML_ID_PROVIDER_WANT_AUTHN_RESPONSE_SIGNED)
        })
        .option('secret', {
            alias: 's',
            describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
            'knows this token can freely enter the system if they want, so keep ' +
            'it safe.',
            type: 'string',
            default: process.env.SECRET,
            demand: true
        })
        .option('ssid', {
            alias: 'i',
            describe: 'The name of the session ID cookie.',
            type: 'string',
            default: process.env.SSID || 'ssid'
        })
        .option('support', {
            alias: 'sl',
            describe: 'url which needed to access support',
            type: 'string',
            default: 'example.com'
        })
        .option('docsUrl', {
            alias: 'du',
            describe: 'url which needed to access docs',
            type: 'string',
            default: 'example.com'
        })
        .epilog('Each option can be be overwritten with an environment variable ' +
        'by converting the option to uppercase, replacing dashes with ' +
        'underscores and prefixing it with `STF_AUTH_SAML2_` (e.g. ' +
        '`STF_AUTH_SAML2_SECRET`). Legacy environment variables like ' +
        'SAML_ID_PROVIDER_ISSUER are still accepted, too, but consider them ' +
        'deprecated.')
}
export const handler = function(argv) {
    return saml2({
        port: argv.port,
        secret: argv.secret,
        ssid: argv.ssid,
        appUrl: argv.appUrl,
        supportUrl: argv.support,
        docsUrl: argv.docsUrl,
        saml: {
            entryPoint: argv.samlIdProviderEntryPointUrl,
            issuer: argv.samlIdProviderIssuer,
            certPath: argv.samlIdProviderCertPath,
            callbackUrl: argv.samlIdProviderCallbackUrl,
            audience: argv.samlIdProviderAudience,
            wantAssertionsSigned: argv.samlIdProviderWantAssertionsSigned,
            wantAuthnResponseSigned: argv.samlIdProviderWantAuthnResponseSigned
        }
    })
}
