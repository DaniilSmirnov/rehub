import {describe, expect, it} from 'vitest'
import {checkCleanupFolders, entriesToRemove} from '../../../../lib/units/device/plugins/util/cleanup-folders.js'

describe('cleanup folders', () => {
    it('cleans nothing when no folder is given', () => {
        expect(checkCleanupFolders()).toEqual([])
        expect(checkCleanupFolders([])).toEqual([])
    })

    it('normalizes the folders', () => {
        expect(checkCleanupFolders(['/sdcard/Download/', '/data/local//tmp', '/sdcard/x/../Pictures']))
            .toEqual(['/sdcard/Download', '/data/local/tmp', '/sdcard/Pictures'])
    })

    it('refuses system folders and their subfolders', () => {
        expect(() => checkCleanupFolders(['/system'])).toThrow(/not allowed/)
        expect(() => checkCleanupFolders(['/system/app'])).toThrow(/not allowed/)
        expect(() => checkCleanupFolders(['/sdcard/../proc/self'])).toThrow(/not allowed/)
    })

    it('does not mistake a folder that only starts with the same letters for a system one', () => {
        expect(checkCleanupFolders(['/systemless'])).toEqual(['/systemless'])
    })

    it('refuses the root and relative folders', () => {
        expect(() => checkCleanupFolders(['/'])).toThrow(/not allowed/)
        expect(() => checkCleanupFolders(['//'])).toThrow(/not allowed/)
        expect(() => checkCleanupFolders(['sdcard/Download'])).toThrow(/not allowed/)
    })

    it('removes every entry but . and .. and the service files', () => {
        expect(entriesToRemove('/data/local/tmp', [
            '.', '..', 'minicap', 'minicap.so', 'minicap.apk', 'minitouch', 'minirev',
            'devicehub-scrcpy-server-3.3.jar', 'install_app.apk', 'minicap_1.jpg', 'test-report'
        ])).toEqual([
            '/data/local/tmp/install_app.apk',
            '/data/local/tmp/minicap_1.jpg',
            '/data/local/tmp/test-report'
        ])
    })
})
