/**
 * Users module - profile routes (mounted at /api/users).
 *
 *   GET  /api/users/profile        -> 200 { user }
 *   PUT  /api/users/profile        -> 200 { user }
 *   PUT  /api/users/password       -> 200 { message } (A21/T-204)
 *   POST /api/users/upload-avatar  -> 200 { profilePictureUrl }
 *
 * Split out from authRoutes.ts because the documented paths are `/api/users/*`
 * while register/login are `/api/auth/*`. See MASTER_CONTEXT.md Appendix A.
 *
 * Every route here requires a valid JWT. Rule 1: no roles or permission checks
 * beyond "is this the logged-in user?".
 */
import { Router } from 'express';
import multer from 'multer';

import {
    ALLOWED_AVATAR_TYPES,
    changePassword,
    changePasswordSchema,
    getProfile,
    updateProfile,
    updateProfileSchema,
    uploadAvatar,
} from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../utils/httpError';

/** 2 MB is generous for a profile picture and keeps memory use bounded. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const upload = multer({
    // Buffered in memory, then streamed to MinIO - nothing touches local disk,
    // which matters because the backend container is disposable.
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_AVATAR_TYPES[file.mimetype]) {
            cb(null, true);
            return;
        }
        cb(new HttpError(415, 'Only PNG, JPEG or WebP images are allowed'));
    },
});

const router = Router();

// Everything below requires a token.
router.use(authMiddleware);

router.get('/profile', getProfile);
router.put('/profile', validateBody(updateProfileSchema), updateProfile);

// Current password + new password; see changePassword() for why the old one is required.
router.put('/password', validateBody(changePasswordSchema), changePassword);

// The multipart field name must be "avatar".
router.post('/upload-avatar', upload.single('avatar'), uploadAvatar);

export default router;
