/**
 * Users module - profile routes (mounted at /api/users).
 *
 *   GET  /api/users/profile        -> 200 { user }
 *   PUT  /api/users/profile        -> 200 { user }
 *   PUT  /api/users/password       -> 200 { message } (A21/T-204)
 *
 * Split out from authRoutes.ts because the documented paths are `/api/users/*`
 * while register/login are `/api/auth/*`. See MASTER_CONTEXT.md Appendix A.
 *
 * `POST /api/users/upload-avatar` was removed together with MinIO (T-1.3): the
 * avatar feature is gone, so there is no multipart route here.
 *
 * Every route here requires a valid JWT. Rule 1: no roles or permission checks
 * beyond "is this the logged-in user?".
 */
import { Router } from 'express';

import {
    changePassword,
    changePasswordSchema,
    getProfile,
    updateProfile,
    updateProfileSchema,
} from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';

const router = Router();

// Everything below requires a token.
router.use(authMiddleware);

router.get('/profile', getProfile);
router.put('/profile', validateBody(updateProfileSchema), updateProfile);

// Current password + new password; see changePassword() for why the old one is required.
router.put('/password', validateBody(changePasswordSchema), changePassword);

export default router;
