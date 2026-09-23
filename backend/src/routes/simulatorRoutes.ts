/**
 * Simulator Control Module routes (mounted at /api/simulator).
 *
 *   POST /api/simulator/start   -> 200 { message, topic, condition, ... }
 *   POST /api/simulator/stop    -> 200 { message, stopped, published }
 *   GET  /api/simulator/status  -> 200 SimulationStatus
 *
 * All three require a JWT, like every other route in this API (Rule 1: the only question is
 * "is the operator signed in?"). The module publishes to the broker on the server's behalf,
 * so it is not something the browser should be able to trigger unauthenticated.
 *
 * The spec's rule that the frontend must never speak MQTT itself is enforced by this file
 * existing at all: the UI only reaches the broker through these endpoints.
 */
import { Router } from 'express';

import { start, startSimulationSchema, status, stop } from '../controllers/simulatorController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);

router.post('/start', validateBody(startSimulationSchema), start);
router.post('/stop', stop);
router.get('/status', status);

export default router;
