# Water UI - IoT Dashboard Technology Stack

This document mirrors **sections 1 and 2 of `MASTER_CONTEXT.md`** (the source of truth):
the project overview, the architecture flow and the technology stack.

## 1. Executive Summary

**Water UI** is an IoT dashboard that monitors real-time water quality (pH, turbidity)
for rainwater harvesting storage in rural communities. It provides real-time sensor
tracking, interactive mapping, historical analysis and instant Telegram alerts when
water is unsafe.

The architecture separates data ingestion (the IoT pipeline) from the user-facing API,
so sensor traffic never depends on the dashboard being up.

---

## 2. Technology Stack

The stack is a **strict requirement**, not a suggestion - the entries marked *fixed* are
decided and must not be swapped (the reasons are recorded in Appendix A of
`MASTER_CONTEXT.md`).

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| **Frontend** | React.js, Tailwind CSS | Shadcn/ui or Headless UI for components. |
| **State management** | Redux Toolkit (RTK) | **RTK Query** for all API calls and caching. |
| **Charts** | Chart.js | Dual Y-axes for pH and Turbidity. |
| **Map** | **`react-leaflet`** *(fixed)* | Rule 4: no Google Maps, no Mapbox. Colour-coded markers. |
| **Real-time** | Socket.io (client + server) | Live dashboard updates; **no polling** (Rule 5). |
| **Backend** | Express.js + **TypeScript** *(fixed)* | REST API + Socket.io server. TypeScript is required by Prisma 7 (A15). |
| **Auth** | JWT + bcrypt | Single user profile. **No RBAC** (Rule 1). |
| **MySQL ORM** | Prisma **7** *(fixed)* | `prisma-client` generator (TypeScript/ESM), a MariaDB driver adapter and `prisma.config.ts` - A15. |
| **Frontend build** | **Vite** + Tailwind **v4** *(fixed)* | CRA is unmaintained; Tailwind v4 is CSS-first (A19). |
| **Databases** | MySQL & InfluxDB | MySQL for relational metadata, InfluxDB for time-series. |
| **File storage** | MinIO (S3-compatible) | Profile pictures; the URL is stored in MySQL. |
| **Excel export** | **`exceljs`** *(fixed)* | Rule 3: generated on the **backend**, streamed to the browser. |
| **IoT pipeline** | Node-RED, Mosquitto | Edge processing and MQTT broker. |
| **DevOps** | Docker, Docker Compose | Orchestrates all 8 services (§9.2). |

### Supporting libraries (non-negotiable where a Rule depends on them)

- **Date handling:** Day.js or date-fns - **required** for the Chart.js X-axis (Rule 7).
- **Backend validation:** Zod (implemented in `middleware/validate.ts`).
- **Backend security:** Helmet, CORS, express-rate-limit.
- **InfluxDB client (backend):** `@influxdata/influxdb-client`.
- **Tables (UI):** TanStack Table (React Table) + Lucide React/Heroicons.
- **Reverse proxy:** Nginx (SSL termination, serving the React build, routing `/api`).

---

## 3. System Architecture Flow

1. **IoT edge device** publishes a JSON payload to the **MQTT broker (Mosquitto)**.
2. **Node-RED** subscribes, parses the payload, derives `wq_status` / `batt_level` /
   `wifi_status`, writes the point to **InfluxDB** and triggers **Telegram alerts**.
3. **Node-RED** HTTP-POSTs the reading to the **Express API**
   (`POST /api/internal/sensor-update`).
4. **Express** pushes it to the **React frontend** over **Socket.io**.
5. **React** updates Redux, which re-renders the **Chart.js** dashboard and the
   **React Leaflet** map.
6. **Express** answers reads from **InfluxDB** (history, latest points) and **MySQL via
   Prisma** (auth, profile, board registry).

---

## 4. IoT Data Pipeline

The step-by-step pipeline (MQTT nodes, the derivation function, the InfluxDB write, the
Telegram branch and how to test it) is documented **once**, in
[`node-red.md`](node-red.md), with the frozen topic/payload contract in
[`mqtt-topics.md`](mqtt-topics.md) and the authoritative thresholds in
`MASTER_CONTEXT.md` §5. Earlier revisions of this file carried a partial copy of that
pipeline; it was removed so the two cannot drift apart.

Quick reference for the wire format:

```json
{
  "boardID": "AA240238",
  "pH": 12.75,
  "turbidity": 25.00,
  "batt_voltage": 3.4,
  "rssi": -75
}
```
