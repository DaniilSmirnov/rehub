import { expect, test } from '@playwright/test'
import { DeviceHubDevicePage } from '../pageObjects/controlPage/devicePage'
import { freeDevice } from '../helpers/devicesHelper'
import { countCanvasColors } from '../helpers/utils/canvas'
import { nalUnitTypes, ScreenStreamRecorder } from '../helpers/utils/screenStream'

// devicehub runs with --need-scrcpy (DH_NEED_SCRCPY in docker-compose-e2e-tests.yaml):
// these tests check the screen comes as an H.264 stream and not as minicap JPEG frames
const deviceSerial = 'emulator-5554'
// Starting the scrcpy server on a software emulator takes a few seconds
const streamTimeout = 60_000

test.describe('scrcpy H.264 screen stream', () => {

    test.afterEach('Free device after test (via api)', async() => {
        await freeDevice(deviceSerial)
    })

    test('Browser can decode H.264 with WebCodecs', async ({ page }) => {
        await page.goto('/')
        const supported = await page.evaluate(async() => {
            if (typeof VideoDecoder === 'undefined') {
                return false
            }
            // Constrained Baseline 3.1: what any Android encoder can produce
            return (await VideoDecoder.isConfigSupported({ codec: 'avc1.42c01f' })).supported
        })
        expect(supported, 'the test browser has no H.264 WebCodecs decoder').toBe(true)
    })

    test('Device streams the screen as H.264', async ({ page }) => {
        const recorder = new ScreenStreamRecorder(page)
        const devicePage = new DeviceHubDevicePage(page, deviceSerial)
        await devicePage.gotoDevice(deviceSerial)
        await devicePage.isPageDisplayed()

        await expect.poll(() => recorder.current?.banner, { timeout: streamTimeout }).toBeTruthy()
        expect(recorder.stats().codec, 'device fell back to minicap').toBe('h264')

        // The stream starts with a session (frame size), the SPS/PPS and a key frame
        await expect.poll(() => recorder.stats().keyFrames, { timeout: streamTimeout }).toBeGreaterThan(0)
        const packets = recorder.current!.packets
        const session = packets.find(p => p.type === 'session')
        expect(session).toBeTruthy()
        if (session?.type === 'session') {
            expect(session.width).toBeGreaterThan(0)
            expect(session.height).toBeGreaterThan(0)
        }
        const config = packets.find(p => p.type === 'media' && p.config)
        expect(config?.type === 'media' && nalUnitTypes(config.payload)).toEqual(expect.arrayContaining([7, 8]))
        const keyFrame = packets.find(p => p.type === 'media' && !p.config && p.keyFrame)
        expect(keyFrame?.type === 'media' && nalUnitTypes(keyFrame.payload)).toContain(5)
        expect(recorder.stats().invalid, 'binary messages that are not scrcpy packets').toBe(0)

        // The browser decodes it: the canvas shows the device screen
        await expect.poll(() => countCanvasColors(devicePage.deviceScreen.deviceCanvas), { timeout: streamTimeout })
            .toBeGreaterThan(1)

        // A change on the screen arrives as new frames
        const framesBefore = recorder.stats().frames
        await devicePage.deviceScreen.swipeOnDeviceScreen()
        await expect.poll(() => recorder.stats().frames, { timeout: streamTimeout }).toBeGreaterThan(framesBefore)
    })

    test('Stream stops on release and starts again', async ({ page }) => {
        const recorder = new ScreenStreamRecorder(page)
        const devicePage = new DeviceHubDevicePage(page, deviceSerial)
        await devicePage.gotoDevice(deviceSerial)
        await devicePage.isPageDisplayed()
        await expect.poll(() => recorder.stats().keyFrames, { timeout: streamTimeout }).toBeGreaterThan(0)
        const first = recorder.current!

        // Releasing the device closes the stream and nothing arrives after it
        const mainPage = await devicePage.stopUse()
        await mainPage.isPageDisplayed()
        await expect.poll(() => first.closed, { timeout: streamTimeout }).toBe(true)
        const packetsAtClose = first.packets.length
        await page.waitForTimeout(2000)
        expect(first.packets.length).toBe(packetsAtClose)

        // The next session gets a new stream that starts from a key frame again.
        // The device is cleaned up after release, so it can take a moment to be usable
        await expect(async() => {
            await devicePage.gotoDevice(deviceSerial)
            await devicePage.isPageDisplayed()
        }).toPass({ timeout: streamTimeout })
        await expect.poll(() => recorder.current !== first, { timeout: streamTimeout }).toBe(true)
        expect(recorder.stats().codec).toBe('h264')
        await expect.poll(() => recorder.stats().keyFrames, { timeout: streamTimeout }).toBeGreaterThan(0)
        await expect.poll(() => countCanvasColors(devicePage.deviceScreen.deviceCanvas), { timeout: streamTimeout })
            .toBeGreaterThan(1)
    })
})
