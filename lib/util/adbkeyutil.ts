import crypto from 'node:crypto'
interface BigInteger {
    toString(radix: number): string
    bitLength(): number
}

// The parts used here of what adbkit's parsePublicKey hands out: an RSA key (node-forge) with the
// fingerprint a device shows
export interface AdbPublicKey {
    n: BigInteger
    e: BigInteger
    fingerprint: string
    comment: string
}

export interface StoredAdbKey {
    title?: string
    fingerprint: string
    publicKey?: string
}

const R32 = 1n << 32n

const toBigInt = (value: BigInteger): bigint => BigInt('0x' + value.toString(16))

const writeLittleEndian = (buffer: Buffer, offset: number, value: bigint, length: number) => {
    let rest = value
    for (let i = 0; i < length; i += 1) {
        buffer[offset + i] = Number(rest & 0xffn)
        rest >>= 8n
    }
}

/*
 * Turns a key parsed by adbkit back into the adb format it arrived in (~/.android/adbkey.pub).
 * adbkit only hands out the parsed key, but that format is what users paste and what the
 * fingerprint is taken from, so it is the one worth storing. The struct is the one adbkit's
 * parser reads: word count, n0inv, modulus, rr and exponent, all little endian.
 */
export const encodePublicKey = (parsed: {fingerprint: string, comment: string}): string => {
    // adbkit types the key without node-forge's fields
    const key = parsed as AdbPublicKey
    const n = toBigInt(key.n)
    const words = Math.ceil(key.n.bitLength() / 32)
    const len = words * 4

    // n0inv is -1 / n mod 2^32. n is odd, so Newton's iteration finds the inverse in five steps.
    const n0 = n % R32
    let inv = 1n
    for (let i = 0; i < 5; i += 1) {
        inv = ((inv * (2n - n0 * inv)) % R32 + R32) % R32
    }
    const n0inv = (R32 - inv) % R32
    const rr = (1n << BigInt(len * 8 * 2)) % n

    const struct = Buffer.alloc(4 + 4 + len + len + 4)
    struct.writeUInt32LE(words, 0)
    struct.writeUInt32LE(Number(n0inv), 4)
    writeLittleEndian(struct, 8, n, len)
    writeLittleEndian(struct, 8 + len, rr, len)
    struct.writeUInt32LE(Number(toBigInt(key.e)), 8 + len + len)

    const fingerprint = crypto.createHash('md5').update(struct).digest('hex').match(/../g)!.join(':')
    if (key.fingerprint && fingerprint !== key.fingerprint) {
        throw new Error('Re-encoded key does not match its fingerprint')
    }

    return struct.toString('base64') + (key.comment ? ' ' + key.comment : '')
}

// The owner's keys as a GroupMessage carries them: every fingerprint, and the full keys stored
export const ownerAdbKeys = (keys: StoredAdbKey[] | undefined | null): {keys: string[], publicKeys: string[]} => ({
    keys: (keys ?? []).map(key => key.fingerprint),
    publicKeys: (keys ?? []).flatMap(key => key.publicKey ? [key.publicKey] : [])
})
