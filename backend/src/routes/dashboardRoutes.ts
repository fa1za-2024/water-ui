/**
 * Dashboard module routes (mounted at /api/dashboard).
 *
 * MASTER_CONTEXT.md section 6.3, implemented in controllers/dashboardController.ts:
 *   GET /api/dashboard/summary           -> online/offline + Safe/Acceptable/Unsafe counts
 *   GET /api/dashboard/boards-locations  -> active boards' coordinates for the Leaflet map
 *   GET /api/dashboard/latest/:boardID   -> one board's newest reading (side panel)
 *
 * All three require a JWT, like the boards and historical modules.
 *
 * This file also exports `internalRoutes`, the Node-RED ingest endpoint. It is
 * mounted at `/api` (NOT `/api/dashboard`) because the documented path is
 * `POST /api/internal/sensor-update` - see A16 - and it closes the live update path:
 *
 *   Node-RED POST /api/internal/sensor-update -> io.emit('sensor-update')
 *                                            -> Redux -> UI   (no polling, Rule 5)
 */
import { Router, type Request, type Response } from 'express';

import { getBoardLocations, getLatestReading, getSummary } from '../controllers/dashboardController';
import { authMiddleware } from '../middleware/authMiddleware';
import { emitSensorUpdate } from '../config/socket';
import type { SensorUpdateBody } from '../types/sensor';

const router = Router();

router.use(authMiddleware);

router.get('/summary', getSummary);
router.get('/boards-locations', getBoardLocations);
router.get('/latest/:boardID', getLatestReading);

export default router;

/**
 * Internal ingest router.
 *
 * Called by Node-RED after it writes the reading to InfluxDB. Deliberately
 * unauthenticated because it is only reachable on the compose network today - that is
 * an assumption rather than a control, so a shared-secret header is tracked as
 * A22 / T-218. Do not expose this service without it.
 */
export const internalRoutes = Router();

internalRoutes.post('/internal/sensor-update', (req: Request, res: Response) => {
    const reading = (req.body ?? {}) as Partial<SensorUpdateBody>;

    if (!reading.boardID || reading.pH === undefined || reading.turbidity === undefined) {
        res.status(400).json({ error: 'boardID, pH and turbidity are required' });
        return;
    }

    const delivered = emitSensorUpdate(reading as SensorUpdateBody);
    res.status(202).json({ accepted: true, delivered, reading });
});
