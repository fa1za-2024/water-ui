/**
 * JWT authentication middleware.
 *
 * MASTER_CONTEXT.md Rule 1: this is a SINGLE-USER system. There is no RBAC -
 * no roles, no permissions, no ownership checks. This middleware only answers
 * "is the caller the logged-in user?".
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import type { AuthedRequest, AuthClaims } from '../types/user';

const FALLBACK_SECRET = 'your_super_secret_jwt_key_here';

// Re-exported so callers can keep importing them from this module.
export type { AuthClaims, AuthedRequest };

/** Sign a token for the single user. */
export function signToken(payload: AuthClaims): string {
    return jwt.sign(payload, process.env.JWT_SECRET ?? FALLBACK_SECRET, {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
    });
}

/** Require `Authorization: Bearer <token>` and attach the payload as req.user. */
export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');

    if (scheme !== 'Bearer' || !token) {
        res.status(401).json({ error: 'Missing bearer token' });
        return;
    }

    try {
        // jwt.verify returns `string | JwtPayload`, so VALIDATE the claims
        // rather than blind-casting - a token signed with a different secret
        // shape must not be trusted.
        const decoded = jwt.verify(token, process.env.JWT_SECRET ?? FALLBACK_SECRET);

        if (typeof decoded === 'string' || !Number.isFinite(Number(decoded.sub))) {
            res.status(401).json({ error: 'Invalid token payload' });
            return;
        }

        req.user = { sub: Number(decoded.sub), email: String(decoded.email ?? '') };
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export default authMiddleware;
