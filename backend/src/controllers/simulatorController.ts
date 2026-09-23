/**
 * Simulator Control Module - HTTP surface.
 *
 * `docs/simulator-module.md` 3.3:
 *   POST /api/simulator/start   -> 200 { message, topic, condition }
 *   POST /api/simulator/stop    -> 200 { message }
 *
 * One addition beyond the spec, `GET /api/simulator/status`: 2.5 asks for a live status
 * indicator, and a page that has just been reloaded has no way to know a simulation is
 * already running - it would show "Stopped" and then refuse to start with the 400 below. The
 * badge reads this instead. (It is a one-shot read, not polling - Rule 5.)
 *
 * The response bodies keep the spec's wording, with the extra fields the UI needs
 * (`topic`/`condition` are what 2.5 prints, `published` and `startedAt` feed the badge).
 * A second `start` while one is running is 400, exactly as 5 requires.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';

import { HttpError } from '../utils/httpError';
import {
    SimulatorUnavailableError,
    getSimulationStatus,
    startSimulation,
    stopSimulation,
} from '../services/simulatorService';
import {
    MAX_SLEEP_MS,
    MIN_SLEEP_MS,
    SIMULATOR_CONDITIONS,
    BOARD_ID_PATTERN,
} from '../types/simulator';

/**
 * Section 2.2's fields, validated with the same care as the boards module.
 *
 * `brokerUrl` must carry a scheme because `buildBrokerUrl` appends `:port` to it - without one
 * the client would be handed something like `localhost:1883`, which mqtt reads as a protocol.
 */
export const startSimulationSchema = z.object({
    brokerUrl: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9+.-]*:\/\/.+/i, 'Broker URL must include a scheme, e.g. mqtt://localhost'),
    port: z.coerce.number().int('Port must be a whole number').min(1).max(65535),
    boardID: z
        .string()
        .trim()
        .regex(BOARD_ID_PATTERN, 'Board ID must be 1-50 characters of A-Z, a-z, 0-9, "_" or "-"')
        .transform((value) => value.toUpperCase()),
    sleepTime: z.coerce
        .number()
        .int('Sleep time must be a whole number of milliseconds')
        .min(MIN_SLEEP_MS, `Sleep time must be at least ${MIN_SLEEP_MS} ms`)
        .max(MAX_SLEEP_MS, `Sleep time must be at most ${MAX_SLEEP_MS} ms`),
    condition: z.enum(SIMULATOR_CONDITIONS),
});

export type StartSimulationBody = z.infer<typeof startSimulationSchema>;

/** POST /api/simulator/start */
export async function start(req: Request, res: Response): Promise<void> {
    const config = req.body as StartSimulationBody;

    if (getSimulationStatus().running) {
        throw new HttpError(400, 'A simulation is already running. Stop it first.');
    }

    try {
        const status = await startSimulation(config);

        res.status(200).json({
            message: 'Simulation started',
            topic: status.topic,
            condition: status.condition,
            boardID: status.boardID,
            sleepTime: status.sleepTime,
            brokerUrl: status.brokerUrl,
        });
    } catch (error) {
        if (error instanceof SimulatorUnavailableError) {
            // 502 rather than 500: the request was valid, the broker did not answer.
            throw new HttpError(502, error.message);
        }

        if (error instanceof Error && error.message === 'already-running') {
            throw new HttpError(400, 'A simulation is already running. Stop it first.');
        }

        throw error;
    }
}

/** POST /api/simulator/stop */
export async function stop(_req: Request, res: Response): Promise<void> {
    const { stopped, published } = await stopSimulation();

    res.status(200).json({
        message: stopped ? `Simulation stopped after ${published} reading(s)` : 'Simulation stopped',
        stopped,
        published,
    });
}

/** GET /api/simulator/status - so the badge survives a reload. */
export function status(_req: Request, res: Response): void {
    res.json(getSimulationStatus());
}
