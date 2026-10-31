import {afterEach, describe, expect, it, vi} from 'vitest'

const {execFile} = vi.hoisted(() => ({
    // The callback is the last argument, with or without options
    execFile: vi.fn((file: string, args: string[], ...rest: any[]) => rest[rest.length - 1](null, 'ok'))
}))
vi.mock('child_process', () => ({execFile}))
vi.mock('node:child_process', () => ({execFile, spawn: vi.fn()}))

import {installApp, launchApp, uninstallApp} from '../../../../../lib/units/ios-device/plugins/install.js'

afterEach(() => vi.clearAllMocks())

describe('iOS install plugin: idb calls', () => {
    it('passes the arguments to idb without a shell', async() => {
        await installApp('UDID-1', '/tmp/app.ipa')
        await launchApp('UDID-1', 'com.example.app')
        await uninstallApp('UDID-1', 'com.example.my_app-2')

        expect(execFile.mock.calls.map(call => [call[0], call[1]])).toEqual([
            ['idb', ['install', '/tmp/app.ipa', '--udid=UDID-1']],
            ['idb', ['launch', 'com.example.app', '--udid=UDID-1']],
            ['idb', ['uninstall', 'com.example.my_app-2', '--udid=UDID-1']]
        ])
    })

    it('refuses a bundle id that is not one', async() => {
        for (const bundleId of ['com.example; rm -rf ~', '$(id)', '--udid=OTHER', 'a..b', '', undefined]) {
            await expect(uninstallApp('UDID-1', bundleId)).rejects.toThrow(/Invalid bundle id/)
            await expect(launchApp('UDID-1', bundleId)).rejects.toThrow(/Invalid bundle id/)
        }
        expect(execFile).not.toHaveBeenCalled()
    })

    it('reports idb failures', async() => {
        execFile.mockImplementationOnce((file, args, ...rest: any[]) => rest[rest.length - 1](new Error('Command failed'), ''))
        await expect(uninstallApp('UDID-1', 'com.example.app')).rejects.toThrow('Command failed')
    })
})

describe('iOS install plugin: go-ios calls', () => {
    it('uses go-ios, still without a shell, when the go-ios backend is on', async() => {
        await installApp('UDID-1', '/tmp/app.ipa', 'ios')
        await launchApp('UDID-1', 'com.example.app', 'ios')
        await uninstallApp('UDID-1', 'com.example.app', 'ios')

        expect(execFile.mock.calls.map(call => [call[0], call[1]])).toEqual([
            ['ios', ['install', '--path=/tmp/app.ipa', '--udid=UDID-1']],
            ['ios', ['launch', 'com.example.app', '--udid=UDID-1']],
            ['ios', ['uninstall', 'com.example.app', '--udid=UDID-1']]
        ])
    })

    it('refuses a bundle id that is not one', async() => {
        await expect(uninstallApp('UDID-1', '--udid=OTHER', 'ios')).rejects.toThrow(/Invalid bundle id/)
        expect(execFile).not.toHaveBeenCalled()
    })
})
