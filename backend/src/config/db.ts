/**
 * MySQL connection via Prisma 7.
 *
 * Prisma 7 requirements that differ from earlier majors:
 *   1. The legacy `prisma-client-js` generator was removed. The client is
 *      generated into src/generated/prisma and imported from there - NOT from
 *      '@prisma/client'. Run `npm run prisma:generate` after a fresh install.
 *   2. The datasource `url` property was removed from schema.prisma entirely;
 *      the CLI connection string lives in prisma.config.ts.
 *   3. MySQL/MariaDB now needs a DRIVER ADAPTER. `new PrismaClient()` with no
 *      adapter is no longer valid for this provider.
 *   4. The generated client is TypeScript, which is why this backend is
 *      TypeScript rather than plain JavaScript.
 *   5. MySQL 8 authenticates `water_user` with `caching_sha2_password`. Over a
 *      PLAINTEXT channel the driver can only send that password by fetching the
 *      server's RSA public key, and that succeeds only while MySQL still holds the
 *      user's digest in its in-memory cache - after a MySQL restart every query
 *      fails with `ER_CANNOT_RETRIEVE_RSA_KEY` and surfaces as
 *      `pool timeout: failed to retrieve a connection from pool (active=0
 *      idle=0)` (T-229 / A24). The connection is therefore made over TLS, which
 *      both encrypts the traffic and lets the auth plugin use its secure path.
 *      See buildSslOptions() for the modes.
 */
import fs from 'node:fs';
import net from 'node:net';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../generated/prisma/client';

const DEFAULT_DATABASE_URL = 'mysql://water_user:supersecretuser@localhost:3306/water_ui';

/**
 * Resolve the connection string, refusing the development fallback in production.
 *
 * The hard-coded default exists for local runs. In production an unset DATABASE_URL
 * would silently aim the API at `localhost:3306` *inside its own container*, where
 * nothing is listening: the only symptom is a boot probe that times out, and the
 * log says nothing about where it tried to connect. That is exactly the shape of
 * the first Railway deploy (2026-09-23), so it fails loudly instead.
 */
function resolveDatabaseUrl(): string {
    const configured = process.env.DATABASE_URL?.trim();

    if (configured) return configured;

    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
        throw new Error(
            'DATABASE_URL is not set. On Railway, set it on the backend service to ' +
                '${{MySQL.MYSQL_URL}} (or build it from the database service\'s ' +
                'MYSQLUSER/MYSQLPASSWORD/MYSQLHOST/MYSQLPORT/MYSQLDATABASE variables).'
        );
    }

    return DEFAULT_DATABASE_URL;
}

const DATABASE_URL = resolveDatabaseUrl();

/**
 * `host:port/database` - never credentials - so a failure can name its target.
 * Passwords and query strings stay out of logs.
 */
function describeTarget(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);
        return `${url.hostname}:${url.port || '3306'}/${url.pathname.replace(/^\//, '')}`;
    } catch {
        return '<unparseable DATABASE_URL>';
    }
}

/** Non-secret description of the database being dialled. Safe to log. */
export const DATABASE_TARGET = describeTarget(DATABASE_URL);

/**
 * Cheap TCP reachability check, used only to explain a failed boot probe.
 *
 * The Prisma driver's pool reports a bare "failed to retrieve a connection from
 * pool", and its 10 s acquire timeout outlives the boot probe's own bound - so the
 * log ends up saying only "timed out", which cannot tell a wrong hostname
 * (ENOTFOUND) from a firewalled host (ETIMEDOUT) from a stopped server
 * (ECONNREFUSED) from a TLS problem (reachable, but the query still fails). A raw
 * socket distinguishes those cases in one step.
 */
export function probeTcpReachability(timeoutMs = 3_000): Promise<string> {
    const url = new URL(DATABASE_URL);
    const host = url.hostname;
    const port = url.port ? Number(url.port) : 3306;

    return new Promise((resolve) => {
        const socket = net.connect({ host, port });
        const finish = (message: string): void => {
            socket.destroy();
            resolve(message);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish('TCP reachable'));
        socket.once('timeout', () => finish(`no TCP response within ${timeoutMs} ms`));
        socket.once('error', (error: NodeJS.ErrnoException) =>
            finish(`${error.code ?? 'ERROR'} (${error.message})`)
        );
    });
}

/**
 * TLS options for the MySQL connection, chosen by `DB_TLS`:
 *
 * - `require` (default) - encrypt the channel but do NOT verify the server's
 *   certificate. MySQL 8 mints a self-signed certificate when it initialises the
 *   data directory, so a stock dev container cannot be verified without shipping
 *   that CA. Encryption is what fixes T-229; the server's identity is still
 *   unchecked, so an attacker who can intercept the loopback traffic could
 *   impersonate it - T-411 moved the database ports onto `127.0.0.1` (that attacker
 *   must already be on this host), and certificate verification is T-414's job.
 * - `verify` - encrypt AND check the server certificate against the CA in
 *   `DB_TLS_CA`. This needs a certificate whose SAN covers the host being
 *   connected to: MySQL's auto-generated pair is
 *   `CN=MySQL_Server_8.0.46_Auto_Generated_Server_Certificate` with NO SAN, so Node
 *   rejects it with `ERR_TLS_CERT_ALTNAME_INVALID` even with the right CA. Mount a
 *   CA-signed certificate with a matching SAN into MySQL before using this mode -
 *   it is the production setting, not something the stock dev container supports.
 * - `disable` - no TLS. Only for a server built without it; the app will then fail
 *   again with `ER_CANNOT_RETRIEVE_RSA_KEY` after a restart.
 */
function buildSslOptions(): { ssl?: { ca?: Buffer; rejectUnauthorized: boolean } } {
    const mode = (process.env.DB_TLS ?? 'require').toLowerCase();

    if (mode === 'disable') {
        console.warn('[db] DB_TLS=disable - the MySQL connection is NOT encrypted');
        return {};
    }

    if (mode === 'verify') {
        const caPath = process.env.DB_TLS_CA;

        if (!caPath) {
            throw new Error(
                'DB_TLS=verify requires DB_TLS_CA to point at MySQL\'s ca.pem. Export it with: ' +
                    'docker cp water_ui_mysql:/var/lib/mysql/ca.pem ./docker/mysql/ca.pem'
            );
        }

        return { ssl: { ca: fs.readFileSync(caPath), rejectUnauthorized: true } };
    }

    if (mode !== 'require') {
        throw new Error(`DB_TLS must be one of require | verify | disable (received "${mode}")`);
    }

    // rejectUnauthorized:false keeps TLS on while accepting the generated
    // self-signed certificate - encrypted, unverified. See the note above.
    return { ssl: { rejectUnauthorized: false } };
}

/** Turn a mysql:// connection string into the options the MariaDB adapter wants. */
function buildAdapter(rawUrl: string) {
    const url = new URL(rawUrl);

    return new PrismaMariaDb({
        host: url.hostname,
        port: url.port ? Number(url.port) : 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ''),
        connectionLimit: Number(process.env.DB_POOL_SIZE ?? 5),
        // NOTE (T-228): the driver does NOT fail fast on its own - a refused port is
        // retried until its 10 s pool-acquire timeout ("pool timeout: failed to
        // retrieve a connection from pool after 10004ms"), which is why the boot probe
        // bounds each attempt itself in `src/lifecycle.ts` instead of relying on
        // driver options.
        //
        // The consequence is that the driver's own message rarely reaches the log: the
        // probe gives up first, so all it can say is "timed out". connectDatabase()
        // compensates with a raw TCP check (probeTcpReachability) that names the
        // concrete reason, and DATABASE_TARGET names the host it tried.
        ...buildSslOptions(),
    });
}

export const prisma = new PrismaClient({
    adapter: buildAdapter(DATABASE_URL),
});

/**
 * Fail fast and loudly at boot if MySQL is unreachable.
 *
 * The TCP check runs FIRST, deliberately. The Prisma pool does not reject until its
 * 10 s acquire timeout, which outlives the boot probe's own bound - so by the time
 * the driver has an opinion, `probeDatabaseWithRetry` has already given up with a
 * bare "timed out". Checking the socket first means the log always names the
 * concrete reason: ENOTFOUND (wrong host or wrong service name in a reference),
 * ECONNREFUSED (server stopped), or a blackholed port (security list / firewall).
 *
 * A reachable socket is not proof the database is usable, so the query still runs
 * and its failure is reported separately - that is the TLS / credentials / schema
 * case.
 */
export async function connectDatabase(): Promise<PrismaClient> {
    const reachability = await probeTcpReachability();

    if (reachability !== 'TCP reachable') {
        throw new Error(`cannot reach MySQL at ${DATABASE_TARGET} - ${reachability}`);
    }

    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
        throw new Error(
            `MySQL at ${DATABASE_TARGET} accepted a TCP connection but rejected the query - ` +
                `check the credentials, the database name and DB_TLS: ${(error as Error).message}`
        );
    }

    console.log(`[db] connected to MySQL at ${DATABASE_TARGET}`);
    return prisma;
}

export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
}
