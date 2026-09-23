/**
 * Error type that carries an HTTP status code.
 *
 * The shared error middleware reads `err.status`, so throwing one of these from
 * a controller produces a clean JSON response instead of a 500.
 */
export class HttpError extends Error {
    public readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}
