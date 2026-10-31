import {afterEach, describe, expect, it, vi} from 'vitest'
import lifecycle from '../../../lib/util/lifecycle.js'

describe('lifecycle.settle', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('waits for every observer', async() => {
        const done: string[] = []
        await lifecycle.settle([
            () => {
                done.push('sync')
            },
            async() => {
                await new Promise(resolve => setTimeout(resolve, 10))
                done.push('async')
            }
        ])

        expect(done.sort()).toEqual(['async', 'sync'])
    })

    it('does not let an observer that throws stop the others', async() => {
        const after = vi.fn()
        await expect(lifecycle.settle([
            () => {
                throw new Error('sync failure')
            },
            () => Promise.reject(new Error('async failure')),
            after
        ])).resolves.toBeUndefined()

        expect(after).toHaveBeenCalledOnce()
    })

    it('gives up on an observer that never settles', async() => {
        vi.useFakeTimers()
        let settled = false
        const settling = lifecycle.settle([() => new Promise(() => {})])
            .then(() => {
                settled = true
            })

        await vi.advanceTimersByTimeAsync(lifecycle.shutdownTimeout - 1)
        expect(settled).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        await settling
        expect(settled).toBe(true)
    })
})
