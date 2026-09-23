/**
 * Socket.io server.
 *
 * Rule 5: every live update travels Socket.io -> Redux -> components.
 * Node-RED POSTs each reading to /api/internal/sensor-update, which calls
 * emitSensorUpdate() below; the browser listens for the same event name.
 */
import type http from 'node:http';
import { Server, type Socket } from 'socket.io';

import type { SensorReading } from '../types/sensor';

/** Event name shared with the frontend (src/hooks/useSocket.js). */
export const SENSOR_UPDATE_EVENT = 'sensor-update';

let io: Server | null = null;

function resolveCorsOrigins(): string[] | true {
    const configured = (process.env.CORS_ORIGIN ?? '*')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    return configured.includes('*') ? true : configured;
}

export function createSocketServer(httpServer: http.Server): Server {
    io = new Server(httpServer, {
        cors: { origin: resolveCorsOrigins(), credentials: true },
    });

    io.on('connection', (socket: Socket) => {
        console.log(`[socket] client connected: ${socket.id}`);

        socket.on('disconnect', (reason: string) => {
            console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
        });
    });

    console.log('[socket] Socket.io server ready');
    return io;
}

/** Fan a reading out to every connected dashboard. */
export function emitSensorUpdate(reading: SensorReading): boolean {
    if (!io) {
        console.warn('[socket] server not ready - dropping reading');
        return false;
    }
    io.emit(SENSOR_UPDATE_EVENT, reading);
    return true;
}

/**
 * Close the Socket.io server.
 *
 * Called during shutdown (T-228) BEFORE the HTTP server stops: engine.io owns the
 * connections, and yanking them out from under it with `server.closeAllConnections()`
 * aborted the process on Windows with a libuv assertion
 * (`!(handle->flags & UV_HANDLE_CLOSING), src/win/async.c`).
 */
export async function closeSocketServer(): Promise<void> {
    if (!io) return;

    const closing = io;
    io = null;

    await new Promise<void>((resolve) => {
        closing.close(() => {
            console.log('[socket] Socket.io server closed');
            resolve();
        });
    });
}

export const getIo = (): Server | null => io;
