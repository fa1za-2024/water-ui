/**
 * Users-module types.
 *
 * MASTER_CONTEXT.md Rule 1: this is a SINGLE-user system, so `PublicUser` is
 * the only user shape the API ever returns - never the raw row, which would
 * leak `passwordHash`.
 */
import type { Request } from 'express';

/** What the API returns for a user. `password_hash` is never included. */
export interface PublicUser {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    profilePictureUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Prisma `select` that fetches exactly the public columns. */
export const publicUserSelect = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    profilePictureUrl: true,
    createdAt: true,
    updatedAt: true,
} as const;

/** Shape produced by `publicUserSelect`. */
interface PublicUserRow {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    profilePictureUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** Serialise dates to ISO-8601 (Rule 7: send ISO, format with Day.js in the UI). */
export function toPublicUser(row: PublicUserRow): PublicUser {
    return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        profilePictureUrl: row.profilePictureUrl,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/** Claims placed in the JWT - see middleware/authMiddleware.ts. */
export interface AuthClaims {
    sub: number;
    email: string;
}

/** Request with the decoded JWT attached by authMiddleware. */
export interface AuthedRequest extends Request {
    user?: AuthClaims;
}
