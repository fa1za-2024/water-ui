/**
 * Water UI - Express API + Socket.io entry point
 *
 * Responsibilities (see MASTER_CONTEXT.md section 1, steps 4 and 6):
 *   - expose the REST API under /api
 *   - run the Socket.io server that pushes live readings to the React frontend
 *
 * The live update path is deliberately NOT polling (Rule 5):
 *   Node-RED --> POST /api/internal/sensor-update --> io.emit('sensor-update')
 *                                                        --> Redux --> UI
 */
import 'dotenv/config';

import http from 'node:http';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { closeSocketServer, createSocketServer } from './config/socket';
import { connectDatabase, disconnectDatabase } from './config/db';
import { installShutdownHandlers, probeDatabaseWithRetry } from './lifecycle';
import { notFound, errorHandler } from './middleware/errorMiddleware';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import boardRoutes from './routes/boardRoutes';
import dashboardRoutes, { internalRoutes } from './routes/dashboardRoutes';
import historicalRoutes from './routes/historicalRoutes';
import simulatorRoutes from './routes/simulatorRoutes';
import { stopSimulationOnShutdown } from './services/simulatorService';

const app = express();
const server = http.createServer(app);

// Socket.io shares the HTTP server, so it listens on the same port (5000).
createSocketServer(server);

/** `CORS_ORIGIN` is a comma-separated allow-list; `*` opens it up (dev only). */
function resolveCorsOrigins(): string[] | true {
    const configured = (process.env.CORS_ORIGIN ?? '*')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    return configured.includes('*') ? true : configured;
}

// --- Proxy trust ------------------------------------------------------------
// When the API sits behind nginx it has to be told how many proxy hops to
// believe. Without it, req.ip is the nginx container's address for *every*
// client. That breaks express-rate-limit in two ways at once: all users end up
// sharing a single 300/min bucket, and because nginx sends X-Forwarded-For the
// limiter also raises, on every proxied request,
//
//   ValidationError: The 'X-Forwarded-For' header is set but the Express
//   'trust proxy' setting is false (default).
//
// Deliberately opt-in. The value is a hop count, and trusting a proxy that is
// not actually in front of the API would let a client forge X-Forwarded-For and
// pick its own rate-limit bucket. Both compose stacks in this repository set
// TRUST_PROXY=1 for the nginx they ship; an API exposed directly leaves it unset.
const TRUST_PROXY = process.env.TRUST_PROXY;

if (TRUST_PROXY) {
    // A bare number is a hop count; anything else ("loopback", a CIDR,
    // "uniquelocal") is passed through for Express to interpret.
    app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
}

// --- Global middleware ------------------------------------------------------
app.use(helmet());
app.use(cors({ origin: resolveCorsOrigins(), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(
    rateLimit({
        windowMs: 60 * 1000,
        limit: 300, // per IP per window
        standardHeaders: true,
        legacyHeaders: false,
    })
);

// --- Routes -----------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        service: 'water-ui-backend',
        time: new Date().toISOString(),
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/historical', historicalRoutes);
app.use('/api/simulator', simulatorRoutes);

// Internal ingest lives at the DOCUMENTED path `/api/internal/sensor-update`,
// so it is mounted at /api rather than under /api/dashboard. Node-RED posts
// here (see iot/node-red/flows.json).
app.use('/api', internalRoutes);

// --- Error handling (must stay last) ---------------------------------------
app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 5000);

/**
 * Start only after MySQL answers (T-228).
 *
 * The probe runs before `listen()`, so a deployment whose database is missing exits
 * non-zero with a clear message instead of accepting traffic and failing every
 * request. `probeDatabaseWithRetry` absorbs a short race against a starting MySQL
 * (bounded: `DB_BOOT_ATTEMPTS` × `DB_BOOT_DELAY_MS`) and then throws.
 *
 * The Socket.io server is attached to the HTTP server above, but attaching does not
 * open the port - only `listen()` does - so nothing is reachable until the probe passes.
 */
async function start(): Promise<void> {
    try {
        await probeDatabaseWithRetry(connectDatabase);
    } catch (error) {
        console.error(`[water-ui] refusing to start: MySQL is unreachable (${(error as Error).message})`);
        process.exit(1);
    }

    server.listen(port, () => {
        console.log(`[water-ui] API + Socket.io listening on :${port}`);
    });
}

/**
 * Drain on SIGTERM/SIGINT. Order matters: Socket.io/engine.io owns the live
 * connections, so it closes first, then the HTTP server stops accepting, then the
 * Prisma pool is drained. Without this the container runtime's stop signal kills the
 * process with the MySQL connections still open (T-228).
 */
installShutdownHandlers({
    server,
    onShutdown: async () => {
        // A running simulator holds an open MQTT client and an interval; leaving them would
        // keep the process (and the forced-exit timer) alive past the drain.
        await stopSimulationOnShutdown();
        await closeSocketServer();
        await disconnectDatabase();
    },
});

void start();

export { app, server };
