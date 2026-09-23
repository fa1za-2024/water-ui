/**
 * Historical data module routes (mounted at /api/historical).
 *
 * MASTER_CONTEXT.md section 6.4. Implemented in controllers/historicalController.ts:
 *   GET /api/historical                      ?boardIDs=A,B&range=24h   -> overlaid series (T-217)
 *   GET /api/historical/:boardID             ?range=24h | ?start=&end= -> chart series (T-214)
 *   GET /api/historical/:boardID/readings     ?page=&limit=            -> table rows (§7.4)
 *   GET /api/historical/export/excel/:boardID ?range=7d                -> .xlsx stream (T-216)
 *
 * Rule 3: the Excel file is produced on the BACKEND with `exceljs` and streamed with
 * `Content-Disposition: attachment`; it is never generated in the browser.
 * Rule 7: timestamps leave the API as ISO-8601 and the frontend formats the Chart.js
 * X-axis with Day.js.
 *
 * Route order matters: the literal `/export/excel/...` and `/:boardID/readings` paths
 * must be declared before the `/:boardID` catch-all.
 */
import { Router } from 'express';

import {
    exportExcel,
    getMultiBoardSeries,
    getReadings,
    getSeries,
    historyQuerySchema,
    multiBoardQuerySchema,
    readingsQuerySchema,
} from '../controllers/historicalController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateQuery } from '../middleware/validate';

const router = Router();

// Every historical read requires a token, like the other dashboard data.
router.use(authMiddleware);

router.get('/export/excel/:boardID', validateQuery(historyQuerySchema), exportExcel);
router.get('/', validateQuery(multiBoardQuerySchema), getMultiBoardSeries);
router.get('/:boardID/readings', validateQuery(readingsQuerySchema), getReadings);
router.get('/:boardID', validateQuery(historyQuerySchema), getSeries);

export default router;
