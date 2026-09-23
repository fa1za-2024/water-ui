# 🧠 WATER UI - MASTER PROJECT CONTEXT & AI MEMORY

> **IMPORTANT INSTRUCTION FOR AI:** 
> This file is the single, comprehensive source of truth for the **Water UI** project. Read and internalize this entire document before generating any code, database queries, or UI components. All code must strictly adhere to the architecture, naming conventions, and constraints defined below.
>
> **SELF-CONTAINED:** Sections 1–9 below describe the entire system and are sufficient on their own. The files in `docs/` are detail mirrors of those sections — see the Documentation Map. If a mirror and a section disagree, **the section wins**; report the divergence rather than choosing silently.
>
> **TASK TRACKING (mandatory — Rule 8):** Every piece of work lives in [`docs/task-tracker.md`](task-tracker.md). Before starting anything, locate the task there and work from its ID. When it is finished, mark it `[x]` **with the evidence that proves it**. When you discover work the tracker does not list, **add it as a new task first**, then do it. Never complete untracked work, and never report a task as done without satisfying its acceptance criteria.

---

## 📑 TABLE OF CONTENTS
1. Project Overview & System Architecture
2. Technology Stack
3. Critical Rules & Constraints for AI
4. Database Schemas (MySQL & InfluxDB)
5. IoT Data Pipeline & Node-RED Logic
6. Functional Modules & API Endpoints
7. UI/UX Requirements
8. Project Folder Structure
9. Pre-Development & DevOps Setup (Docker, .env, Prisma)
- [Appendix A - Known Conflicts & Open Decisions](#-appendix-a---known-conflicts--open-decisions)

---

## 📎 DOCUMENTATION MAP

| # | Section in this file | Detail mirror | Status |
| :--- | :--- | :--- | :--- |
| 1 | Project Overview & System Architecture | `docs/technology.md` §3 | ✅ mirror matches |
| 2 | Technology Stack | `docs/technology.md` §2 | ✅ mirror regenerated - fixed choices (react-leaflet, exceljs, Vite/Tailwind v4, Prisma 7, TypeScript) |
| 3 | Critical Rules & Constraints for AI | *(no mirror — this file only)* | ✅ authoritative |
| 4 | Database Schemas | `docs/database.md` | ✅ mirror matches, incl. the A23 warning and the A11 retention note |
| 5 | IoT Data Pipeline & Node-RED Logic | `docs/node-red.md`, `docs/mqtt-topics.md` | ✅ implemented in `iot/node-red/flows.json`; mirrors reformatted to match it (T-505) |
| 6 | Functional Modules & API Endpoints | `docs/modules.md` | ✅ mirror corrected - Rules 3 & 4 restored, boards/dashboard/historical state per section (T-501, T-502) |
| 7 | UI/UX Requirements | `docs/ui-requirement.md` | ✅ mirror corrected - `react-leaflet` only, plus §7.8's status table (T-501); §2 rewritten to the implemented dashboard, its T-331 removals and the T-336 station cards |
| 8 | Project Folder Structure | `docs/project-structure.md` | ✅ regenerated with a reality check; the tree below is that same tree |
| 9 | Pre-Development & DevOps Setup | `docs/pre-development-setup.md`, `docker-compose.yml`, `.env.example` | ✅ mirror regenerated from §9, `.env.example` embedded verbatim (T-504) |

### Task tracking protocol

[`docs/task-tracker.md`](task-tracker.md) is the **work queue**: the step-by-step task list (stable IDs `T-xxx`) derived from this document, with the open decisions and known traps. It is a *derived* view — this file stays the authority — but it is the **only place tasks are tracked**, so the two must never drift apart.

**For any task, before, during and after:**

| When | What to do |
| :--- | :--- |
| **Before starting** | Find the task in `task-tracker.md` and work from its `T-xxx` ID. If it is not listed, **add it first** (next free ID in its phase). If it is `BLOCKED`, resolve or record the blocking decision before writing code. |
| **While working** | If the work turns out bigger or different than the listed task, **split it or add tasks** rather than silently expanding scope. |
| **When finished** | Mark it `[x]` and record the **evidence** that proves it — the command, response or observation. Update the Progress snapshot if that area's status changed. |
| **When new work appears** | Every bug found, follow-up needed, or decision that implies work becomes a **new `T-xxx` task**. New tasks are added *before* the work is done, never after. |
| **When a decision is made** | Flip the Appendix A row it resolves to RESOLVED and unblock the tasks it gated. |

**Task IDs:** `T-0xx` foundation · `T-1xx` IoT pipeline · `T-2xx` backend · `T-3xx` frontend · `T-4xx` DevOps · `T-5xx` documentation. Take the next free number in the phase; never renumber or reuse an ID.

**Markers:** `[x]` done and verified · `[ ]` not started · `[~]` partial or stubbed · `BLOCKED` waiting on a decision or an external step.

**Definition of done:** acceptance criteria met and verified by *running* it (not just reading the code), `MASTER_CONTEXT.md` and `project-structure.md` updated in the same change, and the tracker row marked `[x]` with its evidence.

**Sync rule:** `docs/*.md` are generated mirrors, not independent authorities. Any change to a mirror must be reflected in the matching section here in the same change, and vice versa. Nothing may be documented in only one place except this file's §3 (rules) and Appendix A (open decisions).

**Known repo-level issues:** `node-red.md` exists both at the repo root and in `docs/` with identical content (A6 — deleting the root copy is T-503 and still unconfirmed). **A13 is resolved:** every fence is closed and the truncated sections were rewritten (`database.md` §3, `technology.md` §4, `pre-development-setup.md` §9 - the last of these regenerates from this file, so it can no longer be truncated on its own).

---

## 1. Project Overview & System Architecture

**Water UI** is an IoT dashboard designed to monitor real-time water quality (pH, Turbidity) for rainwater harvesting storage in rural communities. It features real-time sensor tracking, interactive mapping, historical data analysis, and instant Telegram alerts for unsafe water conditions.

### System Architecture Flow:
1.  **IoT Edge Device** sends JSON payload to the **MQTT Broker (Mosquitto)**.
2.  **Node-RED** subscribes to the MQTT topic, parses the payload, calculates derived statuses (`wq_status`, `batt_level`, `wifi_status`), writes to **InfluxDB**, and triggers **Telegram Alerts**.
3.  **Node-RED** sends an HTTP POST request to the **Express API** to notify of new data.
4.  **Express API** receives the trigger and uses **Socket.io** to push the new data to the **React Frontend**.
5.  **React Frontend** updates Redux state, which instantly updates the **Chart.js** dashboard and **React Leaflet** map.
6.  **Express API** queries **InfluxDB** for historical chart data and **MySQL (via Prisma)** for user authentication and profile management.

---

## 2. Technology Stack (Strict Adherence Required)

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| **Frontend** | React.js, Tailwind CSS | Use Shadcn/ui or Headless UI for components. |
| **State Management** | Redux Toolkit (RTK) | **Must use RTK Query** for all API calls and caching. |
| **Charts** | Chart.js | Dual Y-axes for pH and Turbidity. |
| **Map** | **React Leaflet** | Primary choice. Color-coded markers (Green/Yellow/Red). |
| **Real-Time** | Socket.io (Client & Server) | Used for live dashboard updates. |
| **Backend** | Express.js (Node.js) + **TypeScript** | REST API + Socket.io server. TypeScript is required, not optional — see A15. |
| **Auth** | JWT + bcrypt | Single user profile. **No RBAC**. |
| **MySQL ORM** | Prisma **7** | Type-safe database interactions. v7 needs the `prisma-client` generator, a MariaDB driver adapter and `prisma.config.ts` — see A15. |
| **Frontend build** | **Vite** + Tailwind **v4** | CRA is unmaintained and Tailwind v4 is CSS-first — see A19. |
| **Databases** | MySQL & InfluxDB | MySQL for relational metadata, InfluxDB for time-series data. |
| **File Storage** | MinIO (or AWS S3) | Store profile pictures. Save URL in MySQL. |
| **Excel Export** | `exceljs` (Backend) | Generate `.xlsx` dynamically on the server. |
| **IoT Pipeline** | Node-RED, Mosquitto | Edge processing and MQTT broker. |
| **DevOps** | Docker, Docker Compose | Orchestrate all 7+ services. |

### Supporting libraries (from `docs/technology.md`, non-negotiable where a Rule depends on them)
- **Date handling:** Day.js or date-fns — **required** for Chart.js X-axis formatting (Rule 7).
- **Backend validation:** Zod or Joi.
- **Backend security:** Helmet, CORS, express-rate-limit.
- **InfluxDB client (backend):** `@influxdata/influxdb-client`.
- **Tables (UI):** TanStack Table (React Table) + Lucide React/Heroicons.
- **Reverse proxy:** Nginx (SSL termination, serving the React build, routing `/api`).

---

## 3. Critical Rules & Constraints for AI

1.  **NO RBAC:** This is a single-user system. Do not generate role-based access control code.
2.  **UI Text vs DB Value:** The UI displays "Not Safe", but the database stores `"Unsafe"`. Map these correctly.
3.  **Excel Export:** Must be generated on the **backend** using `exceljs`. The button must be at the **top** of the historical data table.
4.  **Map Library:** Always use **`react-leaflet`**. Do not use Google Maps or Mapbox.
5.  **Real-time Updates:** All live updates must flow through Socket.io -> Redux -> UI components. Do not use polling.
6.  **InfluxDB Data Types:** Node-RED **must** use `parseFloat()` and `parseInt()` before writing to InfluxDB. Strings will break Chart.js.
7.  **Date Handling:** Use Day.js or date-fns to format timestamps for Chart.js X-axis.
8.  **Task Tracking:** Every task is tracked in [`docs/task-tracker.md`](task-tracker.md). **Refer to the tracker before starting any task; mark tasks `[x]` when they are done (with evidence); and add a new task to the tracker whenever new work is required — before doing it.** A task is only "done" when its acceptance criteria are met and the tracker and this document agree. Details: [Task tracking protocol](#task-tracking-protocol).

---

## 4. Database Schemas

### 4.1 MySQL (Relational Data)
**Table: `users`** (Single profile only, no roles)
- `id` (INT, PK)
- `first_name` (VARCHAR)
- `last_name` (VARCHAR)
- `email` (VARCHAR, UNIQUE)
- `phone` (VARCHAR, UNIQUE)
- `password_hash` (VARCHAR)
- `profile_picture_url` (VARCHAR, NULL)
- `created_at`, `updated_at` (TIMESTAMP)

**Table: `boards`**
- `id` (INT, PK)
- `board_id` (VARCHAR, UNIQUE) - *Logical ID (e.g., "AA240238")*
- `board_mac_address` (VARCHAR, UNIQUE) - *Hardware MAC*
- `location_name` (VARCHAR)
- `latitude` (DECIMAL)
- `longitude` (DECIMAL)
- `is_active` (BOOLEAN) - *Soft delete / toggle*
- `created_at`, `updated_at` (TIMESTAMP)

**Column types and constraints** (from `docs/database.md`):
- `users`: `first_name` VARCHAR(50), `last_name` VARCHAR(50), `email` VARCHAR(100) UNIQUE, `phone` VARCHAR(20) UNIQUE, `password_hash` VARCHAR(255) (bcrypt), `profile_picture_url` VARCHAR(255) NULL, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE.
- `boards`: `board_id` VARCHAR(50) UNIQUE, `board_mac_address` VARCHAR(17) UNIQUE (e.g. `00:1A:2B:3C:4D:5E`), `location_name` VARCHAR(100), `latitude` DECIMAL(10,8), `longitude` DECIMAL(11,8), `is_active` BOOLEAN DEFAULT TRUE.
- **No junction tables:** because there is no RBAC, the single user owns/manages all boards.

> ⚠️ **Known drift (A23):** the `TIMESTAMP` / `ON UPDATE` wording above does **not** match the tables that actually exist. Prisma 7 emits `datetime(3)` and manages `updated_at` client-side, so the live columns have no `ON UPDATE` clause. Implement against `prisma/schema.prisma`, not this paragraph, until A23 is resolved (T-224, T-225).

**Identifier naming across layers** (see A4 for the open naming conflict):
| Layer | Field name |
| :--- | :--- |
| MQTT wire payload | `boardID` |
| MySQL column (Prisma) | `board_id` |
| InfluxDB tag | `board_id` |
| REST path param | `:boardID` |

### 4.2 InfluxDB (Time-Series Data)
- **Bucket:** `water_quality_bucket`
- **Retention:** `30d` (raw data kept 30 days; no downsampling task is implemented yet — see A11)
- **Measurement:** `water_quality`
- **Tags (Indexed):** `board_id`, `wq_status`, `batt_level`, `wifi_status`
- **Fields (Values):** `pH` (Float), `turbidity` (Float), `batt_voltage` (Float), `rssi` (Integer)
- **Timestamp:** `_time` (RFC3339)

| Type | Key | Data Type | Example Value |
| :--- | :--- | :--- | :--- |
| **Tag** | `board_id` | String | `"AA240238"` |
| **Tag** | `wq_status` | String | `"Safe"`, `"Acceptable"`, `"Unsafe"` |
| **Tag** | `batt_level` | String | `"Full"`, `"Medium"`, `"Low"`, `"Critical"` |
| **Tag** | `wifi_status` | String | `"Excellent"`, `"Good"`, `"Fair"`, `"Poor"` |
| **Field** | `pH` | Float | `7.25` |
| **Field** | `turbidity` | Float | `2.50` |
| **Field** | `batt_voltage` | Float | `3.85` |
| **Field** | `rssi` | Integer | `-65` |
| **Timestamp** | `_time` | Timestamp | `"2023-10-27T10:00:00Z"` |

**Why this structure:** tags are indexed, so filtering/`GROUP BY` on `board_id` or `wq_status` is fast; fields are unindexed but cheap to aggregate (e.g. average pH over 24h). Node-RED supplies `_time` explicitly to preserve edge-timestamp accuracy rather than letting InfluxDB stamp arrival time.

---

## 5. IoT Data Pipeline & Node-RED Logic

### 5.1 Incoming MQTT Payload
The IoT edge device publishes this JSON to the broker (topic convention e.g. `sensors/<boardId>/data`):

```json
{
  "boardID": "AA240238",
  "pH": 12.75,
  "turbidity": 25.00,
  "batt_voltage": 3.4,
  "rssi": -75
}
```

### 5.2 Node-RED: Broker Connection & Subscription
1. Dragg an `mqtt in` node from the Network palette onto the workspace.
2. Double-click the node, then click the pencil icon next to **Server** to add a new broker connection.
3. Fill in the broker details:
   - **Server:** IP or hostname of the MQTT broker (e.g. `test.mosquitto.org` or your server IP; in Compose this is the service name `mosquitto`).
   - **Port:** `1883` for non-TLS, `8883` for TLS.
   - **Security:** username/password if the broker requires it; enable TLS for secure connections.
4. Click **Add** to save the broker configuration.
5. Back in the `mqtt in` node, configure the subscription:
   - **Action:** "Subscribe to a single topic".
   - **Topic:** the topic devices publish to. Wildcards: `+` for a single level (`sensors/+/data`), `#` for multiple levels (`sensors/#`).
   - **QoS:** `2` (exactly-once) — appropriate for critical sensor data.
   - **Output:** **"a parsed JSON object"**, so Node-RED converts the string payload into a usable JavaScript object.
6. Click **Done**.

### 5.3 Function Node — Derived Status Logic (authoritative thresholds)
Connect a `function` node to the output of the `mqtt in` node. This node is the "brain": it normalises types and computes every derived status **before** the data is stored, keeping the Express API and React frontend lightweight.

```javascript
// 1. Extract incoming data from the parsed JSON payload
const payload = msg.payload;
const boardID = payload.boardID;
const pH = parseFloat(payload.pH);
const turbidity = parseFloat(payload.turbidity);
const batt_voltage = parseFloat(payload.batt_voltage);
const rssi = parseInt(payload.rssi);

// 2. Determine wq_status (Water Quality Status)
let wq_status = "Safe";
if (pH < 6.5 || pH > 8.5 || turbidity > 5.0) {
    wq_status = "Unsafe";
} else if (pH < 7.0 || pH > 8.0 || turbidity > 3.0) {
    wq_status = "Acceptable";
}

// 3. Determine batt_level (Assuming a 3.7V Li-ion battery)
let batt_level = "Full";
if (batt_voltage <= 3.3) {
    batt_level = "Critical";
} else if (batt_voltage <= 3.5) {
    batt_level = "Low";
} else if (batt_voltage <= 3.7) {
    batt_level = "Medium";
}

// 4. Determine wifi_status (Based on RSSI dBm)
let wifi_status = "Excellent";
if (rssi <= -80) {
    wifi_status = "Poor";
} else if (rssi <= -70) {
    wifi_status = "Fair";
} else if (rssi <= -60) {
    wifi_status = "Good";
}

// 5. Create the standardized timestamp (RFC3339 format for InfluxDB)
const time = new Date().toISOString();

// 6. Build the output payload with all required fields for InfluxDB
msg.payload = {
    time: time,
    boardID: boardID,
    pH: pH,
    turbidity: turbidity,
    wq_status: wq_status,
    batt_voltage: batt_voltage,
    batt_level: batt_level,
    rssi: rssi,
    wifi_status: wifi_status
};

// Return the message object to pass to the next node
return msg;
```

**Threshold summary (single source of truth):**
| Derived tag | Value | Condition |
| :--- | :--- | :--- |
| `wq_status` | `Unsafe` | `pH < 6.5` OR `pH > 8.5` OR `turbidity > 5.0` |
| `wq_status` | `Acceptable` | `pH < 7.0` OR `pH > 8.0` OR `turbidity > 3.0` |
| `wq_status` | `Safe` | none of the above |
| `batt_level` | `Critical` | `batt_voltage <= 3.3` |
| `batt_level` | `Low` | `3.3 < batt_voltage <= 3.5` |
| `batt_level` | `Medium` | `3.5 < batt_voltage <= 3.7` |
| `batt_level` | `Full` | `batt_voltage > 3.7` |
| `wifi_status` | `Poor` | `rssi <= -80` |
| `wifi_status` | `Fair` | `-80 < rssi <= -70` |
| `wifi_status` | `Good` | `-70 < rssi <= -60` |
| `wifi_status` | `Excellent` | `rssi > -60` |

### 5.4 Optional: Republish Processed Data
A `mqtt out` node connected to the function output, publishing the enriched payload to a separate topic (e.g. `water/processed`), is useful for testing or for services that need the post-processing payload. Configure **Server** to the broker from 5.2 and set the **Topic**, then click **Done**.

### 5.5 Testing the Flow
1. Attach a `debug` node to the output of the function node.
2. Click **Deploy**.
3. Publish a sample JSON payload to the input topic (e.g. `sensors/board1/data`) with any MQTT client — MQTTX, MQTT.fx, or `mosquitto_pub`.
4. In the Node-RED debug pane you should see the transformed `msg.payload` containing the calculated `wq_status`, `batt_level`, and `wifi_status`.

> ⚠️ **In the headless/dev setup, read the *effect*, not the log (T-333).** The flow's debug nodes are configured with `console: false`, so **nothing appears in `docker logs water_ui_nodered`**, and the HTTP nodes use `senderr=false`, so a failed POST is not an error either. A misconfigured target therefore fails **silently**. The reliable check is the full chain, driven from the host:
> ```bash
> # 1. tell the pipeline where the host-run API is (needs the .env override + a recreate)
> docker exec water_ui_nodered printenv BACKEND_URL     # http://host.docker.internal:5000
> # 2. watch the Socket.io event the API emits after Node-RED posts to it
> NODE_PATH=frontend/node_modules node -e "const{io}=require('socket.io-client');const s=io('http://localhost:5000');s.on('sensor-update',p=>console.log('SENSOR-UPDATE',JSON.stringify(p)));setTimeout(()=>process.exit(0),14000)"
> # 3. in another shell, publish through the real broker
> docker exec water_ui_mosquitto mosquitto_pub -t sensors/PROBE1/data -q 2 -m '{"boardID":"PROBE1","pH":9.2,"turbidity":2.0,"batt_voltage":3.6,"rssi":-65}'
> #   -> SENSOR-UPDATE {"boardID":"PROBE1",...,"wq_status":"Unsafe","batt_level":"Medium","wifi_status":"Good"}
> # 4. and confirm the row (then tombstone it - a point for a fake board is real data)
> docker exec water_ui_influxdb influx query 'from(bucket:"water_quality_bucket") |> range(start:-5m) |> filter(fn:(r)=> r.board_id == "PROBE1")' --org water_ui_org --token "$INFLUXDB_TOKEN"
> docker exec water_ui_influxdb influx delete --bucket water_quality_bucket --org water_ui_org --token "$INFLUXDB_TOKEN" --predicate 'board_id="PROBE1"' --start 1970-01-01T00:00:00Z --stop 2030-01-01T00:00:00Z
> ```
> The flow does not consult MySQL, so a probe payload writes straight to InfluxDB and needs no registered board - but it *does* create a real series, hence the tombstone.

### 5.6 Telegram Alerts (Branching Logic)
1. Connect a `switch` node to the output of the function node.
2. In the switch node set the property to `msg.payload.wq_status` and the condition to `== Unsafe`.
3. Connect a `telegram` node (from `node-red-contrib-telegrambot`) to that switch output.
4. Configure it with the bot token and the `chatId` of the alert group:
   - Bot token: `TELEGRAM_BOT_TOKEN`
   - Chat ID: `TELEGRAM_CHAT_ID`
5. Message template with dynamic data:
   `🚨 ALERT: Water Quality Unsafe at Board {{payload.boardID}}. pH: {{payload.pH}}, Turbidity: {{payload.turbidity}}.`
6. **Anti-spam:** insert a `delay` node between the switch and the telegram node, set its mode to **Rate Limit**, and allow one message per 15 minutes.

### 5.7 Why the Type-Safety Rule Exists
- **Data type safety:** `parseFloat()` / `parseInt()` guarantee numbers (not strings) reach InfluxDB. String values in float fields break Chart.js rendering (Rule 6).
- **Centralised logic:** all derived statuses are computed once in Node-RED, so the API and frontend stay thin.

> ✅ **InfluxDB write path (was A12 — now implemented):** the live pipeline is `iot/node-red/flows.json`. Its function node builds **line protocol** and POSTs it to the InfluxDB v2 write API (`POST /api/v2/write?org=…&bucket=…&precision=ns`) with an `Authorization: Token …` header, using Node-RED's core `http request` node — no third-party node required. This keeps `rssi` an integer (`-75i`), keeps `pH` / `turbidity` / `batt_voltage` as floats, and gives exact control of `_time` (ms → ns as a **string**, so there is no `2^53` precision loss). The topic and payload contract is frozen in `docs/mqtt-topics.md`.

> ✅ **Notify-Express hop (verified live in T-333):** the function node's second output POSTs the derived reading to `BACKEND_URL` + `/api/internal/sensor-update` (A22: unauthenticated, internal-only), and Express answers by emitting the Socket.io `sensor-update` event that drives the Dashboard and the Boards table (Rule 5, §7.6). `BACKEND_URL` defaults to **`http://backend:5000`** — the compose service name, which only resolves once the `app` profile exists (T-401) — so a dev run with the API **on the host** must set `BACKEND_URL=http://host.docker.internal:5000` in `.env` (`.env.example` documents both, and the nodered service carries `extra_hosts: host.docker.internal:host-gateway` so the name resolves on Linux as well as Docker Desktop). Getting this wrong is **silent**: readings still land in InfluxDB but never reach the browser, and neither the container log nor the debug pane says so — see the end-to-end check in §5.5.

### 5.8 Implemented Artefacts
| Artefact | Purpose |
| :--- | :--- |
| `docker-compose.yml` | MySQL, InfluxDB, Mosquitto, Node-RED, MinIO (+ an `app` profile for backend/frontend) |
| `iot/mosquitto/mosquitto.conf` | Listener `1883` on `0.0.0.0`, anonymous dev access, WebSockets (host port `9002`) |
| `iot/node-red/settings.js` | Flow file, credential secret, logging |
| `iot/node-red/flows.json` | MQTT in → validate/derive → InfluxDB write + Express notify + Telegram alert |
| `iot/node-red/package.json` | `node-red-contrib-telegrambot`. **The image does NOT auto-install this** — Compose overrides the entrypoint to run `npm install` first (see A14) |
| `iot/esp32c3/water_quality_mqtt.ino` | XIAO ESP32C3 firmware publishing the telemetry JSON |
| `docs/mqtt-topics.md` | Frozen topic naming, payload schema, QoS caveats |
| `.env.example` | Every overridable variable (all have working defaults in Compose) |

**Telegram setup:** the alert branch needs a bot. Set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, or paste them into the `telegram bot` config node in the editor — the token is a Node-RED *credential*, so it is deliberately not stored in `flows.json`.

---

## 6. Functional Modules & API Endpoints

### 6.1 Users Module
**Purpose:** authentication and profile management.
*This system uses a single user profile model. RBAC is not implemented.*

**Key features**
- **Authentication:** secure login/registration using JWT.
- **Single profile management:** view and update `first_name`, `last_name`, `email`, `phone`.
- **Profile picture upload:** image stored in MinIO (or AWS S3); the URL/path is saved in MySQL via Prisma.
- **Password management:** `bcrypt` hashing plus a password **change** (`PUT /api/users/password`, A21/T-204). An emailed "forgot password" reset is deliberately **out of scope**: the stack has no mail transport, and with a single profile the owner can change the password from the profile modal.

**Tech integration**
- Frontend: React + RTK Query + Tailwind CSS.
- Backend: Express.js + JWT + bcrypt.
- Storage: MySQL (Prisma) for metadata; MinIO for images.

**API endpoints** — ✅ **IMPLEMENTED** (`backend/src/controllers/`, `backend/src/routes/`)
- `POST /api/auth/register` → `201 { token, user }` — **bootstraps the single profile only**; returns `409` once a user exists, or `403` when `ALLOW_REGISTRATION=false`
- `POST /api/auth/login` → `200 { token, user }`
- `GET /api/auth/me` → `200 { user }` (token required; convenience addition)
- `GET /api/users/profile` → `200 { user }` (token required)
- `PUT /api/users/profile` → `200 { user }` (at least one of firstName / lastName / email / phone; `409` on duplicate email or phone)
- `PUT /api/users/password` → `200 { message }` — body `{ currentPassword, newPassword }`; `401` when the current password is wrong, `400` when the new one is under 8 characters or equals the current one. Re-hashed with bcrypt at the same cost (12). **The current password is required even though the request is already authenticated**, so a stolen token cannot lock the owner out (A21/T-204).
- `POST /api/users/upload-avatar` → `200 { profilePictureUrl, user }` — multipart field `avatar`, PNG/JPEG/WebP, max 2 MB; `415` otherwise, `413` if oversized

**Implementation notes**
- Two routers, because the documented paths span two prefixes: `authRoutes.ts` → `/api/auth`, `userRoutes.ts` → `/api/users` (see A20).
- `PublicUser` never includes `password_hash`; the Prisma `select` is centralised in `src/types/user.ts`.
- Validation is Zod via `middleware/validate.ts`; unknown body keys are dropped before they reach Prisma.
- Avatars are buffered in memory (multer), streamed to MinIO, and only the URL is stored. The replaced object is deleted best-effort.
- `MINIO_PUBLIC_URL` must be reachable **from the browser** — it cannot resolve the compose service name `minio`.
- **Password change:** implemented as `PUT /api/users/password` (A21 resolved). Changing it does **not** invalidate tokens that are already issued — the JWT payload carries no version/serial — so another signed-in device keeps working until the token expires. Acceptable for a single-user dashboard; note it if that ever changes.

### 6.2 Boards Module
**Purpose:** registry of the physical IoT devices (sensors) deployed in the field.

**Key features**
- **Board list table:** all registered boards in a paginated data table.
- **Add Board button:** prominently at the **top** of the list table; registers `boardID`, `board_mac_address`, location name, `latitude`, `longitude`.
- **Per-row action icons:**
  - 👁️ **View** — detailed view of the board's metadata and current status.
  - ✏️ **Edit** — form to update details (rename location, adjust coordinates).
  - 🔄 **Activate / Deactivate** — toggles `is_active`.
  - 🗑️ **Delete** — permanent removal, requires confirmation.
- **MAC address tracking:** unique `board_mac_address` for hardware identification.
- **Location mapping:** `latitude` / `longitude` plus a descriptive location name.
- **Frontend:** ✅ **IMPLEMENTED** (T-318/T-319/T-320) - `pages/Boards.jsx` and `components/boards/`; §7.3 documents the as-built table.
- **Device status monitoring:** `last_seen` (as `Online` + `Last Seen`) is shown in the table and all four device fields are shown in the **detail modal** ✅ **IMPLEMENTED** — they are *not* MySQL columns: the API reads the newest InfluxDB point per `board_id` (A5, decided: 15-minute window, `isOnline` derived from `last_seen`).

**Tech integration**
- Frontend: React + RTK Query + TanStack Table + Lucide React/Heroicons + Shadcn/ui.
- Backend: Express.js.
- Database: MySQL via Prisma (`board_id`, `board_mac_address`, `latitude`, `longitude`, `is_active`).

**API endpoints** — ✅ **IMPLEMENTED** (`backend/src/controllers/boardController.ts`, `backend/src/routes/boardRoutes.ts`)
- `GET /api/boards?page=&limit=` → `200 { data, total, page, limit }` — `limit` 1-100 (default 20), newest first
- `POST /api/boards` → `201 { board }`
- `GET /api/boards/:boardID` → `200 { board }`
- `PUT /api/boards/:boardID` → `200 { board }` — partial: `locationName`, `latitude`, `longitude`, `boardMacAddress` (at least one)
- `PATCH /api/boards/:boardID/status` → `200 { board }` — body `{ isActive }`; **sets** the flag, it does not flip it
- `DELETE /api/boards/:boardID` → `204` with no body

**Implementation notes**
- **Token required on all six routes** (same as `/api/users`); there are no role checks (Rule 1).
- JSON uses the Prisma spelling `boardId`; the path param keeps `:boardID` and the MQTT wire keeps `boardID` (§4.1).
- **`boardId` is immutable after create** — it is shared by the MQTT topic level and the InfluxDB tag, so rewriting it would orphan the series; `isActive` changes only through the status route.
- **Coordinates are JSON numbers**, never `Decimal` strings (T-227): responses go through `toPublicBoard()`, input is checked against §4.1's ranges and snapped to the columns' 8 decimals.
- Uniqueness comes from the `UNIQUE` keys — a violation is `409` naming the field (board id vs MAC), a missing board is `404`, and a Zod failure is `400 { error, issues }`.
- `DELETE` removes the MySQL row only; the board's InfluxDB points remain until the 30-day retention expires (A11).
- **Device-status fields** (`lastSeen`, `isOnline`, `wifiStatus`, `battLevel`) are present on **every** board response, including writes: `lastSeen` is the newest InfluxDB `_time` for that `board_id`, `isOnline` is `lastSeen` inside the 15-minute A5 window, and `wifiStatus`/`battLevel` are the tags of that same point. When InfluxDB cannot be read, the four fields are `null` — "unknown", never a false "Offline" — and the registry still answers `200`; a board with no point at all gets `lastSeen: null` with `isOnline: false`.

### 6.3 Dashboard Module
**Purpose:** real-time, high-level overview. This is the primary screen after login.

**Status:** ✅ **IMPLEMENTED** — `controllers/dashboardController.ts` + `routes/dashboardRoutes.ts` (T-209, T-210, T-211); the Node-RED ingest route that feeds live updates was already live (A16).

**Key features**
- **Board status summary** (active boards only):
  - 🟢 **Online** — transmitted data within the last **15 minutes** (`BOARD_ONLINE_WINDOW_MINUTES`, decided as A5).
  - 🔴 **Offline** — active board whose newest point is older than that window, or that has never reported.
- **Water status summary** across all active boards:
  - ✅ **Safe** — count of `wq_status == "Safe"`.
  - ⚠️ **Acceptable** — count of `wq_status == "Acceptable"`.
  - ❌ **Not Safe** — count of `wq_status == "Unsafe"` (UI label "Not Safe" ↔ DB value `"Unsafe"`, per Rule 2).
- **Interactive map view:** one marker per active board at its `latitude`/`longitude`, colour-coded by current water status (Green / Yellow / Red).
- **Click-to-view real-time data:** clicking a marker opens a side panel with `pH Level`, `Turbidity (NTU)`, `Battery Voltage`, `RSSI (Wi-Fi Signal)`, and the derived `wq_status`, `batt_level`, `wifi_status`.
- **Live chart updates:** the dashboard listens on Socket.io; when Node-RED writes new data and triggers the Express API, Express pushes it to the frontend so summary counts, marker colours, and charts update with no page refresh.

**Tech integration**
- Frontend: React + RTK Query + Socket.io Client + Tailwind CSS + Chart.js + **React Leaflet** (Rule 4 — the "or Google Maps API" alternative in `docs/modules.md` is void).
- Backend: Express.js + Socket.io server; Express runs aggregate queries against InfluxDB and MySQL on load to compute the summary counts.
- Database: MySQL (active boards, coordinates) + InfluxDB (latest sensor points).

**API endpoints** — the three reads require a JWT; the ingest route is the documented exception (it is Node-RED's target, and is still unauthenticated: A22 / T-218).

| Method & path | Purpose |
| :--- | :--- |
| `GET /api/dashboard/summary` | Online/offline + Safe/Acceptable/Unsafe counts, active boards only |
| `GET /api/dashboard/boards-locations` | One marker per active board: coordinates + current status |
| `GET /api/dashboard/latest/:boardID` | The registry row plus its newest reading (side panel) |
| `POST /api/internal/sensor-update` | Node-RED → Express trigger; emits the Socket.io event consumed by the frontend |

**Response shapes**

```json
GET /api/dashboard/summary
{
  "generatedAt": "2026-09-22T09:01:15.747Z",
  "onlineWindowMinutes": 15,
  "influxAvailable": true,
  "boards": { "total": 5, "active": 4, "inactive": 1, "online": 2, "offline": 2 },
  "waterStatus": { "safe": 1, "acceptable": 1, "unsafe": 1, "unknown": 1 }
}
```

```json
GET /api/dashboard/boards-locations
{
  "influxAvailable": true,
  "count": 2,
  "data": [
    { "boardId": "AA240238", "locationName": "Tank 1", "latitude": 13.7563, "longitude": 100.5018,
      "wqStatus": "Safe", "isOnline": true, "lastSeen": "2026-09-22T08:53:36.380Z" }
  ]
}
```

```json
GET /api/dashboard/latest/:boardID
{
  "influxAvailable": true,
  "board": { "boardId": "AA240238", "latitude": 13.7563, "longitude": 100.5018, "isActive": true,
             "lastSeen": "…", "isOnline": true, "wifiStatus": "Good", "battLevel": "Full", "…": "…" },
  "reading": { "time": "…", "boardId": "AA240238", "pH": 7.2, "turbidity": 1.5, "wqStatus": "Safe",
               "battVoltage": 3.9, "battLevel": "Full", "rssi": -55, "wifiStatus": "Good" }
}
```

**Behaviour that must not change**
- The headline counts cover **`is_active = true` only**; a deactivated board must not influence online/offline or the water-status counts, and must not appear as a marker (its InfluxDB history is untouched).
- `waterStatus.unknown` counts active boards whose newest point carries no recognisable `wq_status` - a board that has never reported, or an unrecognised tag value (A1). So `safe + acceptable + unsafe + unknown === boards.active` and `online + offline === boards.active` always hold.
- **Degradation:** if InfluxDB cannot be read, `influxAvailable` is `false` and **every Influx-derived number is `null`, never `0`** - a zeroed summary would read as a confident "nothing online, all water safe". The MySQL-only facts (`boards.total/active/inactive`, the markers' coordinates) still answer `200`, and each marker's status fields are `null`. This is §6.2's "unknown ≠ offline" rule applied to aggregates.
- `latest/:boardID` is answered by **one** InfluxDB query: the newest pivoted reading supplies the timestamp (`lastSeen`), the tags and the four numeric fields, and `isOnline` is derived from that timestamp with the A5 window - so the side panel can never show a timestamp from one point and values from another. Registered-but-never-reported → `200` with `reading: null` and `isOnline: false` (known Offline); InfluxDB unreachable → `isOnline: null` (unknown); unknown board → `404`.
- Board ids are looked up with `findUnique` on `board_id`, which MySQL compares case-insensitively, and the **stored** spelling is used for the InfluxDB tag - so `aa240238` returns `AA240238`'s data and the response echoes the stored id (T-230).
- Coordinates are plain JSON **numbers** (`Decimal.toNumber()`), never the driver's strings - this is the dashboard half of T-227, and `react-leaflet` plots nothing from a string.
- Markers are ordered by `boardId` so the map's payload is stable between calls.

### 6.4 Historical Data Module
**Purpose:** analyse past water quality trends and generate reports.

**Status:** ✅ **IMPLEMENTED** — `controllers/historicalController.ts`, `routes/historicalRoutes.ts`, the historical reads in `services/influxService.ts` and `services/excelService.ts` (T-213, T-214, T-215, T-216, T-217).

**Key features**
- **Interactive charts:** Chart.js line charts for `pH`, `turbidity`, `batt_voltage`, `rssi`.
- **Historical data list (table):** paginated table below the chart. Columns: `Time`, `Board ID`, `pH`, `Turbidity`, `wq_status`, `Batt Voltage`, `Batt Level`, `RSSI`, `Wi-Fi Status`.
- **Pagination:** rows-per-page selector — **20, 50, or 100** (the API accepts `limit` 1-100, default 20, and returns `total`).
- **Export to Excel:** **"Export to Excel"** button positioned at the **top** of the list table (Rule 3); exports the currently filtered data to `.xlsx`.
- **Time-range selection:** 1 Hour, 24 Hours, 1 Day, 1 Week, 1 Month, or a custom range.
- **Multi-board comparison:** overlay several boards on one chart (up to 5).

**Tech integration**
- Frontend: React + RTK Query + Chart.js + Day.js + Tailwind CSS.
- Backend: Express.js + `@influxdata/influxdb-client`.
- Excel: **`exceljs`** in Express (Rule 3 — the "or `xlsx` (SheetJS)" alternative in `docs/modules.md` is void), streamed with the workbook writer.
- Database: InfluxDB, using Flux queries with `aggregateWindow()` to downsample efficiently.

**API endpoints** — every route requires a **JWT**; the board ids are resolved against the MySQL registry first (404 for unknown ones, and the stored spelling is used for the InfluxDB tag and the response, which also closes the T-230 case-mismatch hazard).

| Method & path | Purpose |
| :--- | :--- |
| `GET /api/historical/:boardID?range=24h` | Downsampled chart series for one board |
| `GET /api/historical/:boardID?start=2023-10-01&end=2023-10-02` | Same, for a custom range (max 30 days) |
| `GET /api/historical?boardIDs=A,B&range=24h` | Multi-board overlay, aligned window by window (T-217) |
| `GET /api/historical/:boardID/readings?range=24h&page=1&limit=20` | One page of stored readings for the table |
| `GET /api/historical/export/excel/:boardID?range=7d` | `.xlsx` stream with `Content-Disposition: attachment` |

**Query parameters**
- `range` — one of `1h`, `24h`, `1d`, `7d`, `1w`, `1m` (`24h`/`1d` and `7d`/`1w` are aliases; `1m` is 30 days, the bucket retention). Default `24h`.
- `start` + `end` — a custom window, both together, ISO-8601 or `YYYY-MM-DD`. Mutually exclusive with `range`; `end` must be after `start`; a span longer than the 30-day retention is **rejected** (400), never truncated.
- `page` (≥1) and `limit` (1-100, default 20) — the readings table only.
- `boardIDs` — comma-separated list, 1-5 ids, for the overlay route.

**Downsampling windows** (one mean per window, per board)

| `range` | `aggregateWindow(every:)` | Points per board |
| :--- | :--- | :--- |
| `1h` | `1m` | ~61 |
| `24h` / `1d` | `15m` | ~97 |
| `7d` / `1w` | `1h` | ~169 |
| `1m` | `6h` | ~121 |
| custom | derived from the span: ≤6h → `1m`, ≤48h → `15m`, ≤14d → `1h`, else `6h` | — |

**Response shapes**

```json
GET /api/historical/:boardID?range=24h   (and the ?boardIDs= overlay)
{
  "range": { "key": "24h", "start": "2026-09-21T08:00:00.000Z", "end": "2026-09-22T08:00:00.000Z", "window": "15m" },
  "boards": [ { "boardId": "AA240238", "points": [ { "time": "2026-09-22T08:00:00.000Z", "pH": 7.2, "turbidity": 1.5, "battVoltage": 3.9, "rssi": -55 } ] } ]
}
```

```json
GET /api/historical/:boardID/readings?range=24h&page=1&limit=20
{
  "data": [ { "time": "…", "boardId": "AA240238", "pH": 7.2, "turbidity": 1.5, "wqStatus": "Safe",
              "battVoltage": 3.9, "battLevel": "Full", "rssi": -55, "wifiStatus": "Excellent" } ],
  "total": 2880, "page": 1, "limit": 20,
  "range": { "key": "24h", "…": "…" }
}
```

**Behaviour that must not change**
- The series is **aligned**: every board gets the same window timestamps, with `null` where a window has no data (a missing field means "no reading", never `0`). This is what makes an overlay line up.
- The series is built from the requested board list, so a board with no data still appears with `points: []`.
- Tags (`wq_status`, `batt_level`, `wifi_status`) are **not** in the aggregated series - they belong to individual readings and are returned by the readings route, which is why §7.4's table columns come from there.
- The table is **newest first**; the export is **chronological** (a spreadsheet is read top-down).
- `total` counts readings as `pH` records (pH is mandatory on every payload, `docs/mqtt-topics.md` §2); counting all four fields would report 4x.
- The export is capped at **50,000 rows** (≈16 days at the 30 s publish rate); a larger range returns 400 with the limit in the message instead of streaming for minutes.
- Timestamps leave the API as ISO-8601 UTC; the frontend formats them with Day.js (Rule 7).

**Excel export flow**
1. User clicks "Export to Excel" at the top of the historical data table.
2. React (RTK Query) sends `GET /api/historical/export/excel/:boardID` with the selected date range and active table filters.
3. Express queries InfluxDB for the relevant rows, in chunks, oldest first.
4. Express streams an `exceljs` workbook: the §7.4 columns, a bold frozen header row with an auto-filter, `Time` as a real (UTC) date cell, numbers to 2 decimals, and the resolved window appended below the data.
5. The response carries `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="water-quality-<boardID>-<range>-<UTC stamp>.xlsx"`.
6. The browser triggers the download automatically.

> **Trap (do not "simplify"):** Flux's `range()` takes **`start` + `stop`**, not `end`. Writing `end:` returns `found unexpected argument end (Expected 'stop')` from InfluxDB as a `400`, which looks like a validation bug in the API. The API's query parameter stays `end`, per this section; the rename happens in `influxService.ts`.

> **Added endpoints (A27):** `GET /api/historical` and `GET /api/historical/:boardID/readings` are not in the original §6.4 list. §7.4's table and the multi-board overlay cannot be served without them, so they were added and are documented above. See A27 in Appendix A.

### 6.5 API Endpoint Index
| Module | Method & Path | Purpose |
| :--- | :--- | :--- |
| Users | `POST /api/auth/register` | Create the profile |
| Users | `POST /api/auth/login` | Issue JWT |
| Users | `GET /api/users/profile` | Read profile |
| Users | `PUT /api/users/profile` | Update profile |
| Users | `PUT /api/users/password` | Change password (current + new, A21) |
| Users | `POST /api/users/upload-avatar` | Upload picture to MinIO |
| Boards | `GET /api/boards` | List boards (paginated) |
| Boards | `POST /api/boards` | Register board |
| Boards | `GET /api/boards/:boardID` | Board detail |
| Boards | `PUT /api/boards/:boardID` | Update board |
| Boards | `PATCH /api/boards/:boardID/status` | Activate / deactivate |
| Boards | `DELETE /api/boards/:boardID` | Delete board |
| Dashboard | `GET /api/dashboard/summary` | Online/offline + water status counts |
| Dashboard | `GET /api/dashboard/boards-locations` | Map coordinates |
| Dashboard | `GET /api/dashboard/latest/:boardID` | Latest reading for one board |
| Dashboard | `POST /api/internal/sensor-update` | Node-RED ingest trigger (internal) |
| Historical | `GET /api/historical/:boardID` | Time-series query (`range`, `start`/`end`) |
| Historical | `GET /api/historical` | Multi-board overlay (`boardIDs`, A27) |
| Historical | `GET /api/historical/:boardID/readings` | Paginated stored readings for §7.4's table (A27) |
| Historical | `GET /api/historical/export/excel/:boardID` | Streamed `.xlsx` export |

**Error envelope - every endpoint, no exceptions:** a failure answers `{ error: "<message>" }`, and a Zod `400` adds `issues` (`{ error, issues }`). There is **no `message` field**. That message carries the actionable half of a failure ("That MAC address is already registered to another board", "Current password is incorrect"), so a client reading `message` silently degrades every one of them to a generic fallback - the frontend reads it through `src/utils/apiError.js` for exactly that reason.

---

## 7. UI/UX Requirements

### 7.1 Global Layout & Navigation
Classic dashboard shell: fixed left sidebar, top header, scrollable main content area.

**Sidebar**
- **Logo area:** water drop icon + "Water UI" (bold, dark text).
- **Navigation items — ✅ IMPLEMENTED (T-308), and this closes A10:** `Dashboard` (Dashboard icon), `Boards` (Radio icon), `Historical Data` (Line-chart icon), and `Simulator` (Beaker icon) - the fourth added on request by `docs/simulator-module.md` 2 for the Simulator Control Module (T-335). The mockup's three labels (`Dashboards` / `System Analytics` / `System Health`) described no real page, so they were dropped in favour of concrete destinations. **Profile is not a sidebar item** — it is opened as a **modal** from the avatar menu in the top header (T-309/T-324). Responsive (see §7.7): a static column from `md` up, a drawer with a backdrop and a hamburger toggle below it.
- **Active state:** `bg-purple-50`, `text-purple-700`, left border accent `border-l-4 border-purple-600`.
- **Inactive state:** `text-gray-500`, `hover:bg-gray-100`.

**Top header**
- **Application title — ✅ IMPLEMENTED (T-309), replacing the mockup's search field:** "Real-Time Water Quality Monitoring System" (`text-sm font-bold text-gray-800`, `sm:text-base`) over "Dashboard for Rainwater Harvesting Storage in Rural Communities." (`text-xs text-gray-500`), both truncated with `min-w-0`. **The search box the mockup shows here was removed at the user's request** (T-232 closed): it had no specified behaviour and no search endpoint exists. The header is the single `h1` of the app, so pages must not repeat the title.
- **User profile — ✅ IMPLEMENTED (T-309):** circular avatar (`rounded-full`, `w-10 h-10`), the
  signed-in name, and a dropdown menu whose **Profile item opens the profile modal** (T-324) and
  whose second item signs out (the menu closes on outside click
  and on Escape; a picture falls back to the user's initials).
- **No search field:** there is none anywhere in the UI. The mockup's box was rendered inert
  first (no behaviour was ever specified and `/api/...` has no search endpoint), then
  removed in favour of the title above - see T-232, which is closed by that removal.

**Routing, login and the post-login landing page — ✅ IMPLEMENTED (T-325 / T-326)**
The mockup (`docs/Water UI.png`) shows only the signed-in dashboard, so the login
screen is not a mockup-derived layout: it reuses the palette above (white rounded card
on the gray canvas, `brand-600` purple accent, water-drop icon + "Water UI" wordmark).

| Route | Page | Access |
| :--- | :--- | :--- |
| `/login` | Login | Public. Email + password, show/hide toggle, dev-only hint with the seeded account. Inline errors are mapped per failure: `401` -> `Incorrect email or password.`; **`502`/`504`/`FETCH_ERROR`** (the API is down - the Vite dev proxy answers 502 `text/plain`) -> "The API is not answering…" *with the one-line fix*, never "wrong password"; `429` -> the rate-limit message; other `5xx` -> the API's message or the status code. |
| `/` | Dashboard | **Guarded.** This is the landing page after authentication. |
| `/boards` | Boards | **Guarded.** The board registry (§7.3, T-318..T-320, verified 40/40). |
| `/historical` | Historical Data | **Guarded.** Implemented (T-321..T-323). |
| `/profile` | **no route** | The profile is a **modal** (`components/profile/ProfileModal.jsx`) opened from the header avatar menu (T-324), so it never navigates away from the page it was opened on. |
| `*` | — | Redirects to `/` (which then redirects to `/login` when signed out). |

- **After a successful sign-in the app goes to `/` (the Dashboard)** — the page the
  mockup depicts and the documented home page. `POST /api/auth/login` returns
  `200 { token, user }` (§6.1) and the session is stored in Redux; the guard then
  renders the dashboard.
- **Protected routing:** any unauthenticated visit to a guarded path redirects to
  `/login`, remembering where the user was headed so the sign-in returns them there.
- **Session persistence (T-303):** the session is kept in `localStorage` and re-validated
  on boot with `GET /api/auth/me`, so a reload does not bounce the user to the login
  screen; a rejected token clears the session and returns to `/login`.
- **Sign out** clears the session and returns to `/login`.
- **There is no user-list page.** The system has one profile (Rule 1), there is no
  `GET /api/users` endpoint, and the post-login destination is the Dashboard. A users
  table would be an RBAC-style change requiring a new appendix decision.
- The sidebar/header chrome is implemented (T-308/T-309) and A10 is closed: the sidebar carries
  `Dashboard` / `Boards` / `Historical Data` / `Simulator`, and Profile is opened as a **modal** from the
  header avatar menu (T-324) - it has no route at all. `/boards` is the registry (§7.3) and
  `/historical` still renders a *marked placeholder* (title + owning task) until T-321..T-323
  lands, so no sidebar link dead-ends.

### 7.2 Dashboard Module (Home Page) — ✅ IMPLEMENTED (T-312 page, T-329 counts, T-331 lean-down, T-336 station cards, T-337 map centre)
*`pages/Dashboard.jsx` + `components/dashboard/`; verified in a real browser at **36/36**, and against a second API instance whose InfluxDB is unreachable at **11/11** (every InfluxDB-derived number renders "—", never `0`) - see T-331 in the tracker. The T-336 station cards were verified at **23/23** against the running API (default station, all five values, the Rule 2 rendering, the picker, and the shared selection in both directions), and the T-337 map centre at **14/14** - the pin's anchor measured within 1 px of the container centre, the centre inverted back to the first-registered station's own coordinates, and no re-centring after a forced registry refetch.*

**Layout as built** - the arrangement the user asked for, and the reason this section no longer matches the mockup:

| # | Block | Owner |
| :--- | :--- | :--- |
| 1 | **Board Status** - exactly **two cards: Boards Online / Boards Offline** | T-329, `BoardStatusCards.jsx` |
| 2 | **Water Quality by Board** - the count of boards per status: **Safe / Acceptable / Not Safe** | T-329, `WaterStatusCards.jsx` |
| 3 | **Station Condition** - one station's **Water Quality Status, pH, Turbidity, WiFi, battery** + the station picker | T-336, `StationReadingsCards.jsx` |
| 4 | **Board Locations** - the map (2.4), the main element of the page | T-315 / T-316 |

Every count on the page comes from `GET /api/dashboard/summary`, which counts **`is_active = true` only**: a deactivated board appears in **no** count, on **no** marker and in **no** picker option (§6.3/A28), and each card's footnote states the scope rather than leaving the user to wonder why the numbers do not add up to the registry ("4 active boards counted · 1 deactivated excluded"). With `influxAvailable: false` the InfluxDB-derived numbers render **"—", never `0`** - a zeroed summary would read as a confident all-clear.

> 🔁 **§2.2's reading cards are BACK as block 3 (T-336); §2.3's bar and §2.5's chart stay removed.** T-331 removed the whole "Latest Reading" panel - the pH card, the Turbidity card *and* the Overall Water Status bar - plus the "Historical Sensor Data" chart, and this note used to say they "must not be restored without the placement being decided". **The user has now decided the placement** (directly below *Water Quality by Board*, above the map), which was the condition that note set - so §2.2 is rendered again, **expanded** from two cards to five (the node-condition trio plus the original pH/Turbidity) and with a **station picker** so changing the described board no longer requires clicking a map marker. T-331's follow-up note ("the reading cards belong on the board detail view") is thereby resolved in favour of the dashboard instead. The **chart** and the **bar** are still not rendered and still have no decided placement, so for those two the old rule stands: decide the placement first. §2.3's *wording* ("Not Safe (Do Not Drink)") is now the Water Quality Status card's advisory line.

**Title section**
- **Main heading / subheading:** provided **once by the global header** (§7.1, T-309) - the page
  must not repeat them, or the same sentence appears twice on the primary screen. The dashboard therefore renders **no `h1`**; its own blocks are `h2`.
- **System status:** `"System Status: "` + `<span className="text-green-500 font-semibold">Online</span>` - this is the **Socket.io connection to the API**, not a board's connectivity (`title` says so; boards' Online/Offline are the two cards above).
- **Board ID badge:** pill-shaped, `bg-purple-100`, `text-purple-700`, `text-xs`, `px-3`, `py-1`, `rounded-full` - it names the **selected** board, falling back to "No board reporting yet".
- **Selection:** the station cards, the map popup, the badge and the picker all describe **one** selection (T-336) - by default **the first board registered** (the oldest `createdAt` among the active boards, *not* the registry's newest-first list order, so adding a board cannot change what the page opens on), switchable either with the **station picker** in the Station Condition header or by clicking a marker. Because it is one shared value, the cards, the picker, the marker highlight and the badge can never disagree. A board that is deactivated or deleted while selected falls back to the default instead of keeping a stale selection, and the picker falls back to its first option if the chosen id is no longer offered.
- **Counts timestamp + Refresh:** the header shows when the summary was generated (Day.js, Rule 7) and a manual **Refresh**; live updates already arrive over Socket.io and Rule 5 forbids polling, so re-reading is a deliberate user action.

**Interactive map component**
- **Function:** geographical overview of all active boards; clicking a location shows real-time readings.
- **Technology:** **`react-leaflet`** (Rule 4 — the "Mapbox GL JS or Google Maps API" alternatives in `docs/ui-requirement.md` are void). Tiles are OpenStreetMap, which needs no API key. The A18 icon fix lives in `components/dashboard/mapIcons.js` (T-316).
- **Placement:** full width of the main content area, **`h-[70vh] min-h-[420px]` (`md:min-h-[560px]`)** since T-331 - it is the point of the screen now. (2.4 originally said `h-96`/`500px`, which is what T-315 shipped before the user asked for more.)
- **Centre (T-337): the FIRST REGISTERED STATION, at zoom 9** - the same board the Station Condition cards default to (oldest `createdAt` among the active boards), so the opening view and the board the rest of the page describes are the same place. Until T-337 this was a fixed Pagoh, Johor (2.1667, 102.7667) centre; **Pagoh is now only the pre-data fallback**, used for the first paint before `GET /api/boards` resolves and when no active board is registered at all. Three view controls exist because the registry can hold boards anywhere: **`First station`** (reset - flies back to that board, and is disabled when no active board exists), `Malaysia` (the whole country) and `All boards` (`fitBounds` over the markers, `maxZoom 12`). A marker outside the centred board's neighbourhood legitimately shows off-screen, which is what `Malaysia` / `All boards` are for.
- **The zoom is deliberately regional, not street level:** centring on one station at zoom 15 would push every other marker off-screen, and a map showing a single pin reads as boards having gone missing rather than as being zoomed in. The practical consequence today is that the two seeded boards sit ~500 m apart and therefore **overlap at zoom 9** - `All boards` separates them. Raise `DEFAULT_MAP_ZOOM` in `utils/constants.js` if closer is preferred.
- **The re-centre is a one-shot, not a subscription:** `MapContainer`'s `center`/`zoom` are read only at mount, so the late-arriving station is honoured by an effect that compares the *coordinates* (never array identity) and calls `setView` once per distinct position. A re-render, or a `refetchOnFocus` registry refresh returning the same coordinates, must not yank the map back while the operator is panning it.
- **Markers:** one per active board at `latitude`/`longitude`, colour-coded 🟢 Safe, 🟡 Acceptable, 🔴 Not Safe, and **grey when `wqStatus` is `null`** (never reported, or InfluxDB unreadable) - a board must not be painted green for a reading it never sent. They are inline-SVG `divIcon`s (cached per status + selected state), which is also what makes them colour-coded at all.
- **Click interaction:** the marker selects the board and opens a popup showing `Location Name`, `Board ID`, the live `pH Level` and `Turbidity`, `Last Seen` (Day.js relative/absolute), the status pill, and a **"Historical Data"** button that goes to `/historical` (T-332 - the button used to say "View details" and open the `/boards` registry, while the user wants the clicked board's history; the registry is still one sidebar click away). **This popup is one of two places the dashboard shows pH/turbidity** — the Station Condition cards below the counts are the other (T-336). Before T-336 it was the only one.
- **Data integration:** `GET /api/dashboard/boards-locations` fetches coordinates from MySQL; Socket.io updates the Redux store so marker colours change as new data arrives. A §7.8 legend, an "N active boards mapped" counter and explicit loading/empty/degraded states keep a blank map from being unexplained.

> ✅ **Backend ready (§6.3, T-209 … T-211):** three JWT-guarded reads - `GET /api/dashboard/summary` (counts), `GET /api/dashboard/boards-locations` (markers: `latitude`/`longitude` are **numbers**, plus `wqStatus`/`isOnline`/`lastSeen`), and `GET /api/dashboard/latest/:boardID` (the registry row + its newest `reading`, which is what the click-to-view popup shows). Every response carries `influxAvailable`; when it is `false` the InfluxDB-derived numbers are `null` (never `0`) and markers come back grey/unknown, so the UI must render "—" rather than "0". A marker's `wqStatus` is `null` for a board that never reported.

**Live updates (§7.6, Rule 5)** — the page subscribes to `sensor-update` through `useSocket()`; `sensorSlice` records the reading (and a `receivedCount`). Each event (a) overlays the freshest reading on the **station cards** and on the marker immediately and (b) invalidates the `DashboardSummary` tag, so the counts and markers re-query. The station cards make **no request of their own** for a pushed reading: the socket copy is preferred over the REST reading, and the footer labels it "live from the sensor" (T-336). That is a **push**: nothing polls.

---

**Station condition cards (§2.2, rendered again as block 3 - T-336)**

`components/dashboard/StationReadingsCards.jsx` (cards, plus the exported `StationSelect`) over `stationPresentation.js` (JSX-free helpers, the same split as `boardBadges.jsx`/`boardPresentation.js`).

- **Where:** the section **below "Water Quality by Board" and above the map** - the placement the user decided in T-336, which is what cleared T-331's "do not restore without deciding the placement" note.
- **Grid:** `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5` (five tiles: one row on a wide screen, 3+2 on `lg`, 2+2+1 on `sm`).
- **The five cards** (all the shared `KpiCard.jsx`, so the tile stays the one implementation):

| Card | Value | Second line | Colour source |
| :--- | :--- | :--- | :--- |
| **Water Quality Status** | `Safe` / `Acceptable` / **`Not Safe`** (Rule 2) | the advisory: "Safe to drink" / "Treat before drinking" / "Do not drink" | `waterStatusStyle()` - `utils/waterStatus.js` |
| **pH Level** | `7.80` (`formatMeasurement`, 2 dp) | — | light blue tile |
| **Turbidity** | `0.60 NTU` | — | light yellow tile |
| **WiFi Connection** | `Excellent` / `Good` / `Fair` / `Poor` | `Signal -95 dBm` (the `rssi` behind the tag) | `wifiStatusStyle()` - `boards/boardPresentation.js` |
| **Battery Status** | `Full` / `Medium` / `Low` / `Critical` | `3.61 V` (the `batt_voltage`) | `battLevelStyle()` - `boards/boardPresentation.js` |

- **pH and Turbidity deliberately carry no status line.** T-331's version put the stored `wq_status` on both because there was no status card; with a dedicated Water Quality Status tile beside them, three of five tiles reading "Not Safe" looks like a bug rather than information. The measurement is the value; the status is the first card.
- **WiFi and battery show the measurement behind the tag** because the tags are coarse: `Fair` and `Poor` are one `rssi` step apart, and `batt_level` alone cannot distinguish a "Low" at 3.3 V from one at 3.0 V.
- **Unknown, never zero (A28):** every one of these five values is InfluxDB-derived, so a missing one renders **"—"** - never `0.00`, `Poor` or `Critical`. `influxAvailable: false` produces an amber note; a registered board that has never reported produces "…has not reported a reading yet, so every value above is unknown rather than zero" instead of five unexplained dashes. The loading state renders "—"/"Loading…" only while a reading has never been held, so a background refetch never blanks a card.
- **Footer:** the station label, when the reading arrived (Day.js, Rule 7 - relative inside an hour, absolute beyond), and "live from the sensor" when the socket pushed it.
- **`StationSelect`** - a native `<select>` styled like the Historical page's board filter (`rounded-md bg-gray-100 px-3 py-2`, `focus:ring-2 focus:ring-purple-500`), labelled `STATION`, options `AA240238 — Tank 12`. It **renders nothing** when there are no active stations and is **disabled** when there is only one, because a one-option picker that silently does nothing reads as broken. Its options are the registry's active rows: `GET /api/boards?page=1&limit=100` is the only route carrying `createdAt`, which the default needs.
- **The default is "the first board registered"** - the oldest `createdAt` among the active boards (`firstRegisteredStation()`), *not* `data[0]`, because the registry is returned newest-first and picking by list order would silently re-point the cards at a different station every time a board is added. While the registry is in flight (or if it fails) the old "most recently reporting" rule supplies the default so the badge and popup are never blank.
- **One shared selection:** the picker, the map's marker click, the popup and the header badge all read the page's single `pickedBoardId`. A selection is validated against the **union** of the registry and the marker list, so it survives the two queries resolving in either order - and a board that disappears falls back to the default rather than lingering.

**Requirements still NOT rendered: §2.3's bar and §2.5's chart**

**Overall water status (§2.3)** — ⛔ the **bar** is still not rendered, and the user has not asked for it back.
- Heading "Overall Water Status" (`text-lg`, `font-semibold`); status text e.g. "Not Safe (Do Not Drink)" (`text-red-500`, `font-semibold`) - the **worst** status among the active boards; progress bar `w-full h-4 bg-gray-200 rounded-full` with the fill colour driven by `wq_status` (Green = Safe, Yellow = Acceptable, Red = Not Safe).
- *Status:* **deleted** with the panel (T-331), together with `WaterStatusBar.jsx` and the `overallWaterStatus()` / `overallWaterStatusMessage()` / `countForStatus()` helpers. The water-quality **counts** row covers the "what is the fleet's status" question; nothing draws the single-bar answer. **T-336 took only its wording** - "Not Safe (Do Not Drink)" is now the Water Quality Status card's advisory line, scoped to the selected station. The bar's placement is still undecided, so the no-entry rule still stands for it.

**Historical sensor data chart (§2.5)** — ⛔ still not on the dashboard; nothing about T-336 changed this.
- Header "Historical Sensor Data" with time-range filters; Chart.js line chart (`react-chartjs-2` + `chartjs-adapter-dayjs-4`); two lines (blue pH, yellow Turbidity); Day.js X-axis; dual Y-axes (left pH 0–14, right Turbidity - the shipped implementation **scaled the right axis to the data** instead of a fixed 0–1000, which flattens a 1–25 NTU series); bottom-centred legend; tooltips with the exact timestamp; a `null` window stayed a **gap**, never interpolated.
- *Status:* `SensorChart.jsx` and `api/historicalApi.js` were **deleted** with the panel (T-331) - `GET /api/historical/:boardID` had no other consumer. §7.4's Historical page (T-321) owns the chart, and `chart.js` / `react-chartjs-2` / `chartjs-adapter-dayjs-4` stay in `package.json` for it.


### 7.3 Boards Management Module — ✅ IMPLEMENTED (T-318 list, T-319 add/edit, T-320 row actions)
*`pages/Boards.jsx` + `components/boards/`; verified in a real browser at 39/39 (see the tracker).*

**Board list table**
- **Add button:** "Add Board" at the top of the table - ✅ as specified. **There is no Refresh button:** the list keeps itself current (`useBoardLiveUpdates`), and a manual refresh would be the only thing left to click. See "Live updates" below.
- **Columns (trimmed on request):** `Board ID`, `Location Name`, `Status` (Active/Inactive), `Connection`, `Last Seen`, `Actions`. **`MAC Address`, `Latitude`, `Longitude`, `Wi-Fi` and `Battery` are deliberately not columns any more** - the table answers "which board needs attention?", the six columns fit a laptop without horizontal scrolling, and the dropped metadata is one click away in the 👁️ detail modal (which still carries 7.3's "full metadata and status"). Unknown values render as a dash, and Online reads **Unknown** - never a false "Offline" - when InfluxDB was unreadable.
- **Pagination:** server-side (`page`/`limit`, because `GET /api/boards` already paginates) with a rows-per-page selector (10 / 20 / 50) and a "1–20 of N" readout. Header clicks sort the rows **of the current page**: sorting the whole registry would need an API parameter that does not exist, so it is not offered.
- **Per-row actions:** 👁️ View (read-only modal with the full metadata and status badges), ✏️ Edit (form; `boardId` is **disabled** - it is immutable), 🔄 Activate/Deactivate (`PATCH .../status`; the button **sets** the flag, so a double click cannot flip it back), 🗑️ Delete (confirmation modal that names the board and states that the readings survive the 30-day retention).
- **Delete flow:** the row disappears and the list refetches; deleting the only row of the last page steps back a page instead of leaving an empty page.
- **Errors:** a `409` is shown **against the field it belongs to** (board ID vs MAC - the API names the clashing column), a `400` shows the API's validation message, and a failed toggle/delete is reported above the table rather than swallowed.
- **Technology:** React + RTK Query + **TanStack Table v9** (`useTable` with explicit `features` - see the tracker's trap about `columnVisibilityFeature`) + Lucide React icons. No Shadcn/ui: the table and its controls are hand-rolled Tailwind, like `ui/Modal.jsx` (T-311).
- **Live updates (Rule 5 - Socket.io, never polling):** the rows are fetched once on mount, then kept current from the pushed stream: a `sensor-update` patches the cached row for the board that reported (its `lastSeen`, `battLevel`, `wifiStatus`) and coalesces an authoritative refetch of `GET /api/boards` so `isOnline` always comes from the API - the browser never re-derives it (`utils/constants.js`). A registry change made **in this browser** is instant (the mutation invalidates the tag); one made elsewhere is picked up on the next pushed reading or when the tab regains focus (`refetchOnFocus` / `refetchOnReconnect`, enabled by `setupListeners`). Relative "Last Seen" labels re-render once a minute - a cosmetic tick that performs no request.

### 7.4 Historical Data Module
**Interactive chart:** Chart.js line chart of `pH`, `Turbidity`, `batt_voltage`, `rssi`; filter by 1 Hour / 24 Hours / 1 Day / 1 Week / 1 Month or a custom range.

**Historical data list (table)**
- **Columns:** `Time`, `Board ID`, `pH`, `Turbidity`, `wq_status`, `Batt Voltage`, `Batt Level`, `RSSI`, `Wi-Fi Status`.
- **Pagination:** rows-per-page dropdown at the bottom — 20 / 50 / 100.
- **Export to Excel:** button at the **top** of the table; exports the currently filtered data to `.xlsx`.

**Excel export flow:** user clicks Export → RTK Query `GET /api/historical/export/excel/:boardID` with range and filters → Express queries InfluxDB → Express builds the file with `exceljs` → browser downloads it.

> ✅ **IMPLEMENTED (§6.4 backend, T-213 … T-217; page T-321 … T-323).** `pages/Historical.jsx` + `components/historical/` (`HistoricalChart.jsx`, `ReadingsTable.jsx`, `ExportButton.jsx`, `historicalPresentation.js`) + `api/historicalApi.js`. Verified in a real browser at **28/28** (chart geometry, the nine columns, Rule 2 rendering `Unsafe` as "Not Safe", the range buttons re-querying, the custom range, a real `.xlsx` download and no polling). Notes: the four series each get **their own Y axis** (pH units / NTU / volts / dBm - sharing one would flatten pH into the axis); an empty aggregate window arrives as `null` and is drawn as a **gap**, never as zero; the export is an RTK Query **mutation returning a blob** because the route needs the Bearer token, so an `<a href download>` cannot be used.
>
> **Backend ready (§6.4, T-213 … T-217):** the table's rows come from `GET /api/historical/:boardID/readings` (`data` + `total` + `page` + `limit`), the chart from `GET /api/historical/:boardID?range=…`, the overlay from `GET /api/historical?boardIDs=…`, and the button is a plain `GET` of the export path (an `<a download>` or a fetch → blob; the file itself is generated on the server). Timestamps arrive as ISO-8601 UTC for Day.js, and `wq_status` must still be displayed as **Not Safe** when it is `"Unsafe"` (Rule 2).

### 7.5 Users Module (Profile Only)
*Single user profile model. RBAC is not implemented.*
- **Profile management — ✅ IMPLEMENTED as a MODAL (T-324):** opened from the header avatar menu,
  pre-filled from `GET /api/users/profile`, saved with `PUT /api/users/profile` - the API's own
  validation (400) and conflict (409) messages are surfaced. Fields: first name, last name,
  email, phone. Escape, the backdrop and the Close button all dismiss it.
- **Profile picture upload — ✅ IMPLEMENTED in that modal:** `POST /api/users/upload-avatar`
  (multipart `avatar`, PNG/JPEG/WebP, max 2 MB). Wrong type and oversize are refused in the
  browser first, the endpoint's 413/415 are mapped too, and the header avatar refreshes
  immediately because the returned user is written to the store.
- **Password management — ✅ IMPLEMENTED (A21/T-204):** a "Change password" section inside the profile modal with **current password, new password and a verify box**. Checked in the browser (>= 8 characters, must differ from the current one, both new entries must match) and again by the API; the current password is verified with `bcrypt.compare` and a mismatch answers `401`. The response never echoes anything credential-shaped.
- **No user list:** because there is exactly one profile (Rule 1) there is no
  `GET /api/users` endpoint and no users-table page; signing in lands on the Dashboard
  (§7.1). A list would require a new appendix decision.

### 7.6 Real-Time Data Integration (Socket.io)
**Consumers of `sensor-update`:** the Dashboard (live reading + counts, T-312/T-329) and the **Boards registry** (row status, T-318). Both go Socket.io -> Redux -> UI; neither polls.
1. **Redux store:** a `sensorSlice` holds the latest `pH`, `turbidity`, and `wq_status`.
2. **Socket.io client:** listens for the `sensor-update` event from the Express backend.
3. **UI update:** on new data, Redux updates state; KPI cards, the Overall Water Status bar, and map markers re-render instantly.
4. **Chart update:** for the historical chart, append the new point (if it falls inside the selected range) or refetch InfluxDB data via RTK Query.

### 7.7 Responsive Design (Tailwind Breakpoints)
- **Mobile (`sm`):** sidebar collapses to a hamburger menu; KPI cards stack (`grid-cols-1`); map height `h-64`; tables scroll horizontally.
- **Tablet (`md`):** sidebar visible; KPI cards side by side (`grid-cols-2`); map full width.
- **Desktop (`lg`):** full layout as per the mockup; map height `h-96` / `500px`.

### 7.8 Status Vocabulary & Colour Mapping (cross-cutting)
| `wq_status` (DB value) | UI label (Rule 2) | Colour | Marker | Progress bar |
| :--- | :--- | :--- | :--- | :--- |
| `Safe` | Safe | Green | 🟢 | Green |
| `Acceptable` | Acceptable | Yellow | 🟡 | Yellow |
| `Unsafe` | **Not Safe** | Red | 🔴 | Red |

---

## 8. Project Folder Structure

The tree below is byte-identical to the one in [`docs/project-structure.md`](project-structure.md);
that mirror adds a "reality check" listing what exists today versus what is still planned.
`DONE` = exists and implemented - `TO DO` = planned. No backend file is a stub any more.

```text
water-ui/
│
├── .env.example                    # Every overridable variable (DONE)
├── .gitignore                      # DONE
├── docker-compose.yml              # 8 services: 6 by default + minio-init + the app profile (DONE)
├── README.md                       # Quick-start guide (DONE)
├── node-red.md                     # DUPLICATE of docs/node-red.md - delete it (A6 / T-503)
│
├── 📁 docker/                      # Supporting container configuration
│   └── mysql/init/
│       └── 01-dev-grants.sh        # Dev-only grants so `prisma migrate dev` can create
│                                   # its shadow database (A17)                 (DONE)
│
├── 📁 docs/                        # Documentation
│   ├── MASTER_CONTEXT.md           # Source of truth (sections 1-9 + Appendix A)
│   ├── database.md                 # MySQL & InfluxDB schema design
│   ├── modules.md                  # Functional modules & API endpoints
│   ├── mqtt-topics.md              # Frozen MQTT topic + payload contract
│   ├── node-red.md                 # MQTT & Node-RED pipeline guide
│   ├── pre-development-setup.md    # DevOps, .env.example, Compose, Prisma bootstrap
│   ├── project-structure.md        # This file
│   ├── task-tracker.md             # Work queue (stable T-xxx ids)
│   ├── technology.md               # Technology stack
│   └── ui-requirement.md           # Frontend UI/UX requirements
│
├── 📁 backend/                     # Express API + Socket.io (TypeScript - see A15)
│   ├── .dockerignore               # DONE
│   ├── .env / .env.example         # Local secrets / template               (DONE)
│   ├── Dockerfile                  # prisma generate + tsc -> dist           (DONE, never built: T-401)
│   ├── package.json                # DONE
│   ├── package-lock.json           # DONE
│   ├── tsconfig.json               # src -> dist, CommonJS                  (DONE)
│   ├── prisma.config.ts            # Prisma 7 CLI config (holds DATABASE_URL) (DONE)
│   ├── scripts/
│   │   └── run-host.mjs            # `npm run start:host` / `dev:host`: API on the host,
│   │                               #   with the three localhost overrides         (DONE, T-231)
│   ├── prisma/
│   │   ├── schema.prisma           # User + Board models (no datasource url - Prisma 7) (DONE)
│   │   ├── seed.ts                 # Seed: one user, one board (run via tsx)     (DONE)
│   │   └── migrations/             # `prisma migrate` history (20260922042622_init) (DONE)
│   └── src/
│       ├── index.ts                # Express + Socket.io entry point           (DONE)
│       ├── generated/              # `prisma generate` output - GIT-IGNORED    (DONE)
│       ├── types/
│       │   ├── board.ts            # PublicBoard, BoardStatus, select, mapper,
│       │   │                       # MAC / board-id / coordinate rules, A5 window (DONE)
│       │   ├── historical.ts       # HISTORY_RANGES, ResolvedRange, SeriesPoint,
│       │   │                       # ReadingRow + export caps (A27)             (DONE)
│       │   ├── dashboard.ts        # DashboardSummary, BoardLocation,
│       │   │                       # LatestReadingResponse (A28)                (DONE)
│       │   ├── sensor.ts           # SensorReading, WqStatus + runtime tag lists (DONE)
│       │   ├── simulator.ts        # condition bounds + payload generator (T-335) (DONE)
│       │   └── user.ts             # PublicUser, publicUserSelect, AuthClaims    (DONE)
│       ├── config/
│       │   ├── db.ts               # Prisma 7 + MariaDB adapter + TLS (DB_TLS, T-229) (DONE)
│       │   ├── influx.ts           # InfluxDB v2 query/write clients + health    (DONE)
│       │   ├── minio.ts            # Object storage for profile pictures        (DONE)
│       │   └── socket.ts           # Socket.io server + emitSensorUpdate()      (DONE)
│       ├── controllers/
│       │   ├── authController.ts   # register / login / me                     (DONE)
│       │   ├── userController.ts   # profile / avatar upload                   (DONE)
│       │   ├── boardController.ts  # boards CRUD + Zod schemas + status        (DONE)
│       │   ├── dashboardController.ts  # summary + markers + latest reading     (DONE)
│       │   ├── historicalController.ts # series + readings + xlsx export (A27) (DONE)
│       │   └── simulatorController.ts  # simulator start / stop / status (T-335) (DONE)
│       ├── middleware/
│       │   ├── authMiddleware.ts   # JWT verify + signToken                    (DONE)
│       │   ├── errorMiddleware.ts  # 404 + central error responder             (DONE)
│       │   └── validate.ts         # Zod body + query validation               (DONE)
│       ├── routes/
│       │   ├── authRoutes.ts       # -> /api/auth                              (DONE)
│       │   ├── userRoutes.ts       # -> /api/users                             (DONE)
│       │   ├── boardRoutes.ts      # -> /api/boards (JWT on all six)           (DONE)
│       │   ├── dashboardRoutes.ts  # -> /api/dashboard (JWT) + internalRoutes
│       │   │                       #    -> /api/internal/sensor-update         (DONE)
│       │   ├── historicalRoutes.ts # -> /api/historical (JWT on all four)      (DONE)
│       │   └── simulatorRoutes.ts  # -> /api/simulator (JWT on all three)      (DONE)
│       ├── services/
│       │   ├── influxService.ts    # status (T-208) + historical reads (T-213)  (DONE)
│       │   ├── boardStatus.ts      # shared status lookup + degradation (A28)   (DONE)
│       │   ├── excelService.ts     # exceljs workbook, streamed (Rule 3, T-215) (DONE)
│       │   └── simulatorService.ts # the single MQTT publishing run (T-335)    (DONE)
│       └── utils/
│           └── httpError.ts        # Status-carrying error type                (DONE)
│
├── 📁 frontend/                    # React SPA (Vite + Tailwind v4 - see A19)
│   ├── .env / .env.example         # RTK Query base URL + socket origin        (DONE)
│   ├── .dockerignore               # DONE
│   ├── Dockerfile                  # vite build -> nginx                       (DONE, never built: T-401)
│   ├── nginx.conf                  # Serves the SPA + proxies /api, /socket.io (DONE)
│   ├── index.html                  # Vite entry - MUST be at the root, not public/ (DONE)
│   ├── vite.config.js              # Dev proxies for /api and /socket.io       (DONE)
│   ├── package.json                # DONE
│   ├── package-lock.json           # DONE
│   ├── tailwind.config.js          # Loaded via `@config` in index.css         (DONE)
│   ├── postcss.config.js           # @tailwindcss/postcss (v4)                 (DONE)
│   ├── public/favicon.svg          # Static asset                              (DONE)
│   └── src/
│       ├── index.css               # Tailwind v4 entry: @import + @config + @theme (DONE)
│       ├── main.jsx                # React entry (Provider + BrowserRouter)      (DONE)
│       ├── App.jsx                 # Router host: renders routes.js behind the guard (DONE, T-326)
│       ├── routes.js               # Route table: /login + guarded /            (DONE, T-326)
│       ├── api/
│       │   ├── apiSlice.js         # RTK Query base slice + auth header        (DONE, T-301)
│       │   ├── authApi.js          # login + getMe injected endpoints          (DONE, T-302)
│       │   ├── boardApi.js         # list/create/update/status/delete          (DONE, T-302)
│       │   ├── simulatorApi.js     # simulator start / stop / status (T-335)   (DONE)
│       │   ├── dashboardApi.js     # summary + markers + latest reading (A28) (DONE, T-302)
│       │   └── historicalApi.js    # series + readings + .xlsx export       (DONE, T-321..T-323)
│       ├── store/
│       │   ├── index.js            # Store configuration                       (DONE)
│       │   └── slices/
│       │       ├── authSlice.js    # session + localStorage persistence        (DONE, T-303)
│       │       └── sensorSlice.js  # DONE
│       ├── components/
│       │   ├── layout/             #   Sidebar.jsx, Header.jsx, AppLayout.jsx (the shell),
│       │   │                       #   ProtectedRoute.jsx, PlaceholderPage.jsx  (DONE, T-308/T-309)
│       │   ├── dashboard/          #   KpiCard.jsx, BoardStatusCards.jsx, WaterStatusCards.jsx,
│       │   │                       #   StationReadingsCards.jsx (+StationSelect), stationPresentation.js,
│       │   │                       #   InteractiveMap.jsx, mapIcons.js (A18 icon fix),
│       │   │                       #   dashboardPresentation.js  (DONE, T-313/T-315/T-316/T-329/T-336;
│       │   │                       #   WaterStatusBar.jsx + SensorChart.jsx were removed by T-331)
│       │   ├── boards/             #   BoardTable.jsx, BoardFormModal.jsx, BoardViewModal.jsx,
│       │   │                       #   boardPresentation.js, boardBadges.jsx (DONE, T-318..T-320)
│       │   ├── historical/         #   HistoricalChart.jsx, ReadingsTable.jsx, ExportButton.jsx, historicalPresentation.js  (DONE, T-321..T-323)
│       │   ├── profile/            #   ProfileModal.jsx - the profile is a modal (DONE, T-324)
│       │   └── ui/                 #   Modal.jsx + ConfirmDialog.jsx DONE (T-311); Button, Table TO DO
│       ├── pages/                  # Login, Dashboard (DONE, T-312/T-326/T-329/T-331), Boards
│       │                           #   (DONE, T-318..T-320, verified 40/40 under T-330);
│       │                           #   Historical (T-321..T-323, verified 28/28).
│       │                           #   Simulator (T-335 - the MQTT control page,
│       │                           #   a development tool rather than a dashboard page).
│       │                           #   No Profile page: the profile is a modal (T-324)
│       ├── hooks/
│       │   ├── useSocket.js        # Socket.io listener hook (dashboard)       (DONE)
│       │   ├── useBoardLiveUpdates.js
│       │   │                       # patches the cached board row from a pushed
│       │   │                       # reading + coalesces an authoritative refetch
│       │   │                       #                                            (DONE, T-318)
│       │   ├── useNow.js           # re-render tick for relative labels, no
│       │   │                       # network call                              (DONE)
│       │   └── useAuth.js          # sign-in / restore / sign-out              (DONE, T-304)
│       ├── types/                  # EMPTY - decide TS on the frontend first (T-328)
│       └── utils/                  #   constants.js (A5 window, map zoom,
│                                   #     Pagoh = pre-data fallback - T-305/T-337)
│                                   #   waterStatus.js (Rule 2 vocabulary + colours, T-307)
│                                   #   reading.js (REST/socket reading shape)
│                                   #   datetime.js (configured Day.js, Rule 7)
│                                   #   apiError.js (the `{ error }` envelope)     (DONE)
│
└── 📁 iot/                         # IoT pipeline & edge configuration
    ├── mosquitto/
    │   └── mosquitto.conf          # Listener 1883, anonymous dev, WS on 9002 (A8) (DONE)
    ├── node-red/                   # Bind-mounted at /data
    │   ├── settings.js             # Flow file, credential secret, logging    (DONE)
    │   ├── flows.json              # MQTT in -> function -> InfluxDB write +
    │   │                           #   Notify Express + Telegram alert + catch (DONE)
    │   ├── package.json            # node-red-contrib-telegrambot (A14)        (DONE)
    │   └── .config.*, .npm/        # Runtime artefacts written by Node-RED - GIT-IGNORED
    ├── esp32c3/
    │   └── water_quality_mqtt.ino  # XIAO ESP32C3 publisher (+ LWT status topic) (DONE)
    └── simulator/
        ├── package.json            # Its own dependency set: `mqtt` only       (DONE)
        └── simulate-esp32.js       # Standalone board simulator for the same
                                    #   topics/payload, no hardware needed     (DONE, T-334)
```

**Current repository reality:** `docker/`, `iot/`, the entire `backend/` REST surface
(users, boards, dashboard and historical data) and the frontend *shell* plus the
**Dashboard** and **Boards** modules exist. The Dashboard is complete - boards Online/Offline,
the water-quality counts, the **Station Condition** cards (T-336) and the map centred on the
**first registered station** (T-337), verified in a real browser at **36/36** plus **11/11**
against an instance with InfluxDB unreadable, with the T-336 cards at **23/23** and the T-337
centre at **14/14** - and the Boards registry was verified at 40/40.
**§7.2's Overall Water Status bar and its chart were removed from the Dashboard at the user's
request (T-331) and are still not rendered**; the chart belongs to the Historical page, and the
pH/Turbidity reading cards **came back in T-336** as the expanded Station Condition row. What is
left on the frontend is that Historical page
(`pages/Historical.jsx`, done and verified at 28/28 - T-321..T-323), the remaining `ui/`
primitives (T-311) and the frontend-TypeScript decision (T-328). The `app` Compose profile
has never been built (T-401). Git-ignored build output (`backend/dist/`, `node_modules/`,
`frontend/dist/`, Node-RED `.config.*` / `.npm/`) is omitted. `node-red.md` still exists
twice - repo root and `docs/` (A6, T-503).

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
# Where the pipeline POSTs each validated reading so the API can push it to the
# browser over Socket.io (the flow's "Notify Express" node, T-333).
#   default          http://backend:5000        - the compose service, correct once
#                                               the `app` profile exists (T-401)
#   host-run API     http://host.docker.internal:5000   <- what dev actually needs
# With the default, readings still reach InfluxDB but the dashboard only updates on
# refresh, because `backend` is not a running container. host.docker.internal resolves
# on Docker Desktop by default and on Linux via the nodered service's extra_hosts.
BACKEND_URL=http://host.docker.internal:5000

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

## 🔎 APPENDIX A — Known Conflicts & Open Decisions

These were found while consolidating `docs/` into this file and while running the stack. Rules 3 and 4 settled A2/A3. **Resolved:** A1-A5, A7-A10, A12-A21, A24, A26, A27, A28. **Open:** A6, A11, A22, A23, A25.

| ID | Conflict | Where it appears | Proposed resolution |
| :--- | :--- | :--- | :--- |
| **A1** | ✅ **RESOLVED — decided: `Acceptable`.** The middle tier is `Acceptable` in the InfluxDB schema, the dashboard counts, the UI legend *and* now the Node-RED function node, which previously emitted `Warning`. | `iot/node-red/flows.json`, `docs/node-red.md` §5.3, §5.3 above | Settled before any data was written, since it is an InfluxDB **tag** and could not be normalised in the UI afterwards. |
| **A2** | ✅ **RESOLVED** — map library was given as `Leaflet.js` / "React Leaflet (primary), alternatives Mapbox GL JS or Google Maps API" / "React Leaflet (or Google Maps API)". | `docs/technology.md`, `docs/ui-requirement.md`, `docs/modules.md` | **Rule 4 wins: `react-leaflet` only.** All three mirrors corrected (T-501). |
| **A3** | ✅ **RESOLVED** — Excel library was "`exceljs` or `xlsx` (SheetJS)". | `docs/modules.md` §4 | **Rule 3 wins: `exceljs`.** Mirror corrected (T-501). |
| **A4** | ✅ **RESOLVED** — the identifier was spelled `boardID` / `board_id` / `:boardID` inconsistently and `docs/modules.md` claimed Prisma stores `boardID`. | throughout | §4.1's mapping table is canonical; `modules.md` corrected to it (T-502). |
| **A5** | ✅ **RESOLVED — decided: 15 minutes, derived from InfluxDB** (first implemented as 5, then revised on request). "Online/Offline within the last X minutes" never defined X, and `boards.last_seen` / "user associations" were referenced by `docs/modules.md` but never existed in the MySQL schema. | `docs/modules.md` §2–3, §6.2, §6.3 | Decided: `BOARD_ONLINE_WINDOW_MINUTES = 15` (`backend/src/types/board.ts`, mirrored by the frontend's `utils/constants.js` in T-305) and `last_seen` = the newest InfluxDB `_time` per `board_id` — **no column added**, so nothing writes on the ingest hot path. Implemented in T-208 via `services/influxService.ts`; verified live on both sides of the window (14 min → Online, 16 min → Offline). The firmware publishes every **30 s**, so the window tolerates ~30 missed readings. The "user associations" claim is void (Rule 1: single user, no junction table). |
| **A6** | `node-red.md` exists twice — repo root and `docs/` — with identical size/content (6,191 bytes). | repo root, `docs/` | Keep `docs/node-red.md`, delete the root copy (if that copy is not Loader-generated). |
| **A7** | ✅ **RESOLVED** — the stale docs list was regenerated in §8 and `docs/mqtt-topics.md` now exists. | `docs/project-structure.md` | Done. |
| **A8** | ✅ **RESOLVED** — Mosquitto WebSockets now publish on host port `9002`; MinIO keeps `9001`. | `docker-compose.yml` | Done. |
| **A9** | ✅ **RESOLVED** — `iot/mosquitto/mosquitto.conf` and `iot/node-red/{settings.js,flows.json,package.json}` exist and are bind-mounted into their services. | `docs/project-structure.md` vs `docker-compose.yml` | Done. |
| **A10** | ✅ **RESOLVED — decided with the user.** Sidebar navigation items (`Dashboards`, `System Analytics`, `System Health`) do not match the defined pages (`Login`, `Dashboard`, `Boards`, `Historical`, `Profile`). | `docs/ui-requirement.md` §1.1, `docs/project-structure.md` §8, `src/components/layout/Sidebar.jsx` | **Concrete pages win, three items:** `Dashboard`, `Boards`, `Historical Data`; a fourth, `Simulator`, was added later by the Simulator Control Module (T-335 / `simulator-module.md` 2) even though it is a development tool rather than a dashboard page. The mockup's analytics labels are dropped rather than mapped onto pages that do not exist, and **Profile is reached from the header avatar menu instead of the sidebar**. Implemented as T-308/T-309; the page list in §8 keeps `Login` (public) and `Profile` (header-only). |
| **A11** | InfluxDB retention is stated as `30d` "then downsampled", but no downsampling task is described anywhere. | `docs/database.md` §2 | Either define the Flux `to()` downsampling task or soften the claim to plain 30-day retention. |
| **A12** | ✅ **RESOLVED** — the InfluxDB write path is implemented in `iot/node-red/flows.json` (§5) and the topic/payload contract is frozen in `docs/mqtt-topics.md`. | §1, §5, `docs/node-red.md` | Done. |
| **A13** | ✅ **RESOLVED** — 5 of 9 docs once ended mid-block with an unterminated code fence and lost the content beyond it: `MASTER_CONTEXT.md`, `database.md`, `technology.md`, `project-structure.md`, `pre-development-setup.md`. | `docs/` | Every fence is closed and the missing content is restored: `database.md` §3 (full data flow), `technology.md` §4 (now a pointer to `node-red.md` instead of a partial copy), `MASTER_CONTEXT.md` §8/§9 regenerated from the live repo, `pre-development-setup.md` regenerated from §9 (T-504). |
| **A14** | ✅ **RESOLVED (found by live testing)** — `nodered/node-red` v5 **no longer runs `npm install` on `/data/package.json`**; its `entrypoint.sh` only launches Node-RED, so the Telegram nodes stayed unregistered. Two fixes were needed: (1) override the entrypoint to install first, and (2) the stock entrypoint loads `node_modules/node-red/red.js` via a **relative** path, so the install must `cd` back to `/usr/src/node-red` before exec'ing it. | `docker-compose.yml` (`nodered` service), image `nodered/node-red:latest` (Node-RED v5.0.7) | Implemented and verified: `node-red-contrib-telegrambot version: v19.0.3` now loads. Do not simplify that entrypoint back to a bare `npm install` line. |
| **A15** | ✅ **RESOLVED — decided: the backend is TypeScript.** Prisma 7 removed the `prisma-client-js` generator; the replacement `prisma-client` generator **only emits TypeScript/ESM**. Setting `generatedFileExtension = "js"` is rejected as "unexpected" and emits ESM JavaScript, which CommonJS cannot `require()` (`Cannot use import statement outside a module`). Two further Prisma 7 breaks surfaced during the build: the datasource `url` property was **removed from the schema** (it now lives in `prisma.config.ts`), and MySQL needs a **driver adapter** (`@prisma/adapter-mariadb`) — `new PrismaClient()` alone is invalid. | `backend/prisma/schema.prisma`, `backend/prisma.config.ts`, `backend/src/config/db.ts`, `backend/tsconfig.json` | Implemented and verified: `prisma validate` passes, `prisma generate` emits `.ts` into `src/generated/prisma` (git-ignored), and `tsc` compiles `src/` → `dist/`. Do not "simplify" this back to plain JavaScript. |
| **A16** | ✅ **RESOLVED (found by live testing)** — the internal ingest route was mounted under `/api/dashboard`, so the real URL was `/api/dashboard/internal/sensor-update`. Node-RED posts to the **documented** `/api/internal/sensor-update`, which 404'd. | `backend/src/routes/dashboardRoutes.ts`, `backend/src/index.ts`, `iot/node-red/flows.json` | Fixed: the handler now lives in an `internalRoutes` router mounted at `/api`. Verified end to end — a Socket.io client received `sensor-update` after the POST. |
| **A17** | ✅ **RESOLVED** — `prisma migrate dev` needs a **shadow database** (CREATE/DROP DATABASE), but the Compose `MYSQL_USER` grant is scoped to one schema, so migration failed with `P3014` / `P1010`. | `docker/mysql/init/01-dev-grants.sh`, `docker-compose.yml` | Added a **dev-only** init script granting the app user broader privileges. Production should keep a least-privilege user and use `prisma migrate deploy`, which needs no shadow database. |
| **A18** | ✅ **RESOLVED — the documented fix is in place (T-316).** Leaflet's icon URLs are relative to its stylesheet, so the bundler reported `images/marker-icon.png referenced in images/marker-icon.png didn't resolve at build time` and any *default* marker would render as a broken image. | `frontend/src/components/dashboard/mapIcons.js` (new), `frontend/src/index.css` (the Leaflet CSS import) | Implemented: `mapIcons.js` imports `marker-icon.png` / `marker-icon-2x.png` / `marker-shadow.png` from `leaflet/dist/images/` (so Vite emits real asset URLs) and calls `L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })`. The dashboard's own markers are coloured inline-SVG `divIcon`s (§2.4's green/yellow/red), so they never touch the default icon at all. **Residual, documented rather than hidden:** `vite build` still prints three warnings for `leaflet.css`'s own `url()`s - `images/layers.png`/`layers-2x.png` (the layers-control toggle) and `.leaflet-default-icon-path` (the path-guessing hook `mergeOptions` bypasses). Nothing in this app renders either, so no request 404s; importing the stylesheet from JS instead would silence the warnings but reorder Tailwind's preflight *after* Leaflet's, which is the known way to break tile rendering - deliberately not done. |
| **A19** | ✅ **RESOLVED — decided: Vite + Tailwind v4.** The documented frontend tree is CRA-shaped (`public/index.html`, `src/index.js`), but create-react-app is unmaintained. Vite requires `index.html` at the project root, so `src/main.jsx` replaced `src/index.js` and `src/App.jsx` replaced `src/App.js`. Tailwind v4 is CSS-first, so the theme lives in `src/index.css` (`@theme`) with the documented `tailwind.config.js` still loaded via `@config`. | `docs/project-structure.md`, `frontend/vite.config.js`, `frontend/src/index.css` | Verified: `vite build` completes (69 modules) and Tailwind emits CSS. Extensions are `.jsx` because the project is native ESM. |
| **A20** | ✅ **RESOLVED — added `userRoutes.ts` + `userController.ts`.** The documented tree listed only `authRoutes.ts` (mounted at `/api/auth`) yet documented the profile endpoints under `/api/users/*`, so those paths were unreachable. | `backend/src/routes/userRoutes.ts`, `backend/src/controllers/userController.ts`, `docs/project-structure.md` | Split by prefix: `authRoutes` → `/api/auth`, `userRoutes` → `/api/users`. Both mounted in `src/index.ts`. |
| **A21** | ✅ **RESOLVED — decided: an authenticated current-password change.** Section 6.1 listed "bcrypt hashing plus **password reset**", but no reset endpoint was ever specified and there is no mail transport in the stack to send a reset link. | `docs/MASTER_CONTEXT.md` 6.1, 7.5, `PUT /api/users/password`, `components/profile/ProfileModal.jsx` | **`PUT /api/users/password` with `{ currentPassword, newPassword }`**, surfaced as a three-field section (current / new / verify) in the profile modal. It needs no new infrastructure, and asking for the current password is what protects the profile when the token (which lives in `localStorage`) leaks - a token-only change would let a thief lock the owner out. An emailed *forgot-password* flow stays out of scope for that reason. Implemented as T-204. |
| **A22** | ⚠️ **OPEN** — `/api/internal/sensor-update` is unauthenticated so Node-RED can post to it. It is only reachable on the compose network today, but that is an assumption, not a control. | `backend/src/routes/dashboardRoutes.ts` | Add a shared secret header (`INTERNAL_INGEST_TOKEN`) checked by the route, and set the same value in the Node-RED flow. |
| **A23** | ⚠️ **OPEN (found by reconciling the live schema)** — the live MySQL tables do not exactly match the documented design. (1) §4.1 and `database.md` say `TIMESTAMP`; the tables use **`datetime(3)`**. (2) `database.md` documents `updated_at ... ON UPDATE CURRENT_TIMESTAMP`, but the live column has **no `ON UPDATE` clause** — Prisma maintains it client-side, so any raw-SQL update leaves it stale. | `docs/database.md` §1, `docs/MASTER_CONTEXT.md` §4.1, `backend/prisma/schema.prisma` | Decide per item: correct the docs, or pin the schema (`@db.Timestamp(3)`) and add the `ON UPDATE` clause via a migration. Tracked as **T-224** and **T-225**. |
| **A24** | ✅ **RESOLVED — decided: the API connects to MySQL over TLS.** MySQL 8 authenticates `water_user` with `caching_sha2_password`, which a plaintext client can only use while the server still caches that user's password digest; otherwise it needs an RSA key exchange and fails with `ER_CANNOT_RETRIEVE_RSA_KEY`, surfacing as `pool timeout: failed to retrieve a connection from pool (active=0 idle=0)`. The Prisma CLI was unaffected (its own connector retrieves the key). | `backend/src/config/db.ts` | Implemented: `DB_TLS=require` (default, encrypts), `verify` (also checks `DB_TLS_CA`), `disable`. Cold-start verified after `docker compose restart mysql` — all 29 board checks pass with no manual step, sessions show `TLS_AES_256_GCM_SHA384` (T-229). `require` does not verify the server's identity (T-414), and `verify` needs a certificate with a SAN that MySQL's auto-generated one lacks (T-414). `require_secure_transport` stays OFF so the Prisma and `mysql` CLIs keep working. |
| **A25** | ⚠️ **OPEN (found while implementing boards)** — `boards.board_id` inherits MySQL's default `utf8mb4_*_ci` collation, so its `UNIQUE` key is case-INSENSITIVE while the InfluxDB `board_id` tag and the MQTT topic level are case-SENSITIVE. Registering `aa240238` blocks `AA240238`, and a row whose case differs from what the firmware publishes is accepted and then reads back as an empty series. | `backend/prisma/schema.prisma`, §4.1, §5.1 | Migrate the column to a case-sensitive collation (`utf8mb4_bin` / `utf8mb4_0900_as_cs`), or pin the firmware's case in the API and document the hazard in §4.1. Tracked as **T-230**. |
| **A26** | ✅ **RESOLVED — the boards API contract, decided while implementing §6.2.** (1) All six routes require a JWT, like `/api/users`. (2) `boardId` is immutable after create, because the MQTT topic level and the InfluxDB tag share it. (3) `PATCH .../status` **sets** `isActive`, so a retry cannot invert it. (4) `latitude`/`longitude` are JSON **numbers**, never `Decimal` strings — the boards half of T-227. (5) `P2002` → `409` naming the board id vs the MAC address; `P2025` → `404`. | `backend/src/controllers/boardController.ts`, `backend/src/types/board.ts`, `backend/src/middleware/validate.ts` | Implemented and verified live (29 checks). Note: Prisma 7 + `@prisma/adapter-mariadb` leaves `meta.target` **undefined** — the constraint name is read from anywhere inside `meta`; see the traps table in `task-tracker.md`. |
| **A27** | ✅ **RESOLVED — the historical API contract, decided while implementing §6.4.** §6.4 documents three endpoints, but §7.4's table and "multi-board comparison" cannot be served by them: the aggregated series has no tag columns and no pagination. Two endpoints were therefore added — `GET /api/historical?boardIDs=A,B&range=24h` (overlay, T-217) and `GET /api/historical/:boardID/readings?page=&limit=` (table rows, §7.4). Decided alongside: `range` and `start`+`end` are mutually exclusive with default `24h`; a custom span beyond the 30-day retention is rejected, not truncated; the series is **aligned** (`null` gaps, one row per window per board); the table is newest-first while the export is chronological; `total` counts `pH` records; the export is capped at 50,000 rows; and requested ids are resolved through the MySQL registry so the InfluxDB tag uses the stored spelling (which also defends T-230). | `backend/src/controllers/historicalController.ts`, `backend/src/types/historical.ts`, `backend/src/services/{influxService,excelService}.ts`, §6.4 | Implemented and verified live (69 checks: ranges, alignment, pagination, validation, 404/401, case-mismatch, and the workbook read back with `exceljs`). **Flagged for review:** the two extra endpoints are an addition to the original contract — if a different shape is wanted, this is the item to revisit. |
| **A28** | ✅ **RESOLVED — the dashboard API contract, decided while implementing §6.3.** §6.3 fixed the semantics (active boards only, 15-minute Online window, Safe/Acceptable/Unsafe counts) but not the payloads, so they were designed here: `summary` = `{ generatedAt, onlineWindowMinutes, influxAvailable, boards{total,active,inactive,online,offline}, waterStatus{safe,acceptable,unsafe,unknown} }`; `boards-locations` = `{ influxAvailable, count, data[{boardId,locationName,latitude,longitude,wqStatus,isOnline,lastSeen}] }`; `latest/:boardID` = `{ influxAvailable, board, reading }`. Decided alongside: the counts cover `is_active = true` only (a deactivated board neither counts nor plots); `waterStatus.unknown` absorbs never-reported and unrecognised tags, so the buckets always sum to `boards.active`; when InfluxDB is unreadable **every Influx-derived number is `null`, never `0`** (which would read as a confident all-clear) while the MySQL-only facts still answer `200`; `latest` is answered by one query, so its timestamp, tags and values always come from the same point; and the three reads require a JWT while the Node-RED ingest stays open (A22/T-218). | `backend/src/controllers/dashboardController.ts`, `backend/src/types/dashboard.ts`, `backend/src/services/boardStatus.ts`, `backend/src/controllers/boardController.ts`, §6.3 | Implemented and verified live (51 checks incl. a cross-check of `/summary` against `/api/boards`, plus a second instance with InfluxDB unreachable proving `null` counts and `isOnline: null`). The shared status lookup was extracted to `services/boardStatus.ts`, and the boards registry's 29 CRUD + 9 status checks were re-run unchanged. |
