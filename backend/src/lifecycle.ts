/**
 * Boot probe and graceful shutdown (T-228).
 *
 * Two behaviours the API was missing:
 *   1. **Probe MySQL before opening the port.** Without it the process starts "fine"
 *      and every request fails with a 500 until someone looks at the logs.
 *   2. **Drain what we hold on SIGTERM.** `docker compose stop backend` (and any
 *      orchestrator) sends SIGTERM; without a handler Node exits immediately and the
 *      Prisma pool is never closed, so MySQL keeps the connections until they time out.
 *
 * This module deliberately imports nothing - no Prisma, no Express - so it can be
 * exercised on its own, including on Linux where SIGTERM is actually delivered. That
 * matters because **Node on Windows never emits SIGTERM** (only SIGINT/SIGBREAK):
 * the host-side check drives the same handler directly, while the container check
 * proves real signal delivery.
 */
import type { Server } from 'node:http';

/** How long a clean shutdown may take before the process is forced out. */
export const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);

/**
 * Boot-probe retries: a start may race MySQL, but a broken one must not hang.
 *
 * Three attempts is deliberate: `docker compose` already waits for
 * `mysql: service_healthy`, so this only absorbs a short race. A longer outage is the
 * restart policy's job (`restart: unless-stopped` re-probes on every start).
 */
export const BOOT_ATTEMPTS = Number(process.env.DB_BOOT_ATTEMPTS ?? 3);
export const BOOT_DELAY_MS = Number(process.env.DB_BOOT_DELAY_MS ?? 1_000);

/**
 * Upper bound for ONE probe attempt.
 *
 * The driver has its own connect timeout (`DB_CONNECT_TIMEOUT_MS`, 3 s), but a filtered
 * port - DROP instead of REJECT - can stall a TCP connect until the OS gives up, so each
 * attempt is bounded here too. Measured: the first version of this, without the bound,
 * took 32 s to report an unreachable database.
 */
export const BOOT_ATTEMPT_TIMEOUT_MS = Number(process.env.DB_BOOT_TIMEOUT_MS ?? 3_500);

/**
 * How long a *successfully drained* process may linger before it is forced out.
 *
 * Keep this comfortably below the runtime's stop grace period (Docker's default is 10 s)
 * or the orchestrator SIGKILLs first and reports exit 137 for a shutdown that worked.
 */
export const LINGERING_EXIT_MS = Number(process.env.SHUTDOWN_LINGER_MS ?? 2_000);

/** The part of `http.Server` this module needs (keeps it testable). */
export type CloseableServer = Pick<Server, 'close'> & Partial<Pick<Server, 'closeAllConnections'>>;

export interface ShutdownOptions {
    server: CloseableServer;
    /** Release everything the process holds - for this app, the Prisma pool. */
    onShutdown: () => Promise<void>;
    timeoutMs?: number;
    /**
     * Called after a clean drain. Defaults to setting `process.exitCode` - see the exit
     * strategy below for why this deliberately does not call `process.exit()`.
     */
    exit?: (code: number) => void;
    /** Called when the teardown is stuck and must be terminated. Defaults to `process.exit`. */
    forceExit?: (code: number) => void;
    /** How long a cleanly drained process may linger before `forceExit` is used. */
    lingeringMs?: number;
    /** Log prefix. */
    label?: string;
}

export type ShutdownHandler = (signal: string) => Promise<void>;

/**
 * Register SIGTERM/SIGINT handlers and return the handler (for tests).
 *
 * Order matters: stop accepting connections first, then drain. `closeAllConnections()`
 * is called straight after `close()` because keep-alive sockets - Socket.io clients,
 * curl reusing a connection - would otherwise hold `close()` open until they time out.
 * A not-yet-listening server (`ERR_SERVER_NOT_RUNNING`) is not an error: a SIGTERM
 * during the boot probe must still shut down cleanly.
 *
 * Exit strategy (measured on Windows): a clean shutdown must **not** call
 * `process.exit()`. Prisma's engine has a background thread that calls back into libuv
 * while the process tears down, and forcing the exit aborted the process with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c` (exit 127
 * instead of 0). Setting `process.exitCode` and letting the loop drain exits with the
 * same code, cleanly; the force timer stays as the backstop for a genuinely stuck
 * teardown.
 */
export function installShutdownHandlers(options: ShutdownOptions): ShutdownHandler {
    const label = options.label ?? 'water-ui';
    const exit = options.exit ?? ((code: number): void => {
        process.exitCode = code;
    });
    const forceExit = options.forceExit ?? ((code: number): void => process.exit(code));
    const lingeringMs = options.lingeringMs ?? LINGERING_EXIT_MS;
    const timeoutMs = options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
    let shuttingDown = false;

    const shutdown: ShutdownHandler = async (signal) => {
        if (shuttingDown) {
            console.warn(`[${label}] ${signal} received again while shutting down - ignored`);
            return;
        }

        shuttingDown = true;
        console.log(`[${label}] ${signal} received, shutting down`);

        const force = setTimeout(() => {
            console.error(`[${label}] shutdown did not finish within ${timeoutMs} ms - forcing exit`);
            forceExit(1);
        }, timeoutMs);
        // Do not let the guard itself keep the event loop alive.
        force.unref?.();

        let code = 0;

        try {
            await new Promise<void>((resolve, reject) => {
                options.server.close((error?: Error) => {
                    const notRunning = (error as NodeJS.ErrnoException | undefined)?.code === 'ERR_SERVER_NOT_RUNNING';

                    if (error && !notRunning) reject(error);
                    else resolve();
                });

                options.server.closeAllConnections?.();
            });

            await options.onShutdown();
            console.log(`[${label}] HTTP server closed, database pool drained`);
        } catch (error) {
            code = 1;
            console.error(`[${label}] shutdown failed: ${(error as Error).message}`);
        } finally {
            clearTimeout(force);
        }

        exit(code);

        if (code === 0) {
            // A successful drain does not guarantee an empty event loop - an engine.io
            // timer or a driver thread can still be ref'd. Measured in a container:
            // without this, `docker stop` waited out its grace period and SIGKILLed the
            // process (exit 137) even though the shutdown log said it had finished.
            // Unref'd, so a genuinely empty loop still exits immediately and cleanly;
            // this only fires when something is holding the process open.
            setTimeout(() => {
                console.error(`${label}: still running ${lingeringMs} ms after a clean shutdown - forcing exit 0`);
                forceExit(0);
            }, lingeringMs).unref?.();
        }
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    return shutdown;
}

/**
 * Run the boot probe with a bounded retry, then give up loudly.
 *
 * Throws the last error so the caller can exit non-zero; retrying is only there to
 * absorb the "container started a second before MySQL was ready" case. Each attempt is
 * bounded by `attemptTimeoutMs`, so the worst case is
 * `attempts × timeout + (attempts - 1) × delay` and never an open-ended wait.
 */
export async function probeDatabaseWithRetry(
    probe: () => Promise<unknown>,
    options?: { attempts?: number; delayMs?: number; attemptTimeoutMs?: number; label?: string }
): Promise<void> {
    const label = options?.label ?? 'db';
    const attempts = Math.max(1, options?.attempts ?? BOOT_ATTEMPTS);
    const delayMs = options?.delayMs ?? BOOT_DELAY_MS;
    const attemptTimeoutMs = options?.attemptTimeoutMs ?? BOOT_ATTEMPT_TIMEOUT_MS;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await withTimeout(probe(), attemptTimeoutMs, label);
            return;
        } catch (error) {
            const last = attempt === attempts;

            console.error(`[${label}] boot probe ${attempt}/${attempts} failed: ${(error as Error).message}`);

            if (last) throw error;

            await new Promise((resolve) => {
                setTimeout(resolve, delayMs).unref?.();
            });
        }
    }
}

/**
 * Reject if `work` has not settled within `timeoutMs`.
 *
 * The losing promise gets a no-op catch: when the timeout wins, `work` may still reject
 * later (the driver gives up on its own schedule) and that must not surface as an
 * unhandled rejection.
 */
async function withTimeout(work: Promise<unknown>, timeoutMs: number, label: string): Promise<void> {
    let timer: NodeJS.Timeout | undefined;

    work.catch(() => undefined);

    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error(`[${label}] boot probe timed out after ${timeoutMs} ms`)),
            timeoutMs
        );
        timer.unref?.();
    });

    try {
        await Promise.race([work, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
