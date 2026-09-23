/**
 * Users module - authentication routes (mounted at /api/auth).
 *
 *   POST /api/auth/register  -> 201 { token, user }
 *   POST /api/auth/login     -> 200 { token, user }
 *   GET  /api/auth/me        -> 200 { user }   (token required)
 *
 * Profile management lives in userRoutes.ts, mounted at /api/users, because
 * that is where the documented paths sit.
 */
import { Router } from 'express';

import { login, loginSchema, me, register, registerSchema } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';

const router = Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.get('/me', authMiddleware, me);

export default router;
