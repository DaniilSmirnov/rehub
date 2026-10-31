import EventEmitter from 'node:events'
import logger from './logger.ts'

const log = logger.createLogger('util:lifecycle')

type LifecycleObserver = () => Promise<unknown> | unknown

// How long the observers get in total before the process leaves without them. Kept above the
// provider's 30s kill timeout, so that a provider still waits for its device processes to exit.
const SHUTDOWN_TIMEOUT = 60000

export default new (class Lifecycle {
    cleanups: LifecycleObserver[] = []
    cleanupsFatal: LifecycleObserver[] = []
    ending = false
    shutdownTimeout = SHUTDOWN_TIMEOUT

    constructor() {
        process.on("SIGINT", this.graceful.bind(this))
        process.on("SIGTERM", this.graceful.bind(this))
    }

    share(name: string, emitter: EventEmitter) {
        emitter.on("end", () => {
            if (!this.ending) {
                log.fatal(`${name} ended we shall share its fate`)
                this.fatal()
            }
        })

        emitter.on("error", (err) => {
            if (!this.ending) {
                log.fatal(`${name} had an error ${err.stack}`)
                this.fatal()
            }
        })

        if ('end' in emitter) {
            this.observe(() => {
                if(typeof emitter.end === 'function') {
                    emitter.end()
                }
            })
        }
        return emitter
    }

    graceful(err: Error) {
        log.info(`Winding down for graceful exit ${err || ''}`)
        if (this.ending) {
            log.error(
                "Repeated gracefull shutdown request. Exiting immediately."
            )
            process.exit(1)
        }

        this.ending = true
        return this.settle(this.cleanups).then(() =>
            process.exit(0)
        )
    }

    // @ts-ignore
    fatal(err?: Error | string): never {
        log.fatal(`Shutting down due to fatal error ${err || ''}`)
        this.ending = true
        // process.exit(1)
        this.settle(this.cleanupsFatal).then(() =>
            process.exit(1)
        )
    }

    // Runs every observer and resolves once they are all done with, however they end. One
    // observer that throws or never settles would otherwise keep the whole unit alive; a
    // shutdown is not the place to insist every last thing succeeded.
    settle(observers: LifecycleObserver[]): Promise<void> {
        const timeout = this.shutdownTimeout
        let timer: NodeJS.Timeout | undefined

        const all = Promise.all(observers.map(async(fn) => {
            try {
                await fn()
            }
            catch (err: any) {
                log.error(`Shutdown observer failed ${err?.stack || err}`)
            }
        })).then(() => {})

        const deadline = new Promise<void>((resolve) => {
            timer = setTimeout(() => {
                log.warn(`Shutdown observers did not finish in ${timeout}ms; exiting anyway`)
                resolve()
            }, timeout)
        })

        return Promise.race([all, deadline]).finally(() => clearTimeout(timer))
    }

    observe(cleanupFn: LifecycleObserver) {
        this.cleanups.push(cleanupFn)
    }

    observeFatal(cleanupFn: LifecycleObserver) {
        this.cleanupsFatal.push(cleanupFn)
    }
})()
