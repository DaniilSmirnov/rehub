// Experimental: run real iPhones from Linux with go-ios (https://github.com/danielpaulus/go-ios)
// instead of Xcode and idb, which only exist on macOS.
//
// With `--ios-backend go-ios` the worker starts a WebDriverAgent runner that is already signed and
// installed on the iPhone (`ios runwda`), reads device details with `ios info`, installs and
// launches apps with `ios install` / `ios launch`, and streams the system log with `ios syslog`.
// Ports are still forwarded over usbmuxd, which Linux provides. iOS 17 and later also need a
// running go-ios tunnel (`ios tunnel start`), see doc/ios-docs/ios-linux.md.
import {execFile, spawn, type ChildProcess} from 'node:child_process'

export type IosBackend = 'xcode' | 'go-ios'

export const IOS_BACKENDS: IosBackend[] = ['xcode', 'go-ios']

export interface GoIosOptions {
    goIosPath: string
    serial: string
}

export interface WdaRunnerOptions extends GoIosOptions {
    wdaBundleId: string
    wdaTestRunnerBundleId?: string
    wdaXctestConfig?: string
    wdaPort: number
    mjpegPort: number
}

// The shape of `idb describe --json` that the rest of the worker reads
export interface DeviceDescription {
    name?: string
    os_version?: string
    architecture?: string
    extended?: {device?: {ProductType?: string}}
}

const udidArg = (serial: string) => `--udid=${serial}`

export const listDevicesArgs = () => ['list']
export const infoArgs = (serial: string) => ['info', udidArg(serial)]
export const imageArgs = (serial: string) => ['image', 'auto', udidArg(serial)]
export const installArgs = (serial: string, path: string) => ['install', `--path=${path}`, udidArg(serial)]
export const launchArgs = (serial: string, bundleId: string) => ['launch', bundleId, udidArg(serial)]
export const uninstallArgs = (serial: string, bundleId: string) => ['uninstall', bundleId, udidArg(serial)]
export const syslogArgs = (serial: string) => ['syslog', '--nojson', udidArg(serial)]

// WDA listens on the device ports the worker forwards, the same numbers as the local ones
export const runWdaArgs = (o: WdaRunnerOptions) => [
    'runwda',
    `--bundleid=${o.wdaBundleId}`,
    `--testrunnerbundleid=${o.wdaTestRunnerBundleId || `${o.wdaBundleId}.xctrunner`}`,
    `--xctestconfig=${o.wdaXctestConfig || 'WebDriverAgentRunner.xctest'}`,
    `--env=USE_PORT=${o.wdaPort}`,
    `--env=MJPEG_SERVER_PORT=${o.mjpegPort}`,
    udidArg(o.serial)
]

// Maps `ios info` onto the fields read from `idb describe`
export const describeFromInfo = (info: any): DeviceDescription => {
    const productName = info?.ProductName === 'iPhone OS' ? 'iOS' : info?.ProductName || 'iOS'
    return {
        name: info?.DeviceName,
        os_version: info?.ProductVersion ? `${productName} ${info.ProductVersion}` : undefined,
        architecture: info?.CPUArchitecture,
        extended: {device: {ProductType: info?.ProductType}}
    }
}

export const runGoIos = (goIosPath: string, args: string[], timeout = 180_000): Promise<string> =>
    new Promise((resolve, reject) => {
        execFile(goIosPath, args, {timeout, maxBuffer: 16 * 1024 * 1024}, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${goIosPath} ${args[0]} failed: ${stderr?.toString().trim() || error.message}`))
                return
            }
            resolve(stdout.toString())
        })
    })

// go-ios prints one JSON document; some commands print log lines before it
export const parseJsonOutput = (output: string): any => {
    const lines = output.trim().split('\n').reverse()
    for (const line of lines) {
        try {
            return JSON.parse(line)
        }
        catch {
            // not the result line
        }
    }
    throw new Error(`Unexpected go-ios output: ${output.slice(0, 200)}`)
}

// `ios list` prints {"deviceList": ["<udid>", ...]}
export const parseDeviceList = (output: string): string[] => {
    const list = parseJsonOutput(output)?.deviceList
    return Array.isArray(list) ? list.filter((udid: unknown): udid is string => typeof udid === 'string' && !!udid) : []
}

export const describeDevice = async(o: GoIosOptions): Promise<DeviceDescription> =>
    describeFromInfo(parseJsonOutput(await runGoIos(o.goIosPath, infoArgs(o.serial), 30_000)))

// Developer disk images are needed for XCTest; already mounted images are not an error
export const mountDeveloperImage = (o: GoIosOptions) =>
    runGoIos(o.goIosPath, imageArgs(o.serial), 180_000)

export interface WdaRunner {
    process: ChildProcess
    stop: () => Promise<void>
}

export const startWdaRunner = (o: WdaRunnerOptions, start = spawn): WdaRunner => {
    const process = start(o.goIosPath, runWdaArgs(o), {stdio: ['ignore', 'pipe', 'pipe']})
    const stop = () => new Promise<void>(resolve => {
        if (process.exitCode !== null || process.signalCode !== null) {
            resolve()
            return
        }
        const timer = setTimeout(() => process.kill('SIGKILL'), 10_000)
        process.once('exit', () => {
            clearTimeout(timer)
            resolve()
        })
        process.kill('SIGTERM')
    })
    return {process, stop}
}
