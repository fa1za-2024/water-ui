/**
 * Boards module routes (mounted at /api/boards).
 *
 * MASTER_CONTEXT.md section 6.2. Implemented in controllers/boardController.ts:
 *   GET    /api/boards                     -> 200 { data, total, page, limit }
 *   POST   /api/boards                     -> 201 { board }
 *   GET    /api/boards/:boardID            -> 200 { board }
 *   PUT    /api/boards/:boardID            -> 200 { board }
 *   PATCH  /api/boards/:boardID/status     -> 200 { board }   (sets is_active)
 *   DELETE /api/boards/:boardID            -> 204 no body
 *
 * Implementation notes:
 *   - Prisma model fields are camelCase (boardId, isActive); the COLUMNS are
 *     snake_case via @map. See prisma/schema.prisma.
 *   - The REST path param keeps the documented spelling `:boardID`, while the JSON
 *     body/response uses the Prisma-style `boardId` - see types/board.ts.
 *   - Every route requires a JWT: the module is managed from the dashboard behind
 *     the login screen, like `/api/users`. There are no role checks (Rule 1).
 */
import { Router } from 'express';

import {
    createBoard,
    createBoardSchema,
    deleteBoard,
    getBoard,
    listBoards,
    listBoardsQuerySchema,
    setBoardStatus,
    setBoardStatusSchema,
    updateBoard,
    updateBoardSchema,
} from '../controllers/boardController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody, validateQuery } from '../middleware/validate';

const router = Router();

// Everything below requires a token.
router.use(authMiddleware);

router.get('/', validateQuery(listBoardsQuerySchema), listBoards);
router.post('/', validateBody(createBoardSchema), createBoard);
router.get('/:boardID', getBoard);
router.put('/:boardID', validateBody(updateBoardSchema), updateBoard);
router.patch('/:boardID/status', validateBody(setBoardStatusSchema), setBoardStatus);
router.delete('/:boardID', deleteBoard);

export default router;
