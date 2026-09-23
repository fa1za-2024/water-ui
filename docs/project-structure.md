# Water UI - Project Folder Structure

This document mirrors **section 8 of `MASTER_CONTEXT.md`** (the source of truth) and
records the directory layout of the Water UI IoT dashboard.

**Legend:** `DONE` = exists and is implemented · `TO DO` = planned, not written yet

---

## 📁 Root Directory: `water-ui/`

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

---

## Reality check (what actually exists vs what is planned)

- **Complete:** `docker/`, `iot/` (including the standalone board simulator, T-334), the
  entire `backend/` REST surface (users, boards,
  dashboard **and** historical data - series, paginated readings, the `.xlsx` export and
  the Node-RED ingest route), the frontend *shell* (entry points, store, styling, socket
  hook, `Sidebar.jsx` / `Header.jsx` / `AppLayout.jsx`, `ProtectedRoute.jsx`), the
  **login + routing slice** (`Login.jsx`, `useAuth.js`, the `/login` + guarded route table)
  and the **dashboard module** in its lean form: `pages/Dashboard.jsx`, the
  `components/dashboard/` widgets, `api/dashboardApi.js` and the `utils/` vocabulary
  (T-313/T-315/T-316/T-329, leaned down by T-331).
- **Not written yet:** `types/` (the frontend-type decision, T-328) and the `ui/` primitives
  beyond `Modal.jsx` / `ConfirmDialog.jsx` (T-311). **The Historical module is built**
  (T-321..T-323: `Historical.jsx`, `components/historical/`, `api/historicalApi.js` - 28/28),
  and `types/` is still unwritten (that directory holds only `.gitkeep`, T-328).
  **The Boards registry is built and verified**
  (T-318..T-320: `Boards.jsx`, `components/boards/`, `api/boardApi.js`, 40/40 under T-330).
  The backend has no remaining stub: no route answers `501` any more.
- **Dashboard scope:** the pair of count cards (boards Online / Offline), the water-quality
  counts, the **Station Condition** row (T-336 - the selected station's Water Quality Status,
  pH, Turbidity, WiFi and battery, with a station picker) and the react-leaflet map **centred on
  the first registered station** (T-337), which owns the page (`h-[70vh]`). All counts read
  `GET /api/dashboard/summary`,
  which counts `is_active = true` only, so **deactivated boards are in no count, on no marker and
  in no picker option**; when InfluxDB cannot be read every InfluxDB-derived number renders "—"
  instead of `0` (A28).
- **Removed from the Dashboard at the user's request (T-331), and still gone:** the "Historical
  Sensor Data" chart (§2.5) and §2.3's Overall Water Status **bar**. `WaterStatusBar.jsx` and
  `SensorChart.jsx` were deleted with them; `api/historicalApi.js` went too, and is back for the
  Historical page (T-321..T-323).
- **Restored by T-336, at the user's request:** §2.2's reading cards, **expanded** into the five
  Station Condition cards, placed below the water-quality counts - the placement T-331's ⛔ note
  required before restoring them. Two files were added, `components/dashboard/
  StationReadingsCards.jsx` and `stationPresentation.js`. The deleted `turbidityPresentation()`
  helper was **not** resurrected: the wording it produced now belongs to the Water Quality Status
  card, and the colours/vocabulary are re-used from `utils/waterStatus.js` and
  `components/boards/boardPresentation.js` rather than copied into a new file. See §7.2's 🔁 note.
- **No user-list page is planned:** the system has one profile and no `GET /api/users`
  endpoint (Rule 1), so signing in lands on the Dashboard and Profile is reached from the
  header avatar menu (the A10 resolution).
- **Stray file:** `docs/MASTER_CONTEXT.md.bak` is a backup copy left in `docs/`, not a
  mirror of any section. It is not part of the documentation set and can be deleted.
- **Never built or run:** the `app` Docker profile (`backend` + `frontend` images) —
  see T-401/T-402.
- **Duplicate file:** `node-red.md` exists at the repo root *and* in `docs/` with the
  same content (A6). Deleting the root copy is T-503 and is still unconfirmed - it is
  therefore still present.
- Git-ignored build output (not shown above): `backend/dist/`, `backend/node_modules/`,
  `frontend/node_modules/`, `frontend/dist/`, `backend/src/generated/`, and Node-RED's
  `.config.*` / `.npm/` runtime files.
