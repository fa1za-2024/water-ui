#!/usr/bin/env node
/**
 * Run the API on the HOST, against the Compose containers (T-231).
 *
 * Why this exists: `backend/.env` is written for the container path, where the
 * database host is the Compose service name (`@mysql:`) and InfluxDB/MinIO are
 * `influxdb:8086` / `minio:9000`. Those names do not resolve from Windows, so a
 * host-run `node dist/index.js` cannot reach MySQL and every login fails - which
 * looks like a credentials bug rather than a connection one.
 *
 *   npm run start:host     # the built dist/ - fastest
 *   npm run dev:host       # tsx watch, rebuilds on save
 *
 * Values resolve in this order: an already-exported variable, then backend/.env,
 * then a localhost default - and the service names are rewritten to localhost in
 * every case. dotenv does not override variables that are already set, so what is
 * passed here wins over .env; every other .env value (JWT_SECRET, tokens, PORT)
 * is still loaded by the app itself.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const useWatch = process.argv.includes('--dev');

/** Minimal .env reader: `KEY=value`, ignoring comments and surrounding quotes. */
function readEnvFile() {
    const file = path.join(backendDir, '.env');
    if (!existsSync(file)) return {};

    const values = {};

    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
        if (!match) continue;
        values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }

    return values;
}

const envFile = readEnvFile();
const pick = (key) => process.env[key] ?? envFile[key];

/** Compose service names -> the host-published (loopback-only, T-411) ports. */
function toHost(key, fallback) {
    const value = pick(key) ?? fallback;

    if (key === 'DATABASE_URL') return value.replace('@mysql:', '@127.0.0.1:');
    if (key === 'INFLUXDB_URL') return value.replace('//influxdb:', '//127.0.0.1:');
    if (key === 'MINIO_ENDPOINT') return value === 'minio' ? 'localhost' : value;

    return value;
}

const overrides = {
    DATABASE_URL: toHost('DATABASE_URL', 'mysql://water_user:supersecretuser@127.0.0.1:3306/water_ui'),
    INFLUXDB_URL: toHost('INFLUXDB_URL', 'http://127.0.0.1:8086'),
    MINIO_ENDPOINT: toHost('MINIO_ENDPOINT', 'localhost'),
};

if (!overrides.DATABASE_URL.includes('@')) {
    console.error('[start:host] could not work out DATABASE_URL - set it or copy .env.example to .env.');
    process.exit(1);
}

const [command, args] = useWatch ? ['tsx', ['watch', 'src/index.ts']] : ['node', ['dist/index.js']];

if (!useWatch && !existsSync(path.join(backendDir, 'dist', 'index.js'))) {
    console.error('[start:host] dist/index.js is missing - run `npm run build` first.');
    process.exit(1);
}

console.log('[start:host] starting the API against the Compose services on localhost');
console.log(`[start:host]   DATABASE_URL   = ${overrides.DATABASE_URL.replace(/:[^:@/]*@/, ':****@')}`);
console.log(`[start:host]   INFLUXDB_URL   = ${overrides.INFLUXDB_URL}`);
console.log(`[start:host]   MINIO_ENDPOINT = ${overrides.MINIO_ENDPOINT}`);

const child = spawn(command, args, {
    cwd: backendDir,
    stdio: 'inherit',
    shell: process.platform === 'win32' && useWatch, // only the tsx .cmd shim needs a shell
    env: { ...process.env, ...overrides },
});

// Forward the stop signal so the API's own SIGTERM drain runs (T-228).
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
    process.exit(signal ? 0 : (code ?? 0));
});
