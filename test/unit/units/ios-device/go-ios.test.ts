import {EventEmitter} from 'node:events'
import {describe, expect, it, vi} from 'vitest'
import {
    describeFromInfo, installArgs, launchArgs, parseDeviceList, parseJsonOutput, runWdaArgs, startWdaRunner,
    syslogArgs, uninstallArgs
} from '../../../../lib/units/ios-device/support/go-ios.js'

const runner = {goIosPath: 'ios', serial: 'udid-1', wdaBundleId: 'com.example.WDA', wdaPort: 8100, mjpegPort: 9100}

describe('go-ios commands', () => {
    it('starts the installed WDA runner on the forwarded ports', () => {
        expect(runWdaArgs(runner)).toEqual([
            'runwda',
            '--bundleid=com.example.WDA',
            '--testrunnerbundleid=com.example.WDA.xctrunner',
            '--xctestconfig=WebDriverAgentRunner.xctest',
            '--env=USE_PORT=8100',
            '--env=MJPEG_SERVER_PORT=9100',
            '--udid=udid-1'
        ])
        expect(runWdaArgs({...runner, wdaTestRunnerBundleId: 'com.example.Runner', wdaXctestConfig: 'Runner.xctest'}))
            .toEqual(expect.arrayContaining(['--testrunnerbundleid=com.example.Runner', '--xctestconfig=Runner.xctest']))
    })

    it('passes app ids and paths as single arguments', () => {
        expect(installArgs('udid-1', '/tmp/a b.ipa')).toEqual(['install', '--path=/tmp/a b.ipa', '--udid=udid-1'])
        expect(launchArgs('udid-1', 'com.example.app')).toEqual(['launch', 'com.example.app', '--udid=udid-1'])
        expect(uninstallArgs('udid-1', 'com.example.app')).toEqual(['uninstall', 'com.example.app', '--udid=udid-1'])
        expect(syslogArgs('udid-1')).toEqual(['syslog', '--nojson', '--udid=udid-1'])
    })
})

describe('go-ios output', () => {
    it('reads the device list, ignoring log lines before it', () => {
        expect(parseDeviceList('{"level":"info","msg":"x"}\n{"deviceList":["a","b"]}\n')).toEqual(['a', 'b'])
        expect(parseDeviceList('{"deviceList":null}')).toEqual([])
    })

    it('fails on output without JSON', () => {
        expect(() => parseJsonOutput('no device')).toThrow(/Unexpected go-ios output/)
    })

    it('maps ios info onto the idb describe fields the worker reads', () => {
        expect(describeFromInfo({
            DeviceName: 'Test iPhone', ProductName: 'iPhone OS', ProductVersion: '17.5.1',
            ProductType: 'iPhone15,2', CPUArchitecture: 'arm64e'
        })).toEqual({
            name: 'Test iPhone',
            os_version: 'iOS 17.5.1',
            architecture: 'arm64e',
            extended: {device: {ProductType: 'iPhone15,2'}}
        })
    })
})

describe('WDA runner', () => {
    it('stops the runner process', async() => {
        const child = Object.assign(new EventEmitter(), {
            exitCode: null, signalCode: null,
            kill: vi.fn(() => queueMicrotask(() => child.emit('exit', 0)))
        })
        const spawn = vi.fn(() => child)
        const wda = startWdaRunner(runner, spawn as any)

        expect(spawn).toHaveBeenCalledWith('ios', runWdaArgs(runner), expect.anything())
        await wda.stop()
        expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    })
})
