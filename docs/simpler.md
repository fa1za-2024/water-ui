# Water UI — Simplification Plan for Railway

Analysis date: 2026-09-24
Scope: reduce the number of Railway services and the amount of moving parts without losing the
features that matter.

> This is a **recommendation document**, not a change. Nothing here has been implemented.
> Each lever names the files it would touch so the work can be tracked as `T-xxx` tasks
> (Rule 8) before any code changes.

---

## 1. TL;DR

Water UI runs on Railway as **7 services**. That is a lot of configuration, variables,
Dockerfiles, healthchecks and failure modes for an app whose only data producer is a handful
of ESP32 boards.

The biggest wins, in order:

| # | Change | Services saved | Effort | Risk |
| :-- | :--- | :--- | :--- | :--- |
| L1 | **Serve the React build from the backend** (drop nginx/frontend service) | −1 | Low | Low |
| L2 | **Remove MinIO** (drop avatars, or store a small image in MySQL) | −1 | Low | Low |
| L3 | **Remove the User module** (single env-configured login, or no login) | 0 | Low | Low–High* |
| L4 | **Fold the Node-RED pipeline into the backend** | −1 | Medium | Medium |
| L5 | **Move MQTT to a managed broker** (drop Mosquitto + TCP proxy) | −1 | Medium | Low |
| L6 | **Collapse to one database** (SQLite instead of MySQL, or MySQL instead of InfluxDB) | −1 | High | High |

\* Risk of L3 depends on the tier: keeping a login is low risk, removing auth entirely is high.

**Recommended target (4 services):**

```
   backend  (Express API + Socket.io + MQTT ingest + React SPA)
      │
      ├── MySQL        (board registry; users table gone)
      ├── InfluxDB     (telemetry)
      └── Mosquitto    (or an external TLS broker)
```

**Aggressive target (2 services):** the same `backend` with SQLite on a volume + InfluxDB, and
MQTT on a hosted broker. One Railway service + one managed database.

Start with **Phase 1 (L1 + L2)**: two services removed, no behaviour lost, no schema rewrite.

---

## 2. Current shape — 7 services

Source: [`deploy/railway/README.md`](../deploy/railway/README.md) §2 and
[`docker-compose.yml`](../docker-compose.yml).

| Service | Kind | Built from | Public | Volume | Why it exists |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MySQL` | Railway template | — | no | managed | `users` + `boards` tables |
| `InfluxDB` | Railway template | — | no | managed | all telemetry (`pH`, `turbidity`, …) |
| `backend` | repo | `backend/` | no | — | REST API + Socket.io |
| `frontend` | repo | `frontend/` | HTTPS domain | — | nginx serving the SPA, proxying `/api` |
| `mosquitto` | repo | `deploy/railway/mosquitto/` | **TCP proxy** | `/mosquitto/data` | MQTT broker for the devices |
| `minio` | repo | `deploy/railway/minio/` | HTTPS domain | `/data` | profile-picture object storage |
| `node-red` | repo | `iot/node-red/` | HTTPS domain | — | MQTT → validate/derive → InfluxDB + Telegram + notify API |

### Pain points this creates

- **5 custom Dockerfiles** (`backend`, `frontend`, `mosquitto`, `minio`, `node-red`), each needing
  a Root Directory set correctly in the dashboard or the build fails with a Railpack error.
- **A raw, unencrypted TCP proxy** for MQTT. From `deploy/railway/README.md` §1: credentials and
  every reading cross the public internet in the clear. This is a genuine security regression
  versus the retired OCI deployment, which had TLS on `8883`.
- **A public Node-RED editor** whose admin password hash must be provisioned, whose flow edits
  do not survive a redeploy, and which holds an InfluxDB token.
- **Cross-service variable soup**: `MINIO_PUBLIC_URL`, `BACKEND_UPSTREAM`, `CORS_ORIGIN`,
  `MQTT_HOST` on two services, `INFLUX_*` on two services, seven per-service variable lists.
- **MySQL TLS complexity** (`DB_TLS`, `caching_sha2_password`, a documented restart bug) that
  exists purely because a managed MySQL is in the path.
- **The `frontend` → `backend` hop** exists only because the SPA is served by nginx. The frontend
  already calls a **relative** `/api` base (`frontend/src/api/apiSlice.js`), so a same-origin
  backend could serve it directly — no CORS, no `BACKEND_UPSTREAM`, no extra domain.

---

## 3. Simplification levers

### L1 — Serve the React build from the backend  *(remove 1 service)*

**What changes.** Merge `frontend` into `backend`. The backend already owns the HTTP server that
Socket.io runs on (`backend/src/index.ts`); add `express.static()` for the Vite build plus an SPA
fallback, and delete the `frontend` service and its nginx image.

```
before:  browser ─▶ frontend (nginx) ─/api,/socket.io─▶ backend ─▶ MySQL / InfluxDB
after:   browser ─▶ backend (Express) ─▶ MySQL / InfluxDB
```

**What it removes**
- The whole `frontend` Railway service, its HTTPS domain, its healthcheck and its Dockerfile.
- `frontend/nginx.conf.template` and the `BACKEND_UPSTREAM` variable.
- `CORS_ORIGIN` on the backend — the browser becomes same-origin (the frontend already requests
  `/api` relatively, so nothing in `frontend/src` needs to change).
- The nginx→backend proxy trust hop; `TRUST_PROXY` can be dropped or left at `0`.

**What stays**
- `frontend/` as a source folder — it is still built, just copied into the backend image
  (`COPY --from=build /app/frontend/dist ./public`).
- Socket.io — it still runs on the same Express server (`backend/src/config/socket.ts`). Because
  the SPA and the socket share an origin, the client needs no URL change.

**Effort:** Low. **Risk:** Low. **Verdict: do it.** This is a standard "one container, one
domain" shape and removes an entire nginx service for no feature loss.

**Touch points**
- `backend/Dockerfile` — add a frontend build stage, copy `dist/` into the runtime image.
- `backend/src/index.ts` — `express.static()` + SPA fallback mounted **after** the API routes and
  **before** `notFound`.
- `backend/railway.json` — healthcheck can stay `/health`.
- Delete `frontend/railway.json`; remove the `frontend` service from Railway.
- `docker-compose.yml` — optionally keep the local compose split (dev convenience); it is not the
  deployment.

---

### L2 — Remove MinIO  *(remove 1 service)*  ·  *your example*

**What MinIO actually does today:** stores exactly one kind of object — the single user's avatar
(`backend/src/config/minio.ts`, `POST /api/users/upload-avatar`). Nothing else in the repository
reads or writes an object. The bucket is `profile-pictures`.

**Where it appears**
- Service/infra: `deploy/railway/minio/` (`Dockerfile`, `railway.json`), `docker-compose.yml`
  services `minio` + `minio-init`, volume `minio_data`, `BIND_HOST` port mappings.
- Backend: `src/config/minio.ts`, the `uploadAvatar` handler + `ensureBucket()` call in
  `src/controllers/userController.ts`, the multer route in `src/routes/userRoutes.ts`,
  dependencies `minio`, `multer`, `@types/multer`.
- Data: `User.profilePictureUrl` in `prisma/schema.prisma` + the initial migration.
- Frontend: the avatar upload UI in `components/profile/ProfileModal.jsx`, the
  `uploadAvatar` endpoint in `api/authApi.js`.
- Config/docs: `MINIO_*` in `.env.example`, `backend/.env.example`, `docker-compose.yml`,
  `deploy/railway/README.md`, `docs/technology.md`, `docs/modules.md`, `docs/database.md`,
  `docs/project-structure.md`, `MASTER_CONTEXT.md`.

**Three ways to remove it**

| Option | What you get | Cost |
| :--- | :--- | :--- |
| **A. Drop avatars** | `ProfileModal.jsx` already renders initials as its fallback (`initials` span), so removing the upload branch is a deletion, not new UI. | Lowest. Loses a cosmetic feature. |
| **B. Data-URI in MySQL** | Store a small (e.g. 64×64, <8 KB) resized avatar as a base64 data URI in a `TEXT`/`MEDIUMTEXT` column. No service, no bucket, survives redeploys. | Needs image resizing on upload (e.g. `sharp`) + a column type change. |
| **C. Browser-local avatar** | Keep the picture only in `localStorage`, never sent to the server. | Zero backend work, but it is per-device and not really "stored". |

**Recommendation:** **A** if the avatar is not a requirement; **B** if it is. Both delete the same
service and the same `MINIO_*` variable block.

**Effort:** Low. **Risk:** Low. **Verdict: do it** — a dedicated object store for one 2 MB image
is the clearest over-engineering in the stack.

---

### L3 — Remove the User module  *(your example)*

The system is **already single-user with no RBAC** (Rule 1, `MASTER_CONTEXT.md` §3). The `users`
table holds exactly one row, created by the seed (`backend/prisma/seed.ts`). Authentication is
therefore a fairly large amount of machinery guarding a single credential.

Three tiers, from least to most aggressive:

#### Tier U1 — Keep login, delete profile management
Remove the profile-edit and avatar features, keep `POST /api/auth/login` / `GET /api/auth/me`.
- Deletes: `PUT /api/users/profile`, `PUT /api/users/password`, `POST /api/users/upload-avatar`,
  most of `userController.ts`, most of `ProfileModal.jsx`.
- Keeps: `User` model, bcrypt, JWT, the one seeded profile.
- Good first step that pairs naturally with L2.

#### Tier U2 — Replace the DB user with one env-configured credential *(recommended)*
The credential becomes a single set of environment variables instead of a table, a model and a CRUD
module. **The login page and JWT stay** — this is not "no auth", it is "no user database".

- **Deletes**
  - Backend: `controllers/userController.ts`, `routes/userRoutes.ts`, `types/user.ts`, the `User`
    part of `prisma/seed.ts`.
  - Prisma: the `User` model + a migration dropping the `users` table.
  - Frontend: `components/profile/ProfileModal.jsx`, the profile/avatar endpoints in
    `api/authApi.js`, and the profile entry in `components/layout/Header.jsx`.
  - Dependencies: `bcrypt` (if the env credential is compared directly), plus `multer` and
    `@types/multer` once L2 is done.
- **Keeps / shrinks**
  - `controllers/authController.ts` shrinks to a single `login` that compares the submitted
    password against `ADMIN_PASSWORD` (or a pre-computed `ADMIN_PASSWORD_HASH`) and issues the same
    short-lived JWT. `POST /api/auth/register` and `GET /api/auth/me` go away.
  - `middleware/authMiddleware.ts`, `pages/Login.jsx`, `hooks/useAuth.js`,
    `components/layout/ProtectedRoute.jsx`, `store/slices/authSlice.js` and the guard in
    `routes.js` all stay — the token flow is unchanged.
- **Variables:** `JWT_SECRET` stays; `SEED_PASSWORD`, `ALLOW_REGISTRATION` and the whole
  `prisma:seed` step disappear. Add `ADMIN_PASSWORD` (plus, if you like, `ADMIN_EMAIL`).

**Effort:** Low. **Risk:** Low. **Verdict: recommended** — this is what "remove user" should mean
in practice. It removes a table, a model, a seed step, a profile page and 6 endpoints (4 under
`/api/users` plus `register` and `me`) while keeping the dashboard private.

#### Tier U3 — No authentication at all
Delete `authMiddleware` from the `boards`, `dashboard`, `historical` and `simulator` routes.

- Also removes: `controllers/authController.ts`, `routes/authRoutes.ts`,
  `middleware/authMiddleware.ts`, `types/user.ts`, the `User` model, `jsonwebtoken`/`bcrypt`,
  `pages/Login.jsx`, `hooks/useAuth.js`, `components/layout/ProtectedRoute.jsx`, `api/authApi.js`,
  `store/slices/authSlice.js` and the guard in `routes.js`.
- **Warning:** `boards` exposes `POST/PUT/PATCH/DELETE`. With no auth, **anyone who learns the
  domain can delete or re-point every board**, and the Simulator route can publish arbitrary MQTT
  values. Only acceptable if the deployment is genuinely private (VPN / IP allow-list).
- **Verdict: not recommended** on a public Railway domain.

---

### L4 — Fold the Node-RED pipeline into the backend  *(remove 1 service)*

**What Node-RED does** ([`iot/node-red/flows.json`](../iot/node-red/flows.json)): subscribe to
`sensors/+/data`, parse with `parseFloat`/`parseInt`, derive `wq_status` / `batt_level` /
`wifi_status`, then three branches — write InfluxDB, `POST /api/internal/sensor-update` (which the
backend turns into a Socket.io emit), and a rate-limited Telegram alert.

**Every one of those pieces already exists in the backend or is trivial there:**
- `mqtt` is already a backend dependency (used by `services/simulatorService.ts`).
- `@influxdata/influxdb-client` is already a backend dependency (`config/influx.ts`).
- Telegram needs no new library: Node 24 has global `fetch`, so one
  `POST https://api.telegram.org/bot<token>/sendMessage` call is enough.

**Proposed replacement:** a single `backend/src/services/ingestService.ts` that owns an MQTT client
(`sensors/+/data`), validates and derives statuses with the same thresholds, writes to InfluxDB,
emits over Socket.io, and sends the rate-limited Telegram alert. Wire it into
`backend/src/index.ts` and the existing shutdown handler in `lifecycle.ts`.

**What it removes**
- The `node-red` service, its HTTPS domain, its Dockerfile and its `railway.json`.
- The `iot/node-red/` folder: `flows.json`, `settings.js`, `package.json`,
  `node-red-contrib-telegrambot`, and the `.config.*` runtime artefacts.
- The public flow editor and its `NODE_RED_ADMIN_PASSWORD_HASH` provisioning — and with it the
  risk of anyone who reaches the domain rewriting the pipeline or reading the InfluxDB token.
- The "editor changes do not survive a redeploy" trap (`deploy/railway/README.md` §7).
- `NODE_RED_*`, `BACKEND_URL` and the duplicated `INFLUX_*` / `MQTT_*` variables on that service.

**What changes conceptually**
- The pipeline becomes **code**: reviewable, testable, versioned. For a fixed 6-step pipeline that
  never needs re-shaping at runtime, this is strictly simpler than a visual editor.
- Keep Rule 6 honest: the `parseFloat`/`parseInt` casting still happens — just in TypeScript now.
- LIVE updates stay Rule 5 compliant: the MQTT handler emits straight to Socket.io, so there is
  still no polling. If you prefer, the handler can keep calling the internal
  `POST /api/internal/sensor-update` endpoint and nothing guards it.

**Effort:** Medium (one new service file + wiring). **Risk:** Medium (this is the data path; needs
a real end-to-end test with a device or the simulator). **Verdict: recommended if you want the
biggest architectural win.**

---

### L5 — Move MQTT to a managed broker  *(remove 1 service + the TCP proxy)*

Mosquitto is the one service that must accept **inbound** connections from devices in the field,
which is why Railway exposes it through a raw TCP proxy — unencrypted. A hosted MQTT broker
removes that service and fixes the security regression at the same time.

**Candidates:** HiveMQ Cloud (free tier), EMQX Cloud (serverless free tier), or any broker you
already run. All offer TLS on `8883` with username/password auth.

**What changes**
- Remove the `mosquitto` service, `deploy/railway/mosquitto/` (`Dockerfile`, `mosquitto.conf`,
  `start.sh`, `railway.json`) and its volume, plus the TCP proxy.
- Set `MQTT_HOST`, `MQTT_PORT=8883`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_USE_TLS=true` for the
  backend ingest (L4) and for the firmware.
- The firmware **already supports TLS** — `iot/esp32c3/water_quality_mqtt.ino` has
  `MQTT_USE_TLS`; flip it to `1` and point at the broker's hostname. No firmware rewrite.
- Devices now connect over `8883` with a real certificate instead of a raw `shuttle.proxy.rlwy.net`
  port.

**Effort:** Medium (provision the broker, rotate credentials, reflash/update firmware config).
**Risk:** Low. **Verdict: recommended** if you are comfortable with one external free-tier
dependency; it is the only lever that simultaneously simplifies *and* hardens the system.

---

### L6 — Optional: collapse to one database  *(save 1–2 services, high effort)*

Two databases (MySQL + InfluxDB) are two managed services, two sets of credentials and two clients.
This is the hardest lever and should only be attempted after L1–L5.

- **Replace MySQL with SQLite** (Prisma + a `better-sqlite3` adapter, DB file on a Railway volume).
  Only the board registry remains after L3, so a single-file database is plenty. Removes the MySQL
  service, `DB_TLS`, the `mariadb` adapter, the `prisma migrate deploy` pre-deploy step and the
  `caching_sha2_password` restart bug. **This is the most attractive version of L6.**
- **Replace InfluxDB with a `readings` table.** Only worth it for a very small deployment. It
  means rewriting `services/influxService.ts`, the downsampling (`aggregateWindow`), the historical
  queries and the export. **Not recommended** — InfluxDB is the right tool and the queries are
  already written.

**Verdict:** do the SQLite part only if L3 already removed the last reason for MySQL.
**Alternative — put the board registry into InfluxDB itself?** See [§9](#9-follow-up-can-influxdb-be-the-only-database): possible, but a worse fit than SQLite.

---

## 4. Recommended staged plan

### Phase 1 — Quick wins (do this first)
**L1 + L2.** Five services remain. No schema rewrite, no data-path change, no new dependency.

```
backend(+SPA) · MySQL · InfluxDB · mosquitto · node-red
```

### Phase 2 — Architectural simplification
**L4 (+ L3 U2).** Four services, no Node-RED editor, no user table, no seed step.

```
   backend  (Express + Socket.io + MQTT ingest + React SPA)
      ├── MySQL      (boards only)
      ├── InfluxDB   (telemetry)
      └── Mosquitto  (devices)
```

### Phase 3 — Minimum footprint (optional)
**L5 + L6 (SQLite).** Two Railway services.

```
   backend(+SPA, SQLite)  ──TLS──▶  InfluxDB
          │
          └──▶ managed MQTT broker (HiveMQ / EMQX)
```

---

## 5. Impact summary

| Lever | Services after | Custom Dockerfiles after | Variables removed | Security effect |
| :--- | :--- | :--- | :--- | :--- |
| (today) | 7 | 5 | — | raw TCP MQTT, public Node-RED |
| L1 | 6 | 4 | `BACKEND_UPSTREAM`, `CORS_ORIGIN` | same-origin, smaller surface |
| +L2 | 5 | 3 | `MINIO_*` (≈8 vars) | fewer public endpoints |
| +L4 | 4 | 2 | `NODE_RED_*`, `BACKEND_URL` | no public flow editor |
| +L5 | 3 | 1 | `MQTT_*` on 2 services | **TLS MQTT** |
| +L6 (SQLite) | 2 | 1 | `DATABASE_URL`, `DB_TLS`, `MYSQL_*` | no DB network hop |

**Cost.** Railway bills by usage (RAM/CPU/network) plus plan; every idle service still holds a
baseline of memory and adds dashboard/config overhead. Removing 3–5 services lowers the baseline
and the number of things that can fail independently. Managed database templates are separate line
items; SQLite (L6) removes one of them entirely.

---

## 6. What NOT to remove

| Keep | Why |
| :--- | :--- |
| **InfluxDB** | It is the time-series store the whole product is built on; the downsampling and historical queries are already implemented against it. |
| **Socket.io live path** | Rule 5 — all live updates flow through Socket.io → Redux → UI. No polling. |
| **`exceljs` on the backend** | Rule 3 — export is generated server-side. |
| **`react-leaflet`** | Rule 4 — map library is fixed. |
| **A login gate** | Unless the deployment is private, board delete/re-point and the simulator must not be public (see L3 U3). |
| **Mosquitto** *(if not doing L5)* | Devices publish MQTT; something must accept that inbound connection. |
| **The IoT esp32c3 firmware** | That is the product's data source. |

Small bonus cleanups that are unrelated to services but reduce noise:
- Delete the root `node-red.md` duplicate (already tracked as **T-503**).
- Delete `docs/MASTER_CONTEXT.md.bak` (flagged in `docs/project-structure.md`).
- Consider removing the **Simulator** page from production builds — it is a development tool
  (`frontend/src/components/layout/Sidebar.jsx` calls it "a development tool") that can publish
  arbitrary MQTT payloads behind a login.

---

## 7. Documentation and rule conflicts to resolve

`MASTER_CONTEXT.md` is the source of truth (Rule 8), so **each accepted lever must update it and
the mirrors in the same change**. The specific conflicts:

| Lever | Document / rule that becomes stale |
| :--- | :--- |
| L1 | `technology.md` "Reverse proxy: Nginx"; `docs/project-structure.md` `frontend/nginx.conf`; `deploy/railway/README.md` §3.5 / §4 `frontend`. |
| L2 | `technology.md` "File storage: MinIO (S3-compatible)"; `modules.md` §1 profile picture; `database.md` `profile_picture_url`; `MASTER_CONTEXT.md` §2 and §4.1. |
| L3 | `MASTER_CONTEXT.md` §4.1 `users` table and §6.1 endpoints; `modules.md` §1; `database.md`. Rule 1 (no RBAC) actually *supports* this. |
| L4 | `technology.md` §1/§2 "IoT pipeline: Node-RED"; `MASTER_CONTEXT.md` §1 (steps 2–3) and §5; `docs/node-red.md` and `docs/mqtt-topics.md`; the mapping table row for Node-RED. |
| L5 | `mosquitto` sections of `MASTER_CONTEXT.md` §9, `deploy/railway/README.md` §1/§8 (TLS note becomes obsolete — in a good way). |
| L6 | `MASTER_CONTEXT.md` §4 "MySQL & InfluxDB"; `database.md`; `pre-development-setup.md`; the Prisma datasource + adapter notes. |

Because Rule 8 requires a tracker entry **before** the work, the implementation order is:
1. Open a `T-4xx` (DevOps) task per accepted lever, with acceptance criteria.
2. Make the code change.
3. Update `MASTER_CONTEXT.md` + the matching mirror in the same change.
4. Mark the task `[x]` with the evidence (a deploy that shows the smaller service list, an
   end-to-end reading, etc.).

---

## 8. Decision matrix

| Lever | Feature lost | Effort | Payoff | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| L1 frontend → backend | none | Low | −1 service, −1 domain, no CORS | **Do now** |
| L2 remove MinIO | avatar picture (or move it into MySQL) | Low | −1 service, −8 vars | **Do now** |
| L3 U2 remove user table | profile page, change-password UI | Low | −1 table, −6 endpoints, −1 seed step | **Recommended** |
| L4 Node-RED → backend | visual flow editor | Medium | −1 service, −1 public editor, pipeline in code | **Recommended** |
| L5 external MQTT | self-hosted broker | Medium | −1 service, **TLS instead of raw TCP** | **Recommended** |
| L6 SQLite instead of MySQL | managed MySQL, multi-writer | High | −1 database service | Optional, after L3 |
| L6 InfluxDB → MySQL | Flux/downsampling | Very high | −1 database service | **Do not** |
| L7 InfluxDB as the *only* DB (registry into InfluxDB) | SQL transactions/UNIQUE, easy updates | High | −1 MySQL service (same 2-service total as L6) | **Not recommended** — use L6 SQLite (§9) |
| L3 U3 no auth | any access control | Low | −JWT/bcrypt | Only if private |

### Bottom line

- If you only do one thing: **L1** — it removes a whole service and a whole hop with near-zero risk.
- If you want the system to *feel* small: do **L1 + L2 + L4 + L5**, which takes Railway from
  **7 services to 3**, removes 4 of the 5 custom Dockerfiles, and replaces the unencrypted MQTT TCP
  proxy with a TLS broker.
- Add **L3 U2** (and optionally **L6 SQLite**) to reach **2 services**, at which point the whole
  deployment is one application container plus a time-series database. Storing the board registry
  in InfluxDB reaches the *same* 2 services with more risk — see §9.

---

## 9. Follow-up: can InfluxDB be the only database?

**Short answer: technically yes — but only after the User module is gone, and it is a worse fit than
SQLite for reaching the same service count.**

### 9.1 What would actually move

After **L3 U2**, MySQL holds exactly one table, `boards` (`backend/prisma/schema.prisma`), with six
real columns: `board_id`, `board_mac_address`, `location_name`, `latitude`, `longitude`,
`is_active`. So "InfluxDB only" really means **store the board registry in InfluxDB**.

A workable shape:

- **A second bucket** — `water_ui_registry`, **separate from `water_quality_bucket`** (see the
  retention trap below), with **infinite retention**.
- Measurement `boards`: **tag** `board_id`; **fields** `location_name`, `latitude`, `longitude`,
  `is_active`, `board_mac_address`, `created_at`, `updated_at`.
- "Latest state" per board = `group(columns:["board_id"]) |> last()`, then pivot the fields into the
  row shape `toPublicBoard` expects.

### 9.2 Blockers to know before you choose it

| # | Blocker | Detail |
| :-- | :--- | :--- |
| 1 | **Retention deletes your config** | The bucket is `30d` (`INFLUXDB_RETENTION`; `docs/database.md` §2). Boards written to the telemetry bucket are purged after 30 days. A **separate infinite-retention bucket is mandatory**, so "one database" is really "one instance, two buckets". |
| 2 | **No UNIQUE constraints** | `board_id` / `board_mac_address` uniqueness is enforced today by MySQL UNIQUE keys and translated to `409` by `conflictFrom()` in `backend/src/controllers/boardController.ts`. InfluxDB has none — the check becomes read-then-write and can race. Tolerable for a single admin, not free. |
| 3 | **Updates are append-only** | `PUT` and `PATCH .../status` become "write a newer point"; every read must collapse to `last()`. A point written with an older timestamp silently loses. The `toPublicBoard` mapping can no longer assume one mutable row. |
| 4 | **Deletes are predicate-based** | `DELETE /api/boards/:boardID` today removes one row and deliberately **leaves telemetry alone** (note in `boardController.ts`). Reproducing that needs a scoped predicate delete over a time range; a wrong predicate deletes readings too. |
| 5 | **Backup / reproducibility** | `deploy/railway/README.md` §9 treats InfluxDB as *reproducible telemetry* with no dump helper. The board registry is **configuration, not reproducible**. This is the strongest argument against. |
| 6 | **Rewrite effort** | `boardController.ts`, the `types/board.ts` mapping, the seed and the dashboard's registry read all change; Prisma is deleted (there is no InfluxDB connector for it). |

### 9.3 What it genuinely buys

- **Same service count as SQLite** — no advantage (see 9.4).
- Deletes **Prisma entirely**: no `prisma migrate deploy`, no `DATABASE_URL`, no
  `@prisma/adapter-mariadb`, no generated client in the build, no OpenSSL apt layer.
- `board_id` becomes case-**sensitive**, exactly like the InfluxDB tag — the `T-230`
  MySQL-collation mismatch hazard disappears.
- **No Railway volume** is needed (SQLite needs one).

### 9.4 Head-to-head with the current plan

| Dimension | Current plan — MySQL → SQLite (L6) | InfluxDB only (L7) |
| :--- | :--- | :--- |
| Railway services (external MQTT, after L1–L5) | **2** | **2** |
| Railway services (keeping Mosquitto) | 3 | 3 |
| Extra Railway resource | 1 volume | none |
| Buckets | 1 | 2 (telemetry + registry) |
| Fit for relational metadata | good | poor |
| Unique `board_id` / MAC | DB-enforced → `409` | app-level, race-prone |
| Update semantics | in-place `UPDATE` | append + `last()` |
| Delete a board | row delete | predicate delete over a time range |
| Schema migrations | Prisma Migrate | none (hand-written Flux) |
| Prisma retained | yes | no |
| Backup story | file on a volume (needs snapshots) | no dump helper — config at risk |
| Effort | Low–Medium | High |
| Risk | Low | Medium–High |

Key takeaway: **the database choice does not change the service total.** Both options land on
**2 Railway services** once MQTT is external, so the deciding factors are data-model fit, effort and
data safety — and SQLite wins all three.

### 9.5 Recommendation

- To reach "no MySQL", prefer **L6 SQLite**, not moving the registry into InfluxDB.
- Only pick InfluxDB-only if you also (a) create a **separate infinite-retention registry bucket**,
  (b) accept application-level uniqueness, and (c) add a backup path for InfluxDB — which this repo
  does not have today.
- **Third option worth considering:** if the device count is small and the Boards CRUD UI is not
  essential, keep the registry as **static config** (a committed `boards.json` or an env var). Then
  InfluxDB really is the only *data* store, with no second bucket to get wrong — but it contradicts
  the Boards module in `MASTER_CONTEXT.md` §6.2, so it is a product decision, not just a deployment
  one.
