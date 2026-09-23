/**
 * Error handling middleware.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so handlers do not need try/catch wrappers just to report a 500.
 */
import type { NextFunction, Request, Response } from 'express';

/** 404 for anything that fell through the router stack. */
export function notFound(req: Request, res: Response): void {
    res.status(404).json({
        error: 'Not found',
        method: req.method,
        path: req.originalUrl,
    });
}

/** Anything thrown/caught upstream. Keeps the four-arg signature Express needs. */
export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const error = err as Error & { status?: number; statusCode?: number; code?: string };

    const status = Number(error.status ?? error.statusCode ?? 500);

    console.error(`[error] ${req.method} ${req.originalUrl} ->`, error.message);

    res.status(status).json({
        error: status >= 500 ? 'Internal Server Error' : error.message,
        // Diagnostics are ONLY for 5xx, and only outside production. A 4xx is an
        // expected outcome (bad input, missing token); adding its stack trace would
        // just leak internal paths to the client.
        ...(process.env.NODE_ENV !== 'production' && status >= 500
            ? { detail: error.message, stack: error.stack }
            : {}),
    });
}
