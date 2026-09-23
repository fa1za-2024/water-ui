# Water UI

IoT dashboard for monitoring **real-time water quality (pH, turbidity)** in rainwater
harvesting storage for rural communities. Live sensor tracking, an interactive map,
historical analysis, and instant Telegram alerts when water is unsafe.

> **Source of truth:** [`docs/MASTER_CONTEXT.md`](docs/MASTER_CONTEXT.md). Read it before
> changing anything — it defines the architecture, the naming conventions and the
> hard rules (no RBAC, `react-leaflet` only, `exceljs` on the backend, no polling,
> `parseFloat()`/`parseInt()` before every InfluxDB write).

---

## Architecture

```
IoT edge (XIAO ESP32C3)
   │  MQTT  sensors/<boardId>/data
   ▼
Mosquitto ──► Node-RED ──┬──► InfluxDB            (time-series telemetry)
                         ├──► Telegram            (only when wq_status = Unsafe)
                         └──► POST /api/internal/sensor-update
                                     │
                                     ▼
                              Express API ──► Socket.io ──► Redux ──► React UI
                                     │
                                     └──► MySQL (Prisma) for users & boards
```

Full detail: [`docs/technology.md`](docs/technology.md) and
[`docs/mqtt-topics.md`](docs/mqtt-topics.md).

---

## Quick start

### 1. Infrastructure (MQTT broker, Node-RED, InfluxDB, MySQL, MinIO)

```bash
docker compose up -d
```

Every variable has a working default, so no `.env` is required to start. To override
anything: `cp .env.example .env`.

| Service | URL | Notes |
| :--- | :--- | :--- |
| Node-RED | http://localhost:1880 | the IoT pipeline editor |
| InfluxDB | http://localhost:8086 | bucket `water_quality_bucket` |
| MinIO console | http://localhost:9001 | bucket `profile-pictures` |
| MinIO API | http://localhost:9000 | S3 endpoint for the backend |
| MQTT | `localhost:1883` | the ESP32C3 connects here |
| MySQL | `localhost:3306` | database `water_ui` |

### 2. Prove the pipeline works (no hardware needed)

```bash
# Publish a reading as if you were the device
docker compose exec mosquitto mosquitto_pub -t sensors/AA240238/data \
  -m '{"boardID":"AA240238","pH":7.1,"turbidity":1.5,"batt_voltage":3.8,"rssi":-58}'

# Watch it land in InfluxDB
docker compose exec influxdb influx query \
  'from(bucket:"water_quality_bucket") |> range(start:-5m)' \
  --org water_ui_org --token waterui-dev-token-change-me
```

### 3. Backend and frontend

Both are behind an **`app` profile** so the infrastructure above can run before any
application code exists.

```bash
# First run: install deps, generate the Prisma client, create the tables, seed
cd backend
cp .env.example .env
npm install
npm run prisma:generate     # Prisma 7 generates into src/generated/prisma
npm run prisma:migrate      # create the users/boards tables
npm run prisma:seed         # one user (admin@waterui.local) + one board AA240238
npm run dev                 # API + Socket.io on :5000

# In another terminal
cd frontend
cp .env.example .env
npm install
npm run dev                 # Vite dev server on :5173, proxies /api and /socket.io
```

Or run both in containers:

```bash
docker compose --profile app up -d
```

If you use the containers, apply migrations once (the image deliberately does **not**
migrate on start):

```bash
docker compose --profile app exec backend npx prisma migrate deploy
```

---

## Repository layout

| Path | What lives there |
| :--- | :--- |
| `backend/` | Express API + Socket.io. `prisma/` holds the schema and seed script. |
| `frontend/` | React dashboard (Vite, RTK Query, Tailwind v4, Chart.js, React Leaflet). |
| `iot/` | Mosquitto config, Node-RED flows, and the XIAO ESP32C3 firmware. |
| `docs/` | All project documentation — start with `MASTER_CONTEXT.md`. |

The authoritative tree is [`docs/project-structure.md`](docs/project-structure.md).

---

## Deployment

Production runs on **Railway** as seven services: MySQL and InfluxDB from
Railway's database templates, plus the backend, frontend, Node-RED, Mosquitto and
MinIO built from this repository. See
[`deploy/railway/README.md`](deploy/railway/README.md) for the service inventory,
the per-service variable matrix, volumes, networking and the deploy steps.

> The earlier Oracle Cloud (OCI) deployment has been retired — `deploy/` now
> contains only the Railway configuration.

---

## Device firmware

`iot/esp32c3/water_quality_mqtt.ino` publishes pH / turbidity / battery / RSSI as JSON
over MQTT. Before flashing, set:

- `WIFI_SSID` / `WIFI_PASSWORD`
- `MQTT_HOST` / `MQTT_PORT` — on the LAN, the **LAN IP** of this machine (e.g.
  `192.168.1.50`); `127.0.0.1` will not work. In production, the Railway
  Mosquitto service's **TCP proxy** host and port — see
  [`deploy/railway/README.md`](deploy/railway/README.md)
- `BOARD_ID` — must match `boards.board_id` in MySQL

It publishes to `sensors/<BOARD_ID>/data`, and Node-RED consumes `sensors/+/data`.

---

## Useful commands

```bash
docker compose ps                       # service status
docker compose logs -f nodered          # follow one service
docker compose down                     # stop, keep data
docker compose down -v                  # stop and WIPE all data

cd backend && npm run prisma:studio     # browse MySQL in a GUI
```

---

## Conventions and constraints

These are non-negotiable — they come from `MASTER_CONTEXT.md` section 3:

1. **No RBAC.** Single user profile only.
2. **`wq_status`:** stored as `Safe` / `Acceptable` / `Unsafe`; the UI renders `Unsafe` as **"Not Safe"**.
3. **Excel export:** generated on the backend with `exceljs`; the button sits at the **top** of the table.
4. **Maps:** `react-leaflet` only — no Google Maps, no Mapbox.
5. **Live updates:** Socket.io → Redux → components. Never poll.
6. **InfluxDB:** cast with `parseFloat()`/`parseInt()` first; strings break Chart.js.
7. **Dates:** format Chart.js timestamps with Day.js.
