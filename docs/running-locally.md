# Running Water UI locally (all-in-Docker)

Everything — databases, IoT pipeline, API and dashboard — runs in containers on
your machine. This is the "one command gets me the whole product" path.

**Trade-off to know up front:** the containers run *built* artifacts
(`node dist/index.js`, and nginx serving a compiled Vite bundle). There is **no
hot reload**: after editing code you re-run the build. If you want to change a
file and see it instantly, run the API and dashboard on the host instead — see
[Host-run alternative](#host-run-alternative).

---

## 1. What runs, and where to reach it

Verified from a live stack:

| Service | URL / port | Notes |
|---|---|---|
| **Dashboard** | <http://localhost> | nginx, port 80. Serves the SPA and proxies the API |
| **API** | <http://localhost/api/...> | via nginx, same origin — no CORS |
| | <http://localhost:5000> | direct, for `curl` debugging |
| Node-RED editor | <http://localhost:1880> | the IoT pipeline. **No auth in dev** |
| MinIO console | <http://localhost:9001> | profile-picture storage |
| MySQL | `127.0.0.1:3306` | `water_user` / `supersecretuser` |
| InfluxDB | <http://127.0.0.1:8086> | telemetry, token in `.env` |
| MQTT | `localhost:1883` | where the ESP32C3 publishes |

Only 80, 5000, 1880, 1883 and 9002 are reachable from other machines on your
LAN. The databases and MinIO bind to `127.0.0.1` (T-411).

Prerequisites: **Docker Desktop** only. The all-Docker path needs no local Node.

---

## 2. First-time setup

```bash
# from the repository root

# 1. Environment. The repo already ships defaults for every value, so this is
#    only needed if .env is missing.
cp .env.example .env

# 2. Build and start everything, infrastructure + app.
docker compose --profile app up -d --build

# 3. Apply the database schema (creates tables on an empty volume).
docker compose --profile app exec backend npm run prisma:deploy

# 4. Create the first profile and a sample board. Both are upserts, so running
#    it again is safe.
docker compose --profile app exec backend npm run prisma:seed
```

Open <http://localhost> and log in with the seeded account:

| | |
|---|---|
| Email | `admin@waterui.local` |
| Password | value of `SEED_PASSWORD` in `backend/.env` (default `waterui123`) |

`--profile app` is required on **every** command that touches `backend` or
`frontend`, because those two services are behind a Compose profile. Setting
`COMPOSE_PROFILES=app` in `.env` lets you drop it.

Give it ~20 s after `up`: the API probes MySQL before it opens its port and
exits non-zero if the database never answers (T-228), and MySQL itself takes a
few seconds to initialise on an empty volume.

---

## 3. Checking that it actually works

Run these in order; each one exercises a different layer.

```bash
# 1. Dashboard bundle is served
curl -sI http://localhost | head -1                       # HTTP/1.1 200 OK

# 2. SPA fallback works (React Router owns /boards)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/boards   # 200

# 3. API reachable through the nginx proxy. Verified pass condition is 401:
#    it proves nginx proxied to Express AND the auth middleware ran.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/boards   # 401

# 4. Login works and issues a JWT
curl -s -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@waterui.local","password":"waterui123"}'
# -> {"token":"eyJ...","user":{...}}

# 5. Socket.io upgrade is proxied (needed for live dashboard updates)
curl -s 'http://localhost/socket.io/?EIO=4&transport=polling' | head -c 60
# -> 0{"sid":"...","upgrades":["websocket"],...}
```

### Proving the IoT pipeline end to end

This is the test that matters most, because it crosses MQTT → Node-RED →
InfluxDB → API → UI. Publish a reading exactly as the ESP32 does, then read it
back through the API:

```bash
# Publish (note the topic shape: sensors/<boardId>/data)
docker compose exec -T mosquitto mosquitto_pub \
  -h localhost -p 1883 \
  -t sensors/AA240238/data \
  -m '{"boardID":"AA240238","pH":6.66,"turbidity":12.5,"batt_voltage":3.91,"rssi":-58}'

# Read back. Get a token first (step 4 above), then:
TOKEN=... # paste the token
curl -s http://localhost/api/dashboard/latest/AA240238 \
  -H "Authorization: Bearer $TOKEN"
```

A working pipeline returns `"influxAvailable": true`, `isOnline: true`, a
`lastSeen` of just now, and `pH: 6.66`. If `influxAvailable` is false, Node-RED
never reached InfluxDB — check `docker compose logs nodered`.

---

## 4. Day-to-day commands

```bash
# Logs
docker compose logs -f backend
docker compose logs -f frontend nodered

# Restart one service (no rebuild)
docker compose --profile app restart backend

# After changing backend or frontend source: rebuild, then restart
docker compose --profile app up -d --build backend frontend

# After adding a Prisma migration
docker compose --profile app exec backend npm run prisma:deploy

# Shell inside the API (has the Prisma CLI and tsx)
docker compose --profile app exec backend sh

# Prisma Studio, browsing the database
docker compose --profile app exec backend npm run prisma:studio

# Stop, keeping all data
docker compose --profile app down

# Stop and DESTROY all data (volumes included) - asks nothing
docker compose --profile app down -v
```

> ⚠️ `down -v` deletes `mysql_data` and `influxdb_data`. The InfluxDB token and
> onboarding are created **only on first boot** against an empty volume, so
> re-creating it means re-running `deploy-stack`-style setup from scratch.

---

## 5. Host-run alternative

If you want hot reload for the API and dashboard — edit a file, see it
immediately — keep the infrastructure in Docker and run the app with `npm`:

```bash
docker compose up -d                    # infrastructure only (no app profile)

# terminal 1
cd backend && npm install
npm run dev:host                        # tsx watch, against the Compose services

# terminal 2
cd frontend && npm install
npm run dev                             # Vite on http://localhost:5173
```

`dev:host` (T-231) exists because `backend/.env` uses the Compose service names
(`@mysql:`, `//influxdb:`) which do not resolve from the host. It rewrites
exactly those three to `localhost`, so no manual `export` lines are needed.

Vite proxies `/api` and `/socket.io` to `localhost:5000` (see
`frontend/vite.config.js`), so the browser stays same-origin. Override with
`VITE_PROXY_TARGET` if you move the API.

Requires Node >= 24.

---

## 6. Troubleshooting

These are the real failures hit while making this path work, with what causes
them.

### Build fails: `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`

`prisma generate` runs during `docker build`, and Prisma 7 loads
`prisma.config.ts` for every CLI command — that file resolves the datasource
with `env('DATABASE_URL')`, which throws when unset, even though `generate`
never opens a connection.

**Fixed** in `backend/Dockerfile`: the build stage sets a throwaway
`DATABASE_URL`. The placeholder is confined to the build stage so it cannot leak
into the runtime image, where a wrong-but-present URL would be worse than a
clear error.

### Build succeeds, then `sh: 1: tsx: not found`

`npm run prisma:seed` is `tsx prisma/seed.ts`, but `tsx` was never installed.
`ENV NODE_ENV=production` in the runtime stage makes `npm ci` omit
devDependencies — which silently defeated the comment right below it claiming
they were installed on purpose. `prisma` and `typescript` only *appeared*
present because they arrive transitively via `@prisma/client`.

**Fixed** in `backend/Dockerfile` with an explicit
`npm ci --include=dev || npm install --include=dev`, so the intent survives even
if the `ENV` line moves.

### `Error: Cannot find module '../src/generated/prisma/client'`

`prisma/seed.ts` imports the generated client from `../src/generated/prisma`,
but the runtime image only copied `dist/`, and `src/` does not exist there.

**Fixed** by copying just the generated client
(`COPY --from=build /app/src/generated ./src/generated`) — not all of `src/`,
so the sources stay out of the runtime image.

Together, the two above meant the first-deploy sequence could never complete:
migrations applied, seeding always failed. Both are verified working against a
genuinely empty database.

### `ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false`

nginx sets `X-Forwarded-For`, but Express had no `trust proxy` setting, so
`express-rate-limit` logged this on **every** proxied request — and, more
importantly, treated every client as the nginx container's single IP, so all
users shared one 300 req/min bucket.

**Fixed** via a new opt-in `TRUST_PROXY` variable (`backend/src/index.ts`), set
to `1` by both compose stacks. It is opt-in on purpose: trusting a proxy that
is not actually in front of the API would let a client forge
`X-Forwarded-For` and pick its own rate-limit bucket.

### Readings reach InfluxDB but the dashboard never updates live

The Node-RED "Notify Express" node posts to `BACKEND_URL`. The repository `.env`
sets it to `http://host.docker.internal:5000` for the *host-run* workflow
(T-333). That still works in the all-Docker path because the API publishes port
5000, but the direct value is better here:

```env
# .env
BACKEND_URL=http://backend:5000
```

### Port 80 already in use

Something else owns port 80 (IIS, another stack, Skype). Either stop it or move
the dashboard:

```env
# .env
FRONTEND_PORT=8080
```

### `docker compose exec` says the service is not running

You forgot `--profile app`. Those two services only start with the profile
enabled.

### Dashboard loads but every request 401s

You are not logged in, or the JWT expired (`JWT_EXPIRES_IN`, default 7d). Log
in again at <http://localhost>.

---

## 7. Note on the OCI deployment

This document covers running on your machine. For the Oracle Cloud deployment
the stack is different and deliberately hardened — TLS, MQTT authentication,
Node-RED login, no root-level MySQL grants. See
[`deploy/README.md`](../deploy/README.md). The `backend/Dockerfile` fixes above
apply to both paths, since both build the same image.
