/**
 * Users module - profile management.
 *
 * MASTER_CONTEXT.md section 6.1. Documented endpoints:
 *   GET  /api/users/profile        -> 200 { user }
 *   PUT  /api/users/profile        -> 200 { user }
 *   PUT  /api/users/password       -> 200 { message }  (current + new password, A21/T-204)
 *
 * `POST /api/users/upload-avatar` was removed with MinIO (T-1.4): there is no
 * avatar storage any more.
 *
 * These live in their own router because they are documented under `/api/users`
 * while register/login sit under `/api/auth` - see Appendix A (A20).
 *
 * Rule 1: there is exactly one profile, so queries use findFirst() rather than
 * filtering by owner. No RBAC.
 */
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { BCRYPT_ROUNDS, passwordField } from './authController';
import { prisma } from '../config/db';
import { publicUserSelect, toPublicUser } from '../types/user';
import { HttpError } from '../utils/httpError';

/** At least one field must be present, otherwise the update is a no-op. */
export const updateProfileSchema = z
    .object({
        firstName: z.string().trim().min(1).max(50).optional(),
        lastName: z.string().trim().min(1).max(50).optional(),
        email: z.email().max(100).optional(),
        phone: z.string().trim().min(3).max(20).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: 'Provide at least one field to update',
    });

/** The single profile. Throws 404 when the database is still empty. */
async function requireProfile() {
    const user = await prisma.user.findFirst({ select: { id: true } });

    if (!user) {
        throw new HttpError(404, 'No profile exists yet. Register or run `npm run prisma:seed`.');
    }

    return user;
}

/** GET /api/users/profile */
export async function getProfile(_req: Request, res: Response): Promise<void> {
    const user = await prisma.user.findFirst({ select: publicUserSelect });

    if (!user) {
        throw new HttpError(404, 'No profile exists yet. Register or run `npm run prisma:seed`.');
    }

    res.json({ user: toPublicUser(user) });
}

/** PUT /api/users/profile */
export async function updateProfile(req: Request, res: Response): Promise<void> {
    const existing = await requireProfile();

    try {
        const user = await prisma.user.update({
            where: { id: existing.id },
            data: req.body as z.infer<typeof updateProfileSchema>,
            select: publicUserSelect,
        });

        res.json({ user: toPublicUser(user) });
    } catch (error) {
        // P2002 = unique constraint violated (email or phone already taken).
        if ((error as { code?: string }).code === 'P2002') {
            throw new HttpError(409, 'That email or phone number is already in use');
        }
        throw error;
    }
}

/**
 * PUT /api/users/password - change the password (T-204, A21 resolved).
 *
 * Requires the CURRENT password, not just a valid token: the token lives in
 * localStorage, so re-asking for the old password is what stops a stolen token from
 * locking the rightful owner out. This is the flow A21 decided on - an authenticated
 * change needs no mail transport, unlike an emailed reset link.
 *
 * NOTE: existing JWTs stay valid after a change (there is no token version/serial in
 * the payload). That is acceptable for a single-user dashboard and is documented in
 * MASTER_CONTEXT.md 6.1; adding token invalidation would mean a column plus a check in
 * the auth middleware.
 */
export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Your current password is required'),
        newPassword: passwordField,
    })
    .refine((value) => value.currentPassword !== value.newPassword, {
        message: 'The new password must be different from the current one',
    });

export async function changePassword(req: Request, res: Response): Promise<void> {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

    // findFirst + passwordHash: the public select excludes the hash on purpose.
    const user = await prisma.user.findFirst({ select: { id: true, passwordHash: true } });

    if (!user) {
        throw new HttpError(404, 'No profile exists yet. Register or run `npm run prisma:seed`.');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!matches) {
        // 401, not 400: the request is well-formed, the credential is wrong.
        throw new HttpError(401, 'Current password is incorrect');
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });

    // No user in the response: nothing about the profile changed, and it keeps the
    // response free of anything credential-shaped.
    res.json({ message: 'Password updated' });
}
