# Water UI - System Modules Documentation

This document outlines the complete list of functional modules for the **Water UI** IoT dashboard. 

---

## 1. Users Module

**Purpose:** Handles authentication and profile management for the dashboard. 
*Note: This system uses a single user profile model. Role-Based Access Control (RBAC) is not implemented.*

**Core Constraint:** This system uses a **single user profile model**. There is **no Role-Based Access Control (RBAC)**. The system does not differentiate between Admins, Managers, or Standard Users. All authenticated users have full access to all features.

### 1.1 Key Features:
#### 1.1.1 Authentication
- **Single Profile Management:** The user can view and update their personal information (name, email, phone number).
- **Profile Picture Upload:** Users can upload a profile picture. The image is stored in MinIO (or AWS S3), and the file path/URL is saved in MySQL via Prisma.
- **Password Management:** Secure password hashing using `bcrypt` and password reset functionality.

### 1.1.2 Profile Management
- **View Profile:** Users must be able to view their current profile information (First Name, Last Name, Email, Phone, Profile Picture).
- **Update Profile:** Users must be able to update their first name, last name, email and phone number.
- **Profile Picture Upload:** Users must be able to upload a profile picture. The image file is stored in MinIO (or AWS S3), and the resulting URL is saved in the MySQL database.
- **Password Management:** Users must be able to change their password by providing their current password and a new password.

### Tech Integration:
- **Frontend:** React + Redux Toolkit (RTK Query) + Tailwind CSS.
- **Backend:** Express.js + JWT + bcrypt.
- **Database:** MySQL (via Prisma) for user metadata; MinIO for image storage.

### Example API Endpoints — ✅ **IMPLEMENTED** (A20: two routers, since the paths span two prefixes)
- `POST /api/auth/register` → `201 { token, user }` — bootstraps the single profile; `409` once one exists, `403` when `ALLOW_REGISTRATION=false`
- `POST /api/auth/login` → `200 { token, user }`
- `GET /api/auth/me` → `200 { user }` (token required)
- `GET /api/users/profile` → `200 { user }` (token required)
- `PUT /api/users/profile` → `200 { user }` — at least one of firstName/lastName/email/phone; `409` on a duplicate
- `PUT /api/users/password` → `200 { message }` — body `{ currentPassword, newPassword }`; `401` when the current password is wrong, `400` when the new one is under 8 characters or equals the current one
- `POST /api/users/upload-avatar` → `200 { profilePictureUrl, user }` — multipart field `avatar`, PNG/JPEG/WebP, max 2 MB

> ℹ️ **Password change (A21 / T-204) — implemented.** The profile modal carries a "Change password" section with current / new / verify. The current password is required even though the request is authenticated, so a leaked token cannot lock the owner out. An emailed *forgot password* reset stays out of scope: the stack has no mail transport. Note that issued JWTs are not invalidated by a change.

---

## 2. Boards Module

**Purpose:** Manages the physical IoT devices (sensors) deployed in the field. It acts as the registry for all hardware sending data to the system.

### Key Features:
- **Board List Table:** Displays all registered boards in a structured, paginated data table.
- **Add Board Button:** An "Add Board" button is prominently placed at the top of the list table, allowing users to register a new device by entering its `boardId` (sent as `boardID` on the MQTT wire — see the §4.1 mapping table and A4), `boardMacAddress`, location name, `latitude`, and `longitude`.
- **Action Icons (Per Row):** Each board row includes a set of action icons for full management:
  - 👁️ **View:** Opens a detailed view showing the board's complete metadata and current status.
  - ✏️ **Edit:** Opens a form to update the board's details (e.g., rename location, adjust coordinates).
  - 🔄 **Activate / Deactivate:** A toggle icon to enable or disable the board.
  - 🗑️ **Delete:** Permanently removes the board from the system (requires confirmation).
- **MAC Address Tracking:** Each board is assigned a unique `board_mac_address` for hardware identification and network tracking.
- **Location Mapping:** Assign geographical coordinates (`latitude` and `longitude`) and descriptive locations to each board.
- **Device Status Monitoring:** ✅ **IMPLEMENTED** (T-208) - each board carries `wifiStatus`, `battLevel`, `lastSeen` and the derived `isOnline`. They are **not** MySQL columns: the API reads the newest InfluxDB point per `board_id` (15-minute Online window, A5). `null` means unknown (InfluxDB unreadable), not offline.

### Tech Integration:
- **Frontend:** React + Redux Toolkit (RTK Query) + TanStack Table (React Table) + Lucide React/Heroicons + Shadcn/ui.
- **Backend:** Express.js.
- **Database:** MySQL (via Prisma) stores `board_id`, `board_mac_address`, `location_name`, `latitude`, `longitude`, `is_active`. There is **no** user↔board junction (Rule 1: single user, no RBAC) and no `last_seen` column — the status fields come from InfluxDB.

### Example API Endpoints — ✅ **IMPLEMENTED** (`backend/src/controllers/boardController.ts`)
- `GET /api/boards?page=&limit=` → `200 { data, total, page, limit }` — `limit` 1-100 (default 20), newest first
- `POST /api/boards` → `201 { board }`
- `GET /api/boards/:boardID` → `200 { board }`
- `PUT /api/boards/:boardID` → `200 { board }` — partial: `locationName`, `latitude`, `longitude`, `boardMacAddress`
- `PATCH /api/boards/:boardID/status` → `200 { board }` — body `{ isActive }`; sets the flag, it does not flip it
- `DELETE /api/boards/:boardID` → `204` with no body

All six require a JWT, `boardId` is immutable after create, coordinates are returned as JSON numbers, and every response also carries the device-status fields `lastSeen`, `isOnline`, `wifiStatus`, `battLevel` (from InfluxDB). The mirror of `MASTER_CONTEXT.md` §6.2 is authoritative for behaviour.

✅ **A4/T-502 resolved:** the identifier mapping in §4.1 of `MASTER_CONTEXT.md` is canonical — MQTT wire `boardID`, MySQL column `board_id` (Prisma field `boardId`), InfluxDB tag `board_id`, REST path param `:boardID`, JSON body/response `boardId`.

---

## 3. Dashboard Module

**Purpose:** Provides a real-time, high-level overview of the water quality monitoring system. This is the primary screen users see when they log in.

### Key Features:
- **Board Status Summary:** Displays a high-level count of the system's health, considering **only active boards**:
  - 🟢 **Online:** Boards that have transmitted data within the last **15 minutes** (A5: `BOARD_ONLINE_WINDOW_MINUTES`, from the newest InfluxDB point).
  - 🔴 **Offline:** Active boards whose newest stored point is older than the **15-minute** window (A5), including boards that have never reported.
- **Water Status Summary:** Displays the current water quality breakdown across all active boards:
  - ✅ **Safe:** Count of boards with `wq_status == "Safe"`.
  - ⚠️ **Acceptable:** Count of boards with `wq_status == "Acceptable"`.
  - ❌ **Not Safe:** Count of boards with `wq_status == "Unsafe"`.
- **Interactive Map View:** Displays a map with markers representing the geographical location of each board (using `latitude` and `longitude`). Map markers are color-coded based on the board's current water status (Green, Yellow, Red).
- **Click-to-View Real-Time Data:** When a user clicks on a board's location marker, a side panel opens showing the **real-time sensor readings** for that specific board:
  - `pH Level`
  - `Turbidity (NTU)`
  - `Battery Voltage`
  - `RSSI (Wi-Fi Signal)`
  - `wq_status`, `batt_level`, `wifi_status`
- **Live Chart Updates:** The Dashboard listens to Socket.io events. When Node-RED writes new data to InfluxDB and triggers an Express API call, Express pushes the data to the React frontend, updating the summary counts, map markers, and charts instantly without a page refresh.

### Tech Integration:
- **Frontend:** React + Redux Toolkit (RTK Query + Socket.io Client) + Tailwind CSS + Chart.js + **React Leaflet** (Rule 4 - `react-leaflet` only, no Google Maps or Mapbox).
- **Backend:** Express.js + Socket.io Server. Express runs aggregate queries against InfluxDB and MySQL on load to calculate the summary counts.
- **Database:** MySQL (for active boards and coordinates) + InfluxDB (for latest sensor data points).

### Example API Endpoints — ✅ **IMPLEMENTED** (`backend/src/controllers/dashboardController.ts`, T-209 … T-211)
The three reads require a JWT; `POST /api/internal/sensor-update` is the documented exception (Node-RED's target, still unauthenticated — A22 / T-218).

- `GET /api/dashboard/summary` → `200 { generatedAt, onlineWindowMinutes, influxAvailable, boards{total,active,inactive,online,offline}, waterStatus{safe,acceptable,unsafe,unknown} }` — counts cover **active boards only** (T-209, A5 15-minute window)
- `GET /api/dashboard/boards-locations` → `200 { influxAvailable, count, data[{ boardId, locationName, latitude, longitude, wqStatus, isOnline, lastSeen }] }` — one marker per active board, coordinates as JSON **numbers** (T-210, T-227 / A28)
- `GET /api/dashboard/latest/:boardID` → `200 { influxAvailable, board, reading }` — the registry row plus its newest stored reading, both derived from the same point (T-211)
- `POST /api/internal/sensor-update` → `202 { accepted, delivered, reading }` — Node-RED → Express → Socket.io `sensor-update` (A16)

Two invariants worth knowing when building the UI: `online + offline === boards.active` and `safe + acceptable + unsafe + unknown === boards.active`, always. And when `influxAvailable` is `false`, every InfluxDB-derived number is `null` — **never `0`** — so the UI must render an em-dash, not a confident all-clear (A28). A board that never reported has `wqStatus: null` and `isOnline: false`; a board whose status is unknown because the read failed has `isOnline: null`.

---

## 4. Historical Data Module

**Purpose:** Allows users to analyze past water quality trends, identify patterns, and generate reports based on time-series data.

### Key Features:
- **Interactive Charts:** Line charts (using Chart.js) displaying historical trends for `pH`, `Turbidity`, `batt_voltage`, and `rssi`.
- **Historical Data List (Table):** A paginated table below the chart showing the raw or aggregated data. Columns include: `Time`, `Board ID`, `pH`, `Turbidity`, `wq_status`, `Batt Voltage`, `Batt Level`, `RSSI`, `Wi-Fi Status`.
- **Pagination & Row Selection:** Users can select how many rows to view per page using a dropdown selector: **20, 50, or 100**.
- **Export to Excel:** An **"Export to Excel"** button is positioned at the top of the list table. It exports the currently filtered/displayed data to an `.xlsx` file.
- **Time-Range Selection:** Users can filter data by predefined ranges (1 Hour, 24 Hours, 1 Day, 1 Week, 1 Month) or select a custom date range.
- **Multi-Board Comparison:** Option to overlay data from multiple boards on the same chart for comparison.

### Tech Integration:
- **Frontend:** React + Redux Toolkit (RTK Query) + Chart.js + Day.js + Tailwind CSS.
- **Backend:** Express.js + `@influxdata/influxdb-client`.
- **Excel Generation (Backend):** **`exceljs`** in Express (Rule 3 — the "or `xlsx` (SheetJS)" alternative is void), in `services/excelService.ts` (**DONE**, T-215), streamed with the workbook writer.
- **Database:** InfluxDB (using Flux queries with `aggregateWindow()` to downsample data efficiently); the read side lives in `services/influxService.ts` (**DONE**, T-213).

### Example API Endpoints — ✅ **IMPLEMENTED** (`backend/src/controllers/historicalController.ts`)
All routes require a JWT; unknown board ids are `404`, and ids are resolved through the MySQL registry so the InfluxDB tag uses the stored spelling (this also covers the T-230 case-mismatch hazard).

- `GET /api/historical/:boardID?range=24h` → `200 { range, boards: [{ boardId, points: [...] }] }` (T-214)
- `GET /api/historical/:boardID?start=2023-10-01&end=2023-10-02` → the same envelope for a custom window; `end` after `start`, max 30 days (T-214)
- `GET /api/historical?boardIDs=A,B&range=24h` → the same envelope with one series per board, **aligned** to the same window timestamps (T-217, A27)
- `GET /api/historical/:boardID/readings?range=24h&page=1&limit=20` → `200 { data, total, page, limit, range }`, newest first — this is what fills §7.4's table (A27)
- `GET /api/historical/export/excel/:boardID?range=7d` → `.xlsx` stream with `Content-Disposition: attachment` (T-216)

`range` accepts `1h`, `24h`, `1d`, `7d`, `1w`, `1m` (`24h`/`1d` and `7d`/`1w` are aliases; default `24h`), and is downsampled with `aggregateWindow(fn: mean)` to ~60-170 points per board: `1h` → `1m`, `24h`/`1d` → `15m`, `7d`/`1w` → `1h`, `1m` → `6h`. A custom range picks its window from the span. Empty windows are returned as `null` (never `0`), which is what keeps an overlay aligned. `total` counts readings as `pH` records, and the export is capped at 50,000 rows (400 with the limit in the message beyond that).

> ⚠️ **Flux trap:** InfluxDB's `range()` takes `start` + **`stop`**, not `end`. The API's query parameter stays `end`; the rename happens in `services/influxService.ts`. See A27 in `MASTER_CONTEXT.md` Appendix A for the two endpoints that were added beyond the original §6.4 list, and why.

### Excel Export Flow:
1. User clicks "Export to Excel" at the top of the historical data table.
2. React (RTK Query) sends a `GET` request to `/api/historical/export/excel/:boardID` with the selected date range and any active table filters.
3. Express queries InfluxDB for the relevant rows in chunks, oldest first.
4. Express streams an `exceljs` workbook: §7.4's columns, a bold frozen header row with an auto-filter, `Time` as a real (UTC) date cell, numbers to 2 decimals, and the resolved window appended below the data.
5. Express sets the HTTP response headers (`Content-Type` + `Content-Disposition: attachment; filename="water-quality-<boardID>-<range>-<UTC stamp>.xlsx"`) and streams the file back to the browser.
6. The browser automatically triggers a download for the user.