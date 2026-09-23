# Water UI - Frontend UI Requirements

This document outlines the complete UI/UX requirements for the **Water UI** IoT dashboard. The application is built using **React.js**, styled with **Tailwind CSS**, and utilizes **Redux Toolkit (RTK Query)** for state management. 

---

## 1. Global Layout & Navigation

The application uses a classic dashboard layout consisting of a fixed left sidebar, a top navigation header, and a scrollable main content area.

### 1.1 Sidebar (Navigation)
- **Logo Area:** Water drop icon + "Water UI" text (Bold, dark text).
- **Navigation Menu:**
  - **Active State:** `bg-purple-50`, `text-purple-700`, left border accent (`border-l-4 border-purple-600`).
  - **Inactive State:** `text-gray-500`, `hover:bg-gray-100`.
  - **Items — ✅ IMPLEMENTED (T-308), A10 closed:** 
    - `Dashboard` (Dashboard icon) → `/`
    - `Boards` (Radio icon) → `/boards`
    - `Historical Data` (Line-chart icon) → `/historical`

> ✅ **A10 resolved with the user:** the mockup's three labels (`Dashboards` / `System Analytics` / `System Health`) described no real page, so the sidebar lists concrete destinations instead. **Profile is not a sidebar item** — it is reached from the avatar menu in the top header (§1.2). A **`Simulator`** item (Beaker icon) was added at the end on request, for the Simulator Control Module (`docs/simulator-module.md` 2, T-335). The pages behind `Boards` / `Historical Data` / `Profile` are marked placeholders until T-318..T-324.

### 1.2 Top Header
- **Application title — ✅ IMPLEMENTED (T-309), replacing the mockup's search field:** "Real-Time Water Quality Monitoring System" (`text-sm font-bold text-gray-800`, `sm:text-base`) over "Dashboard for Rainwater Harvesting Storage in Rural Communities." (`text-xs text-gray-500`), both truncated. **The search box is gone** (T-232 closed: no behaviour was specified, no search endpoint exists). The header carries the app's only `h1`, so pages must not repeat the title.
- **User Profile — ✅ IMPLEMENTED (T-309/T-324):** circular avatar (`rounded-full`, `w-10 h-10`; falls back to the user's initials), the signed-in name and a dropdown menu with **Profile** and **Sign out**. **Profile opens a modal** (§5) rather than a page - the URL does not change, and Escape, the backdrop or Close dismisses it. The picture comes from `profilePictureUrl` on the user payload.

### 1.3 Login Page & Protected Routing — ✅ IMPLEMENTED (T-325 / T-326)

The mockup (`docs/Water UI.png`) shows only the signed-in dashboard, so this page is
not mockup-derived: it reuses the palette in §1.1 (white rounded card on the light-gray
canvas, `brand-600` purple accent, water-drop icon + "Water UI" wordmark).

| Route | Page | Access |
| :--- | :--- | :--- |
| `/login` | Login | Public. Email + password, show/hide toggle, dev-only hint showing the seeded account. Errors are mapped per failure: `401` -> `Incorrect email or password.`; **`502`/`504`/`FETCH_ERROR`** (API down; the Vite dev proxy answers 502 `text/plain`) -> "The API is not answering…" **with the one-line fix**, never "wrong password"; `429` -> the rate-limit message; other `5xx` -> the API's message or the status code. |
| `/` | Dashboard (§2) | **Guarded** — the landing page after authentication. |
| `/boards` | Boards (§3) | **Guarded** — the board registry (T-318..T-320, verified 40/40). |
| `/historical` | Historical Data (§4) | **Guarded** — implemented (T-321..T-323). |
| `/profile` | **no route** | Profile is a **modal** (§5, T-324) opened from the header avatar menu; opening it never leaves the current page. |
| `*` | — | Redirects to `/` (and then to `/login` when signed out). |

- **After a successful sign-in the app goes to `/` (the Dashboard)** — the page the
  mockup depicts. The form posts through RTK Query to `POST /api/auth/login`, which
  answers `200 { token, user }`; the session goes into the Redux store and the guard
  renders the dashboard.
- **Protected routing:** an unauthenticated visit to a guarded path redirects to
  `/login`, remembering the intended path so the sign-in returns the user there.
- **Session persistence (T-303):** the session is stored in `localStorage` and
  re-validated on boot with `GET /api/auth/me`; a reload therefore keeps the user on the
  dashboard, and a rejected token clears the session and returns to `/login`.
- **Sign out** clears the session and returns to `/login`.

> ⚠️ **There is no user-list page.** The system has one profile (Rule 1 of
> `MASTER_CONTEXT.md`), there is no `GET /api/users` endpoint, and the post-login
> destination is the Dashboard. A users table would be an RBAC-style change requiring a
> new appendix decision.

> ℹ️ The chrome is implemented: §1.1 sidebar (T-308) and §1.2 header (T-309), and the guarded
> routes render inside it. §2's dashboard widgets are **done** (T-313–T-317 and T-329, verified
> 34/34 in a real browser plus 13/13 on a degraded instance), §3's board registry is done
> (T-318–T-320, 40/40), and §4's Historical page is what remains (T-321–T-323). The mockup's
> search box was replaced by the application title (T-232 closed).

---

## 2. Dashboard Module (Home Page) — ✅ IMPLEMENTED (T-312 page, T-329 counts, T-331 lean-down, T-336 station cards)

The primary screen providing a real-time, high-level overview of the water quality monitoring system.
Implemented in `pages/Dashboard.jsx` + `components/dashboard/`; verified in a real browser at **36/36**, and against a second API instance whose InfluxDB is unreachable at **11/11** (every InfluxDB-derived number renders "—", never `0`) (T-331 in `task-tracker.md`); the T-336 station cards were verified at **23/23** against the running API.

**Layout as built** (the arrangement the user requested, and the reason this section no longer matches the mockup):

| # | Block | Owner |
| :--- | :--- | :--- |
| 1 | **Board Status** - exactly two cards: **Boards Online** / **Boards Offline** | T-329, `BoardStatusCards.jsx` |
| 2 | **Water Quality by Board** - count per status: **Safe / Acceptable / Not Safe** | T-329, `WaterStatusCards.jsx` |
| 3 | **Station Condition** - one station's Water Quality Status, pH, Turbidity, WiFi and battery, plus the station picker | T-336, `StationReadingsCards.jsx` |
| 4 | **Board Locations** - the map, the main element of the page | T-315 / T-316 |

All counts read `GET /api/dashboard/summary`, which counts **`is_active = true` only** — a **deactivated board appears in no count, on no marker and in no picker option** (A28), and each card's footnote states the scope ("4 active boards counted · 1 deactivated excluded"). With `influxAvailable: false` every InfluxDB-derived number renders **"—", never `0`**.

> 🔁 **§2.2's reading cards are BACK, as block 3 (T-336).** T-331 removed the whole "Latest Reading" panel — the pH card, the Turbidity card *and* the Overall Water Status bar — and this section used to carry a "do not restore without deciding the placement" note. **The user has now decided the placement** (directly below *Water Quality by Board*), which was the condition that note set, so §2.2 is rendered again in an **expanded** form: the three node-condition cards (Water Quality Status, WiFi Connection, Battery Status) and a station picker are new, and the selection no longer depends on clicking a map marker. §2.5's chart **stays removed** (it belongs to §4's Historical page, T-321) and §2.3's bar **stays removed** (its wording now appears on the Water Quality Status card). See §2.2 and §2.3 below for what each looks like now.

### 2.1 Title Section
- **Main Heading / Subheading:** rendered **once by the global header** (§1.2, T-309) - the page must not repeat them, so the dashboard renders **no `h1`** (its own blocks are `h2`).
- **System Status:** "System Status: " + `<span className="text-green-500 font-semibold">Online</span>` — the **Socket.io connection to the API**, not a board's connectivity.
- **Board ID Badge:** A pill-shaped badge showing the selected board identifier. Styling: `bg-purple-100`, `text-purple-700`, `text-xs`, `px-3`, `py-1`, `rounded-full`. Falls back to "No board reporting yet".
- **Selection:** the station cards describe one station — by default **the first board registered** (the oldest `createdAt` among the active boards, not the registry's newest-first list order), changed either with the **station picker** in the Station Condition header or by clicking a map marker (T-336). The two are the *same* selection, so the cards, the picker, the marker highlight and the board-ID badge can never disagree. The default falls back to "the active board that reported most recently" while the registry is still loading, and to the picker's first option if the chosen board disappears.

### 2.2 KPI Cards — ✅ RENDERED AS "STATION CONDITION" (restored and expanded by T-336; was removed by T-331)
The **Station Condition** row (`components/dashboard/StationReadingsCards.jsx`), directly below *Water Quality by Board*, shows **five** cards for the selected station over a Tailwind grid (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`), all drawn by the shared `KpiCard.jsx` (`bg-white`, `rounded-lg`, `shadow-sm`, `p-4`; label `text-sm text-gray-500`, value `text-3xl font-bold text-gray-800`).

| Card | Icon (tile) | Value | Second line |
| :--- | :--- | :--- | :--- |
| **Water Quality Status** | shield — green / yellow / red / grey by status | `Safe` / `Acceptable` / **`Not Safe`** | the advisory: "Safe to drink" / "Treat before drinking" / "Do not drink" |
| **pH Level** | water drop (light blue) | `7.80` (`formatMeasurement`, 2 dp) | — |
| **Turbidity** | layers (light yellow) | `0.60 NTU` | — |
| **WiFi Connection** | `Wifi` / `WifiOff` by status | `Excellent` / `Good` / `Fair` / `Poor` | `Signal -95 dBm` (the `rssi` the tag came from) |
| **Battery Status** | battery icon by level | `Full` / `Medium` / `Low` / `Critical` | `3.61 V` (the `batt_voltage`) |

- The **Water Quality Status** card carries the stored `wq_status` through **Rule 2** (`Unsafe` → "Not Safe"), and its advisory line is the wording §2.3 always wanted ("Not Safe (Do Not Drink)"), derived from the **stored status only** — never from a second copy of §5.3's thresholds, which stay in Node-RED (§5.7).
- pH and Turbidity show **values only**. They deliberately do **not** repeat the status text: with a dedicated Water Quality Status card beside them, printing "Not Safe" on three of five tiles reads as a rendering bug. (T-331's version had no status card, which is why it put the status on both.)
- WiFi and Battery each show the **supporting measurement** under the tag, because the tags are coarse — "Fair" and "Poor" are one `rssi` step apart, and `batt_level` alone hides whether a "Low" is 3.3 V or 3.0 V.
- A missing value renders **"—"** (never `0.00`, `Poor` or `Critical`): every one of these fields is InfluxDB-derived, so `influxAvailable: false` means *unknown*, not *zero* (A28). A station that never reported says so in words beneath the cards rather than leaving five dashes unexplained.
- The footer names the station and when its reading arrived (Day.js, Rule 7), and marks a reading that arrived over Socket.io as "live from the sensor" — so the difference between a pushed reading and a fetched one is visible rather than assumed.
- **Sources:** the 5 values come from `GET /api/dashboard/latest/:boardID` (`reading.pH`, `.turbidity`, `.wqStatus`, `.wifiStatus`, `.rssi`, `.battLevel`, `.battVoltage`), and the `sensor-update` Socket.io event overlays them the instant it lands — no request, no polling (Rule 5).

> *T-331 history:* the two-card "Latest Reading" version (`pH Level` + `Turbidity`, each carrying the stored status through Rule 2, with a footer of battery voltage and RSSI) and its `turbidityPresentation()` helper were deleted with the panel. T-336 replaced them with the five cards above — the status text moved to the dedicated card, and the battery/RSSI footer became its own two cards.

### 2.3 Overall Water Status — ⛔ STILL NOT RENDERED (the bar stays removed; its wording moved onto the Water Quality Status card, T-336)
- **Heading:** "Overall Water Status" (`text-lg`, `font-semibold`).
- **Status Text:** e.g., "Not Safe (Do Not Drink)" (`text-red-500`, `font-semibold`) — the **worst** status across the active boards, with the scope spelled out beneath it.
- **Progress Bar:** Horizontal bar (`w-full`, `h-4`, `bg-gray-200`, `rounded-full`). The fill color dynamically changes based on `wq_status` (Green for Safe, Yellow for Acceptable, Red for Not Safe).
- *Deliberate deviation (T-314):* the bar is a **stacked share** of the three statuses (plus grey "No data" when `waterStatus.unknown` is non-zero) using the same colours, so "1 of 4 boards is not safe" is visible. With `influxAvailable: false` it stays grey and the sentence reads "No data".
- *Status (T-336):* **the bar is still not on the dashboard, and the user has not asked for it back.** What T-336 did take from it is the **wording** — "Not Safe (Do Not Drink)" now appears as the Water Quality Status card's advisory line (§2.2), scoped to the selected station rather than the whole fleet. The fleet-wide question ("how many boards are Not Safe?") remains answered by the *Water Quality by Board* counts above. **The chart's and the bar's own placements are still undecided**, so the "do not restore without deciding the placement" rule still applies to them.

### 2.4 Interactive Map Component
- **Function:** Geographical overview of all active IoT boards. Clicking a location displays real-time sensor readings.
- **Technology:** **`react-leaflet`** (Rule 4 — fixed choice; the "Mapbox GL JS or Google Maps API" alternatives are void). OpenStreetMap tiles (no API key). The A18 default-marker icon fix is **done** (T-316, `components/dashboard/mapIcons.js`).
- **Placement:** Full width of the main content area, **`h-[70vh] min-h-[420px]` (`md:min-h-[560px]`)** since T-331 — it is the main element of the page now, not a widget (`h-96`/`500px` was the original value).
- **Centre (T-337):** the **first registered station** (the oldest active board's `createdAt`), at zoom 9 — the same board the Station Condition cards default to (§2.1), so the map opens on the station the rest of the page describes and its pin sits dead-centre. Until T-337 this was a fixed **Pagoh, Johor (2.1667, 102.7667)**; Pagoh is now only the pre-data fallback used before `GET /api/boards` resolves, and the fallback when no active board is registered. The controls are **`First station`** (reset; disabled with no active board) / `Malaysia` / `All boards` — the registry can hold boards anywhere, so a view centred on one station legitimately shows another off-screen.
- **Zoom:** deliberately regional rather than street level — a single pin on an empty map reads as boards missing, not as zoomed in. Note the seeded boards sit ~500 m apart and therefore overlap at zoom 9; `All boards` separates them.
- **Markers:** Each active board is a marker at its `latitude` and `longitude`. Markers are color-coded: 🟢 Safe, 🟡 Acceptable, 🔴 Not Safe, and **grey when `wqStatus` is `null`** (never reported, or InfluxDB unreadable).
- **Click Interaction:** Clicking a marker selects the board and opens a Popup showing:
  - `Location Name` and `Board ID`
  - Real-time `pH Level` and `Turbidity`
  - `Last Seen` timestamp — the newest InfluxDB point per board; a board counts as Online inside the 15-minute window (A5, `BOARD_ONLINE_WINDOW_MINUTES`).
  - The status pill and a **"Historical Data"** button that goes to `/historical` (T-332; it used to say "View Details" and open `/boards`).
- **Data Integration:** `GET /api/dashboard/boards-locations` fetches coordinates from MySQL. Socket.io updates the Redux store, instantly changing marker colors when new data arrives. A §8 legend and an "N active boards mapped" counter keep a blank map explained.

> ✅ **Backend ready (T-209 … T-211 / A28):** markers come from `GET /api/dashboard/boards-locations` as `{ influxAvailable, count, data[] }` with **numeric** `latitude`/`longitude` plus `wqStatus` (colour), `isOnline` and `lastSeen`. The **Station Condition** cards (§2.2, T-336) use `GET /api/dashboard/latest/:boardID` (the `reading` object) — the same endpoint the popup above reads — and the headline counts come from `GET /api/dashboard/summary`. The picker's options come from `GET /api/boards?page=1&limit=100` (the registry, filtered to `isActive` client-side because that route is the only one carrying `createdAt`, which the "first board registered" default needs). When `influxAvailable` is `false`, every InfluxDB-derived number is `null` — render "—", never "0" — and a marker with `wqStatus: null` must be drawn grey rather than given a colour it has not earned.

### 2.5 Historical Sensor Data Chart — ⛔ NOT ON THE DASHBOARD (removed by T-331; belongs to §4's Historical page, T-321)
- **Header:** "Historical Sensor Data" with Time Range Filters. Built: **`1H` / `24H` / `7D` / `1M`** — the mockup's "1 Day" is not a separate button because the API aliases `1d` to `24h` (§6.4 of `MASTER_CONTEXT.md`). The subtitle echoes the server's resolved range and `aggregateWindow` size.
- **Chart:** Chart.js Line chart.
  - **Lines:** Two lines (Blue for pH, Yellow for Turbidity).
  - **X-Axis:** Time stamps formatted using Day.js.
  - **Y-Axis:** Dual Y-axes (Left for pH 0-14, Right for Turbidity) to prevent line flattening. *Deliberate deviation (T-317):* the right axis starts at zero and **scales to the data** (observed 0-7) instead of a fixed 0-1000, which would flatten a 1-25 NTU series onto the x-axis — the exact failure that sentence gives as the reason for two axes.
  - **Legend:** Bottom centered (Blue dot + "pH", Yellow dot + "Turbidity").
  - **Tooltips:** Show exact timestamp and value on hover; a `null` window reports "no reading" and stays a **gap** rather than being interpolated.

### 2.6 Live updates (§6 / Rule 5)
The page subscribes to `sensor-update` via `useSocket()`. Each event overlays the freshest reading on the **station cards** and on the marker immediately, then invalidates the `DashboardSummary` tag so the counts and markers re-query. The station cards need no request of their own: the socket copy is preferred over the REST reading, and the footer marks it "live from the sensor" (T-336). Nothing polls.

---

## 3. Boards Management Module

**Purpose:** Manages the physical IoT devices deployed in the field.

### 3.1 Board List Table
- **Add Button:** An "Add Board" button prominently placed at the top of the list table.
- **Columns:** `Board ID`, `Location Name`, `Status` (Active/Inactive), `Connection`, `Last Seen`, `Actions` — **trimmed on request.** `MAC Address`, `Latitude`, `Longitude`, `Wi-Fi` and `Battery` are no longer columns: they stay on the 👁️ detail modal, which shows the board's full metadata from `GET /api/boards` (T-208).
- **Action Icons (Per Row):**
  - 👁️ **View:** Opens a modal showing complete metadata and current status.
  - ✏️ **Edit:** Opens a form to update board details. `boardId` is **immutable** after registration (it is shared with the MQTT topic and the InfluxDB tag) — the form must not offer it.
  - 🔄 **Activate/Deactivate:** Sets `is_active` through `PATCH /api/boards/:boardID/status` with `{ isActive }`.
  - 🗑️ **Delete:** Permanently removes the board (requires confirmation modal). The board's InfluxDB points are *not* deleted.
- **Technology:** ✅ React + Redux Toolkit (RTK Query) + **TanStack Table v9** + Lucide React. No Shadcn/ui yet - the page is hand-rolled Tailwind, matching `components/ui/Modal.jsx` (T-311).
- **API:** all six board endpoints require a JWT; see `MASTER_CONTEXT.md` §6.2 for the exact status codes (A26). Failures answer `{ error }` (plus `issues` on a 400) - never `message`.
- **✅ IMPLEMENTED (T-318/T-319/T-320):** `pages/Boards.jsx` + `components/boards/` (`BoardTable`, `BoardFormModal`, `BoardViewModal`, `boardPresentation.js`, `boardBadges.jsx`) + `api/boardApi.js`. Server-side pagination (10/20/50, "1–20 of N"), sorting within the current page, a `409` shown against the offending field, and **no Refresh button**: the table is updated by the pushed `sensor-update` stream (`hooks/useBoardLiveUpdates.js`) plus a focus/reconnect revalidation, never by polling. Verified in a real browser: 40/40 CRUD + 20/20 live.

---

## 4. Historical Data Module

**Purpose:** Analyze past water quality trends and generate reports.

### 4.1 Interactive Chart
- Line chart (Chart.js) displaying historical trends for `pH`, `Turbidity`, `batt_voltage`, and `rssi`.
- Filter by predefined ranges (1 Hour, 24 Hours, 1 Day, 1 Week, 1 Month) or custom date range.
- **✅ IMPLEMENTED (T-321):** `components/historical/HistoricalChart.jsx` - Chart.js line chart with a series picker (pH / Turbidity / Battery Voltage / RSSI). Each series draws on **its own Y axis** because the units differ; only the enabled ones are shown, so the default view is the pH 0-14 + turbidity pair. A window with no reading is a **gap**, never a line through zero. The custom range asks for both dates before querying, and the resolved window ("15-minute averages") is shown so the downsampling is not a mystery.

### 4.2 Historical Data List (Table)
- **Columns:** `Time`, `Board ID`, `pH`, `Turbidity`, `wq_status`, `Batt Voltage`, `Batt Level`, `RSSI`, `Wi-Fi Status`.
- **Pagination & Row Selection:** Dropdown selector at the bottom of the table to choose rows per page: **20, 50, or 100**.
- **Export to Excel:** An **"Export to Excel"** button positioned at the top of the list table. Exports the currently filtered/displayed data to an `.xlsx` file.
- **✅ IMPLEMENTED (T-322/T-323):** `components/historical/ReadingsTable.jsx` (the nine columns, `wq_status` rendered through `utils/waterStatus.js` so `Unsafe` shows as **Not Safe** - Rule 2 - and missing values as a dash, never `0`) and `ExportButton.jsx`, which sits in the table card's header. The button saves the file with **the name the API chose** (`Content-Disposition`), and pagination is server-side (`page`/`limit`) with the documented 20 / 50 / 100 selector.

### 4.3 Excel Export Flow
1. User clicks "Export to Excel".
2. React (RTK Query) sends `GET /api/historical/export/excel/:boardID` with date range and filters.
3. Express queries InfluxDB.
4. Express uses `exceljs` to generate the `.xlsx` file.
5. Browser automatically triggers the download.

---

## 5. Users Module (Profile Only)

*Note: This system uses a single user profile model. Role-Based Access Control (RBAC) is not implemented.*

- **Profile Management — ✅ IMPLEMENTED as a MODAL (T-324):** opened from the header avatar menu
  (§1.2), never as a page. Pre-filled from `GET /api/users/profile`; saved with
  `PUT /api/users/profile`, surfacing the API's validation (400) and conflict (409) messages.
- **Profile Picture Upload — ✅ IMPLEMENTED in the same modal:** multipart `avatar` to
  `POST /api/users/upload-avatar` (PNG/JPEG/WebP, max 2 MB). Wrong type and oversize are
  refused before the request, and the header avatar updates as soon as the upload returns.
- **Password Management — ✅ IMPLEMENTED (A21 / T-204):** a "Change password" section in the profile modal (§5) with **current password, new password and verify new password**. The browser checks the same rules the API enforces (>= 8 characters, different from the current one, both new entries identical) before sending; the API verifies the current password with bcrypt and answers `401` when it is wrong. An emailed *forgot password* flow is out of scope — the stack has no mail transport.
- **No user list:** there is exactly one profile, no `GET /api/users` endpoint and no users table; signing in lands on the Dashboard (§1.3). A users table would be an RBAC-style change requiring a new appendix decision.
- **Toolchain note:** the implemented frontend is **Vite + Tailwind v4** (A19), so the entry points are `src/main.jsx` / `src/App.jsx` with the theme in `src/index.css` (`@theme`) — not the CRA `src/index.js` + `public/index.html` shape.

---

## 6. Real-Time Data Integration (Socket.io)

To fulfill the "Real-Time" requirement shown in the UI:
1. **Redux Store:** Set up a `sensorSlice` to hold the latest `pH`, `turbidity`, and `wq_status`.
2. **Socket.io Client:** Listen for the `sensor-update` event from the Express backend.
3. **UI Update:** When new data arrives, Redux updates the state. The KPI cards, Overall Water Status bar, and Map markers re-render instantly.
4. **Chart Update:** For the historical chart, append the new data point (if within the selected time range) or refetch InfluxDB data using RTK Query.

---

## 7. Responsive Design (Tailwind Breakpoints)

- **Mobile (`sm`):** Sidebar collapses into a hamburger menu. KPI cards stack vertically (`grid-cols-1`). Map height reduced (`h-64`). Tables become horizontally scrollable.
- **Tablet (`md`):** Sidebar visible. KPI cards side-by-side (`grid-cols-2`). Map takes full width.
- **Desktop (`lg`):** Full layout as shown in the mockup. Map height `h-96` or `500px`.

---

## 8. Status Vocabulary & Colour Mapping (cross-cutting)

The stored `wq_status` value and the label the UI shows are **not** the same string
(Rule 2) — the database keeps `Unsafe`, the interface says "Not Safe".

| `wq_status` (DB value) | UI label (Rule 2) | Colour | Marker | Progress bar |
| :--- | :--- | :--- | :--- | :--- |
| `Safe` | Safe | Green | 🟢 | Green |
| `Acceptable` | Acceptable | Yellow | 🟡 | Yellow |
| `Unsafe` | **Not Safe** | Red | 🔴 | Red |

`batt_level` (`Full` / `Medium` / `Low` / `Critical`) and `wifi_status`
(`Excellent` / `Good` / `Fair` / `Poor`) are shown verbatim; both come from the
newest InfluxDB point per board (T-208).