import {describe, expect, it} from 'vitest'
import {isEmailAllowed, isEmailInDomain} from '../../../../lib/units/auth/oauth2/email.js'

describe('OAuth 2.0 email check', () => {
    describe('isEmailInDomain', () => {
        it('accepts addresses in the domain', () => {
            expect(isEmailInDomain('user@example.org', 'example.org')).toBe(true)
        })

        it('accepts the domain written with a leading @', () => {
            expect(isEmailInDomain('user@example.org', '@example.org')).toBe(true)
        })

        it('accepts subdomains', () => {
            expect(isEmailInDomain('user@team.example.org', 'example.org')).toBe(true)
        })

        it('ignores case', () => {
            expect(isEmailInDomain('User@Example.ORG', 'example.org')).toBe(true)
        })

        it('rejects domains that only end with the same letters', () => {
            expect(isEmailInDomain('user@notexample.org', 'example.org')).toBe(false)
            expect(isEmailInDomain('user@notexample.org', '@example.org')).toBe(false)
        })

        it('only looks at the part after the last @', () => {
            expect(isEmailInDomain('example.org@attacker.test', 'example.org')).toBe(false)
            expect(isEmailInDomain('user@example.org.attacker.test', 'example.org')).toBe(false)
        })

        it('rejects addresses without a domain', () => {
            expect(isEmailInDomain('example.org', 'example.org')).toBe(false)
        })
    })

    describe('isEmailAllowed', () => {
        it('allows any address when no domain is configured', () => {
            expect(isEmailAllowed({email: 'user@anywhere.test'})).toBe(true)
        })

        it('rejects a profile without an email', () => {
            expect(isEmailAllowed({}, 'example.org')).toBe(false)
            expect(isEmailAllowed(undefined, 'example.org')).toBe(false)
        })

        it('rejects an email the provider reports as unverified', () => {
            const unverified = {email: 'user@example.org', email_verified: false}
            expect(isEmailAllowed(unverified, 'example.org')).toBe(false)
            expect(isEmailAllowed({...unverified, email_verified: 'false'})).toBe(false)
        })

        it('accepts a verified email in the domain', () => {
            const verified = {email: 'user@example.org', email_verified: true}
            expect(isEmailAllowed(verified, 'example.org')).toBe(true)
        })
    })
})
