// @ts-nocheck
import fs from 'fs'
import http from 'http'
import express from 'express'
import passport from 'passport'
import {Strategy as SamlStrategy} from '@node-saml/passport-saml'
import bodyParser from 'body-parser'
import logger from '../../util/logger.js'
import * as urlutil from '../../util/urlutil.js'
import * as jwtutil from '../../util/jwtutil.js'
import rateLimitConfig from '../ratelimit/index.js'
import db from '../../db/index.js'
import dbapi from '../../db/api.js'
import {ONE_DAY} from '../../util/apiutil.js'
const log = logger.createLogger('auth-saml2')

// passport-saml 5 requires idpCert and callbackUrl, and checks the response
// and assertion signatures unless told otherwise
export const samlConfig = function(saml) {
    const config = {
        entryPoint: saml.entryPoint,
        issuer: saml.issuer,
        callbackUrl: saml.callbackUrl,
        idpCert: fs.readFileSync(saml.certPath).toString(),
        wantAssertionsSigned: saml.wantAssertionsSigned ?? true,
        wantAuthnResponseSigned: saml.wantAuthnResponseSigned ?? true
    }
    if (saml.audience) {
        config.audience = saml.audience
    }
    return config
}

export const createApp = function(options) {
    var app = express()

    app.use(function(req, res, next) {
        res.setHeader('X-devicehub-unit', 'auth-saml2')
        next()
    })
    app.set('strict routing', true)
    app.set('case sensitive routing', true)
    app.use(bodyParser.urlencoded({extended: false}))
    app.use(rateLimitConfig)
    app.get('/auth/contact', function(req, res) {
        dbapi.getRootGroup().then(function(group) {
            res.status(200)
                .json({
                    success: true,
                    contact: group?.owner
                })
        })
            .catch(function(err) {
                log.error('Unexpected error', err.stack)
                res.status(500)
                    .json({
                        success: false,
                        error: 'ServerError'
                    })
            })
    })
    app.get('/auth/docs', function(req, res) {
        res.status(200)
            .json({
                success: true,
                docsUrl: options.docsUrl
            })
    })
    var verify = function(profile, done) {
        return done(null, profile)
    }
    var mySamlStrategy = new SamlStrategy(samlConfig(options.saml), verify)
    app.get('/auth/saml/metadata', function(req, res) {
        res.type('application/xml')
        res.send((mySamlStrategy.generateServiceProviderMetadata()))
    })
    passport.use(mySamlStrategy)
    app.use(passport.initialize())
    // Every route below starts or completes a login: plain requests such as /auth/docs go above
    app.use(passport.authenticate('saml', {
        failureRedirect: '/auth/saml/',
        session: false
    }))
    app.post('/auth/saml/callback', function(req, res) {
        if (req.user.email) {
            res.redirect(urlutil.addParams(options.appUrl, {
                jwt: jwtutil.encode({
                    payload: {
                        email: req.user.email,
                        name: req.user.email.split('@', 1).join('')
                    },
                    secret: options.secret,
                    header: {
                        exp: Date.now() + ONE_DAY
                    }
                })
            }))
        }
        else {
            log.warn('Missing email in profile', req.user)
            res.redirect('/auth/saml/')
        }
    })
    return app
}

export default (async function(options) {
    await db.connect()

    const server = http.createServer(createApp(options))
    server.listen(options.port)
    log.info('Listening on port %d', options.port)
})
