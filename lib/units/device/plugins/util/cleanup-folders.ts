import path from 'node:path'

// Never cleaned, so that a typo in the provider settings cannot wipe the system. It is still the
// admin's job to pick folders whose contents can go.
const PROTECTED_FOLDERS = ['/system', '/boot', '/proc', '/vendor', '/dev', '/sys', '/apex', '/product']

// What the device unit itself puts in /data/local/tmp and needs again for the next user
const SERVICE_FILE = /^(minicap|minicap\.so|minicap\.apk|minitouch|minirev|devicehub-scrcpy-server-.*\.jar)$/

// Normalizes the --cleanup-folder values and throws on any folder that is not safe to empty
export const checkCleanupFolders = (folders: string[] = []): string[] =>
    folders.map(folder => {
        const normalized = path.posix.normalize(String(folder)).replace(/\/+$/, '')
        if (!path.posix.isAbsolute(normalized) || normalized === '' || normalized === '/') {
            throw new Error(`Cleanup of "${folder}" is not allowed: give an absolute folder below /`)
        }
        if (PROTECTED_FOLDERS.some(system => normalized === system || normalized.startsWith(system + '/'))) {
            throw new Error(`Cleanup of system folder "${folder}" is not allowed`)
        }
        return normalized
    })

// The entries of a folder to remove: everything but . and .. and the unit's own service files
export const entriesToRemove = (folder: string, names: string[]): string[] =>
    names
        .filter(name => name !== '.' && name !== '..' && !SERVICE_FILE.test(name))
        .map(name => path.posix.join(folder, name))
