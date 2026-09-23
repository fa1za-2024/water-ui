/**
 * Request validation with Zod.
 *
 * MASTER_CONTEXT.md section 2 lists Zod as the validation library. Schemas live
 * next to their controller; these middlewares turn a schema into an Express
 * guard and hand the controller the PARSED value, so it can trust the shape (and
 * unknown keys are dropped rather than forwarded to Prisma).
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodError, ZodType } from 'zod';

function validationError(res: Response, error: ZodError, fallback: string): void {
    res.status(400).json({
        error: 'Validation failed',
        issues: error.issues.map((issue) => ({
            path: issue.path.map(String).join('.') || fallback,
            message: issue.message,
        })),
    });
}

/** Validate `req.body` in place - `req.body` is a plain writable property. */
export function validateBody<T>(schema: ZodType<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            validationError(res, result.error, '(body)');
            return;
        }

        req.body = result.data;
        next();
    };
}

/** Carries the Zod-parsed query string; see `validateQuery` for why it is not on `req.query`. */
export interface QueryValidatedRequest extends Request {
    validatedQuery?: unknown;
}

/**
 * Validate the query string and attach the parsed result.
 *
 * Express 5 defines `req.query` with a getter and NO setter (lib/request.js
 * `defineGetter(req, 'query', ...)`), so `req.query = parsed` throws in strict
 * mode. The parsed value therefore lands on `req.validatedQuery` and is read
 * back with `validatedQuery()` - which also means the raw string is never used
 * by accident.
 */
export function validateQuery<T>(schema: ZodType<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.query);

        if (!result.success) {
            validationError(res, result.error, '(query)');
            return;
        }

        (req as QueryValidatedRequest).validatedQuery = result.data;
        next();
    };
}

/** Read the value attached by `validateQuery`. */
export function validatedQuery<T>(req: Request): T {
    return (req as QueryValidatedRequest).validatedQuery as T;
}
