/**
 * Users module - authentication.
 *
 * MASTER_CONTEXT.md section 6.1. Documented endpoints:
 *   POST /api/auth/register  -> 201 { token, user }
 *   POST /api/auth/login     -> 200 { token, user }
 *
 * Rule 1: SINGLE-USER system, no RBAC. Registration therefore bootstraps the
 * one and only profile - once a user exists it returns 409 rather than creating
 * a second account. Set ALLOW_REGISTRATION=false to disable it entirely once
 * the profile has been seeded.
 */
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../config/db';
import { signToken } from '../middleware/authMiddleware';
import { publicUserSelect, toPublicUser, type AuthedRequest } from '../types/user';
import { HttpError } from '../utils/httpError';

/** bcrypt cost factor. Keep in sync with prisma/seed.ts. */
/** bcrypt cost. Exported so the password-change endpoint rehashes with the same cost. */
export const BCRYPT_ROUNDS = 12;

/** bcrypt silently truncates beyond 72 bytes, so cap it explicitly. */
/** The canonical password rule - register, login (presence only) and change-password share it. */
export const passwordField = z.string().min(8, "Password must be at least 8 characters").max(72);

export const registerSchema = z.object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.email().max(100),
    phone: z.string().trim().min(3).max(20),
    password: passwordField,
});

export const loginSchema = z.object({
    email: z.email().max(100),
    password: z.string().min(1, 'Password is required'),
});

/** POST /api/auth/register - creates the single profile. */
export async function register(req: Request, res: Response): Promise<void> {
    if ((process.env.ALLOW_REGISTRATION ?? 'true') === 'false') {
        throw new HttpError(403, 'Registration is disabled. Sign in with the existing profile.');
    }

    // Single-user system: refuse to create a second account.
    const existingCount = await prisma.user.count();
    if (existingCount > 0) {
        throw new HttpError(
            409,
            'A profile already exists. This system supports a single user - please log in instead.'
        );
    }

    const { firstName, lastName, email, phone, password } = req.body as z.infer<
        typeof registerSchema
    >;

    const user = await prisma.user.create({
        data: {
            firstName,
            lastName,
            email,
            phone,
            passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        },
        select: publicUserSelect,
    });

    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, user: toPublicUser(user) });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });

    // Same message for "no such user" and "wrong password" so the response does
    // not reveal which emails exist.
    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !passwordMatches) {
        throw new HttpError(401, 'Invalid email or password');
    }

    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: toPublicUser(user) });
}

/** GET /api/auth/me - the profile behind the presented token. */
export async function me(req: Request, res: Response): Promise<void> {
    const claims = (req as AuthedRequest).user;

    const user = claims?.sub
        ? await prisma.user.findUnique({ where: { id: claims.sub }, select: publicUserSelect })
        : null;

    if (!user) {
        throw new HttpError(404, 'No profile found for this token');
    }

    res.json({ user: toPublicUser(user) });
}
