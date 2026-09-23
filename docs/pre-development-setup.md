# Water UI - Pre-Development Setup & Configuration Files

This document mirrors **section 9 of [`MASTER_CONTEXT.md`](MASTER_CONTEXT.md)** (the source of truth).
Every `§` reference below points at that document. It covers the environment template, the
Compose service topology and the Prisma/database bootstrap - the foundation that has to work
before any application code runs.

---

## 9. Pre-Development & DevOps Setup (Docker, .env, Prisma)

### 9.1 `.env.example`
Lives at the repo root, is committed, and is copied to `.env` before starting the stack
(`cp .env.example .env`). **Never commit `.env`.** Every value below also has a working
default in `docker-compose.yml`, so an unmodified copy works for local development, and
the block is embedded here verbatim from the real file.

```env
# =============================================================================
# Water UI - environment template
#
# Copy to .env before starting the stack:  cp .env.example .env
# NEVER commit .env. Every value below has a working default in
# docker-compose.yml, so an unmodified .env also works for local development.
# =============================================================================

# --- Server -----------------------------------------------------------------
NODE_ENV=development
PORT=5000
TZ=Asia/Bangkok
# Interface the published *database/MinIO* ports bind to (T-411). 127.0.0.1 keeps
# MySQL, InfluxDB and MinIO reachable from this host only, so their development
# credentials are never exposed to the LAN. Set 0.0.0.0 deliberately if you need
# remote access - and rotate the passwords first (T-405).
BIND_HOST=127.0.0.1

# --- MySQL ------------------------------------------------------------------
MYSQL_ROOT_PASSWORD=supersecretroot
MYSQL_DATABASE=water_ui
MYSQL_USER=water_user
MYSQL_PASSWORD=supersecretuser
# Inside Docker the host is the service name (mysql), not localhost.
DATABASE_URL="mysql://water_user:supersecretuser@mysql:3306/water_ui"
MYSQL_PORT=3306
# TLS for the API -> MySQL connection. MySQL 8 authenticates the app user with
# caching_sha2_password, which cannot send the password over a plaintext socket
# after a MySQL restart (the server no longer holds the password digest, so the
# driver would have to fetch its RSA key) - that is T-229. `require` (default)
# encrypts using MySQL's self-signed certificate without verifying it, `verify`
# additionally checks the CA below, `disable` turns TLS off.
DB_TLS=require
# Only used with DB_TLS=verify, which also needs a server certificate whose SAN
# matches this host - MySQL's auto-generated one has no SAN, so mount your own
# CA-signed certificate first. Export the stock CA with:
#   docker cp water_ui_mysql:/var/lib/mysql/ca.pem ./docker/mysql/ca.pem
# DB_TLS_CA=./docker/mysql/ca.pem

# --- JWT --------------------------------------------------------------------
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# --- InfluxDB ---------------------------------------------------------------
# INFLUXDB_PASSWORD must be at least 8 characters (InfluxDB requirement).
INFLUXDB_USERNAME=waterui
INFLUXDB_PASSWORD=waterui-password
INFLUXDB_ORG=water_ui_org
INFLUXDB_BUCKET=water_quality_bucket
INFLUXDB_RETENTION=30d
INFLUXDB_TOKEN=waterui-dev-token-change-me
INFLUXDB_PORT=8086

# --- MQTT (Mosquitto) -------------------------------------------------------
# 1883 = MQTT (the XIAO ESP32C3 connects here)
# 9002 = MQTT over WebSockets (9001 is taken by the MinIO console)
# MQTT is the one port that MUST stay reachable from the LAN - the device publishes
# over Wi-Fi - so it deliberately ignores BIND_HOST and listens on all interfaces.
# Lock it down with a password file instead (docs/mqtt-topics.md section 7).
MQTT_PORT=1883
MQTT_WS_PORT=9002

# --- Node-RED ---------------------------------------------------------------
NODERED_PORT=1880
# Encrypts stored credentials in flows_cred.json. Change it, then delete
# iot/node-red/flows_cred.json once so credentials can be re-entered.
NODE_RED_CREDENTIAL_SECRET=water-ui-dev-credential-secret

# --- MinIO (profile picture storage) ---------------------------------------
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=profile-pictures
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

# --- Telegram alerts --------------------------------------------------------
# Leave blank until you have a bot; the alert branch stays inert without them.
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# --- Process lifecycle (T-228) ----------------------------------------------
# The API probes MySQL BEFORE it opens the port, so a deployment with no database
# exits non-zero with a clear log instead of serving 500s. Worst case for the probe is
# DB_BOOT_ATTEMPTS x DB_BOOT_TIMEOUT_MS (+ the delays in between).
# On SIGTERM/SIGINT it closes Socket.io, stops the HTTP server and drains the Prisma
# pool; a cleanly drained process that is still held open is forced out after
# SHUTDOWN_LINGER_MS, which must stay below the runtime's stop grace period (Docker's
# default is 10 s) or the orchestrator reports a SIGKILL (exit 137) for a good shutdown.
# DB_BOOT_ATTEMPTS=3
# DB_BOOT_DELAY_MS=1000
# DB_BOOT_TIMEOUT_MS=3500
# SHUTDOWN_LINGER_MS=2000
# SHUTDOWN_TIMEOUT_MS=10000

# --- Host ports for the app-profile services --------------------------------
BACKEND_PORT=5000
FRONTEND_PORT=80
```

Two more environment files exist and are **not** covered by the root template:

- `frontend/.env` — the RTK Query base URL and the Socket.io origin
  (template: `frontend/.env.example`).
- Node-RED reads the InfluxDB org/token/bucket from the same Compose environment
  (`docker-compose.yml` `nodered` service), not from a file in `iot/`.

`DB_TLS` is the API → MySQL TLS switch added for T-229: `require` (default) encrypts
without verifying the server certificate, `verify` also checks `DB_TLS_CA`, `disable`
turns TLS off. The Prisma CLI keeps using the plain `DATABASE_URL` and retrieves the
server's RSA key itself.

`BIND_HOST` (added for T-411) is the interface the **database and MinIO** port mappings
bind to. It defaults to `127.0.0.1`, so MySQL, InfluxDB and MinIO are reachable from this
host only and their development credentials never leave the machine. MQTT deliberately
ignores it because the ESP32C3 publishes over Wi-Fi.

### 9.2 `docker-compose.yml` — Service Topology
`docker-compose.yml` at the repo root defines **8 services** on the bridge network
`water_ui_network`. Six run by default; `backend` and `frontend` sit behind the `app`
profile and have never been built or started (T-401).

| Service | Image / build | Container | Host ports | Mounts | Profile |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `mysql` | `mysql:8.0` | `water_ui_mysql` | `127.0.0.1:${MYSQL_PORT:-3306}` → 3306 | `mysql_data`, `./docker/mysql/init` (ro) | default |
| `influxdb` | `influxdb:2.7` | `water_ui_influxdb` | `127.0.0.1:${INFLUXDB_PORT:-8086}` → 8086 | `influxdb_data`, `influxdb_config` | default |
| `mosquitto` | `eclipse-mosquitto:2` | `water_ui_mosquitto` | `0.0.0.0:${MQTT_PORT:-1883}` → 1883, `0.0.0.0:${MQTT_WS_PORT:-9002}` → 9001 | `./iot/mosquitto`, `mosquitto_data`, `mosquitto_log` | default |
| `nodered` | `nodered/node-red:latest` | `water_ui_nodered` | `0.0.0.0:${NODERED_PORT:-1880}` → 1880 | `./iot/node-red` → `/data` | default |
| `minio` | `quay.io/minio/minio:latest` | `water_ui_minio` | `127.0.0.1:${MINIO_PORT:-9000}` → 9000, `127.0.0.1:${MINIO_CONSOLE_PORT:-9001}` → 9001 | `minio_data` | default |
| `minio-init` | `quay.io/minio/mc:latest` | `water_ui_minio_init` | — | — | one-shot job |
| `backend` | build `./backend` | `water_ui_backend` | `${BACKEND_PORT:-5000}` → 5000 | — | `app` |
| `frontend` | build `./frontend` | `water_ui_frontend` | `${FRONTEND_PORT:-80}` → 80 | — | `app` |

The `BIND_HOST` prefix is written into the four database/MinIO mappings; the MQTT and
Node-RED mappings are deliberately left on all interfaces (see the notes below).

**Dependencies:** `nodered` → `mosquitto` + `influxdb`; `backend` → `mysql` + `influxdb`;
`frontend` → `backend`; `minio-init` → `minio` (it creates the `profile-pictures` bucket, T-005).
MinIO runs `server /data --console-address ":9001"`.

Notes that matter when changing this file:

- ✅ **T-411 (exposure half) done:** MySQL, InfluxDB and MinIO (S3 **and** console) are bound
  to `127.0.0.1`, so a machine on the same network can no longer reach the databases or
  MinIO directly. Verified live: all four ports answer on loopback and **refuse** the host's
  LAN address, while 1880/1883 still answer there - which proves the check itself is real.
  The credential half of T-411 (rotating the development passwords and removing the
  `supersecret*` / `minioadmin` placeholders from the repository) belongs to **T-405**, and
  the InfluxDB token rotation depends on **T-412**. Until then do **not** set
  `BIND_HOST=0.0.0.0`: the development credentials would be exposed again.
- ⚠️ **T-415 (P2, found while fixing T-411):** Node-RED's editor on `1880` is published on all
  interfaces and has **no authentication**, so anyone on the network can read and rewrite the
  pipeline (and the InfluxDB token is available inside it). Either give it `adminAuth` or bind
  it to loopback; it was left as-is here because that changes the editing workflow.
- ℹ️ **Mosquitto is intentionally LAN-facing:** the XIAO ESP32C3 publishes over Wi-Fi, so
  `1883`/`9002` must stay reachable. It is anonymous in development (`allow_anonymous true`,
  A8) - lock it down per `docs/mqtt-topics.md` §7, tracked as T-407.
- ✅ **A8 resolved:** Mosquitto WebSockets publish on host **9002**; MinIO keeps `9001`.
- ✅ **A9 resolved:** `iot/mosquitto/mosquitto.conf` and `iot/node-red/{settings.js,flows.json,package.json}`
  are bind-mounted into their containers (they are source, not generated state).
- ✅ **A17:** `docker/mysql/init/01-dev-grants.sh` is mounted read-only and runs once on an
  empty data directory to widen the app user so `prisma migrate dev` can create its shadow
  database. Dev only - production uses a least-privilege user with `prisma migrate deploy` (T-404).
- ⚠️ **T-410 (P0):** both database engines are past end-of-support (`mysql:8.0`, `influxdb:2.7`).
- ⚠️ **T-401:** the `app` profile images have never been built, so nginx proxying
  (`/api`, `/socket.io`) and in-container migrations are unverified (T-402).
- ⚠️ **T-412:** the InfluxDB bucket/org/token are provisioned by first-boot-only
  `DOCKER_INFLUXDB_INIT_*` variables; changing them later creates nothing.

### 9.3 Prisma / Database Bootstrap
- `backend/prisma/schema.prisma` defines the `User` and `Board` models mirroring §4.1.
  `backend/prisma/seed.ts` (TypeScript, run with `tsx` - not `seed.js`) inserts the single
  profile and one sample board; both writes are upserts, so re-running is safe.
- **Applied already (T-222):** migration `20260922042622_init`; `SHOW TABLES` returns
  `_prisma_migrations`, `boards`, `users`; the seed created user `admin@waterui.local` and
  board `AA240238`. Reconciling the live tables against §4.1 (T-223) found the two drifts in **A23**.
- Prisma 7 specifics that must not be "simplified" (A15): the `prisma-client` generator emits
  TypeScript into the git-ignored `src/generated/prisma`; the datasource block has **no** `url`
  (the CLI reads `DATABASE_URL` through `prisma.config.ts`); MySQL needs the
  `@prisma/adapter-mariadb` driver adapter at runtime. This is why the backend is TypeScript.
- Connection security: the CLI uses the plaintext `DATABASE_URL` and fetches the server's RSA
  key itself; the running API adds TLS according to `DB_TLS` (T-229 / A24).
  `require_secure_transport` is deliberately left **OFF** so both CLIs keep working.
- Runtime lifecycle (**T-228**, `src/lifecycle.ts`): the API probes MySQL with `SELECT 1`
  **before** it opens the port and exits 1 with a clear log if MySQL never answers, so a broken
  deployment cannot serve 500s (bounded: `DB_BOOT_ATTEMPTS` x `DB_BOOT_TIMEOUT_MS` - the driver
  itself waits 10 s per attempt, which is not "fail fast"). On SIGTERM/SIGINT - i.e.
  `docker compose stop backend` - it closes Socket.io, stops accepting connections and drains
  the Prisma pool. A process still held open *after* a clean drain is forced out with the same
  success code after `SHUTDOWN_LINGER_MS`, which must stay below Docker's 10 s stop grace
  period or the runtime reports a SIGKILL (exit 137) for a shutdown that actually worked.
  Verified: unreachable MySQL -> exit 1 in 13 s with nothing listening; real SIGTERM in a Linux
  container -> handler runs and the container exits 0 in ~2.6 s.
- **Host-run convenience (T-231):** `npm run start:host` (built `dist/`) and
  `npm run dev:host` (`tsx watch`) in `backend/` start the API against the Compose
  containers. They rewrite the three service-name values a host process cannot resolve
  (`@mysql:` -> `127.0.0.1:`, `//influxdb:` -> `//127.0.0.1:`, `minio` -> `localhost`),
  reading `backend/.env` first, so no manual `export` lines are needed. Only MySQL is
  strictly required - without it the boot probe (T-228) refuses to start.
- `board_id` uniqueness is case-INSENSITIVE under MySQL's default collation while the InfluxDB
  tag is case-sensitive - **T-230**.
- Bootstrap order from scratch: `cp .env.example .env` → `docker compose up -d` →
  `cd backend && npm install && npx prisma migrate deploy && npm run prisma:seed`. Proving
  this on a clean volume is **T-226**.
