# Water UI - Database Schema Design

This document outlines the database structure for the **Water UI** system. The architecture uses a hybrid database approach:
- **MySQL:** Stores structured, relational data (Users, Boards, Device Metadata).
- **InfluxDB:** Stores high-frequency, time-series data (Sensor Telemetry).

---

## 1. MySQL Schema (Relational Data)

MySQL is used for data that requires strict relationships, transactions, and updates (e.g., user profiles, board registration, coordinates).

> ⚠️ **Known drift (A23 / T-224, T-225):** the `TIMESTAMP` types and the
> `ON UPDATE CURRENT_TIMESTAMP` clauses in the tables below do **not** match the
> tables that actually exist. Prisma 7 emits `datetime(3)` and maintains `updated_at`
> client-side, so the live columns have no `ON UPDATE`. Implement against
> `backend/prisma/schema.prisma`, not these two rows, until the drift is resolved.
>
> There is also **no `last_seen` column** on `boards`: a board's `wifi_status`,
> `batt_level`, `last_seen` and `isOnline` are derived from the newest InfluxDB point
> (§2 below, and decision A5 in `MASTER_CONTEXT.md`) - nothing is written on the
> ingest hot path.

### Table: `users`
Stores the single user profile and authentication details.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique user ID |
| `first_name` | VARCHAR(50) | NOT NULL | User's first name |
| `last_name` | VARCHAR(50) | NOT NULL | User's last name |
| `email` | VARCHAR(100) | UNIQUE, NOT NULL | User's email address |
| `phone` | VARCHAR(20) | UNIQUE, NOT NULL | User's phone number |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| `profile_picture_url`| VARCHAR(255) | NULL | Path/URL to MinIO/S3 image |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account creation date |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last profile update |

*(Note: Since RBAC is not used, there is no junction table between users and boards. The single user manages all boards.)*

### Table: `boards`
Stores the registry of all physical IoT devices.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Internal board ID |
| `board_id` | VARCHAR(50) | UNIQUE, NOT NULL | Logical ID from sensor (e.g., "AA240238") |
| `board_mac_address` | VARCHAR(17) | UNIQUE, NOT NULL | Hardware MAC (e.g., "00:1A:2B:3C:4D:5E") |
| `location_name` | VARCHAR(100) | NOT NULL | Descriptive location (e.g., "Tank 1") |
| `latitude` | DECIMAL(10, 8) | NOT NULL | GPS Latitude |
| `longitude` | DECIMAL(11, 8) | NOT NULL | GPS Longitude |
| `is_active` | BOOLEAN | DEFAULT TRUE | Soft delete / activate toggle |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Registration date |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last update |

*(Note: Since RBAC is not used, there is no junction table between users and boards. The single user manages all boards.)*

---

## 2. InfluxDB Schema (Time-Series Data)

InfluxDB is optimized for high-write throughput and time-based queries. In InfluxDB v2.x, data is stored in **Buckets**. 

- **Bucket Name:** `water_quality_bucket`
- **Retention Policy:** `30d` - raw points are kept for 30 days and then dropped.
  **No downsampling task exists** (A11 / T-219): older revisions claimed one, but the
  claim is void until the Flux `to()` task is actually written. The API therefore reads
  at most the retention window, which is why a board that has been silent longer than
  30 days is indistinguishable from one that never reported.
- **Measurement:** `water_quality`

### Measurement: `water_quality`
This is the core time-series record. It distinguishes between **Tags** (indexed metadata) and **Fields** (actual sensor values).

| Type | Key | Data Type | Description | Example Value |
| :--- | :--- | :--- | :--- | :--- |
| **Tag** | `board_id` | String | Logical ID of the sensor | "AA240238" |
| **Tag** | `wq_status` | String | Calculated water quality status | "Safe", "Acceptable", "Unsafe" |
| **Tag** | `batt_level` | String | Calculated battery level | "Full", "Medium", "Low", "Critical" |
| **Tag** | `wifi_status` | String | Calculated Wi-Fi signal status | "Excellent", "Good", "Fair", "Poor" |
| **Field** | `pH` | Float | Measured pH level | 7.25 |
| **Field** | `turbidity` | Float | Measured turbidity in NTU | 2.50 |
| **Field** | `batt_voltage` | Float | Measured battery voltage | 3.85 |
| **Field** | `rssi` | Integer | Measured Wi-Fi RSSI in dBm | -65 |
| **Timestamp** | `_time` | Timestamp | RFC3339 UTC Timestamp | "2023-10-27T10:00:00Z" |

### Why this structure?
- **Tags** are indexed and used for `GROUP BY` and `WHERE` clauses. Filtering by `board_id` or `wq_status` will be extremely fast.
- **Fields** are the raw values. They are not indexed but are fast to aggregate (e.g., calculating the average pH over 24 hours).
- **Timestamp (`_time`)** is written explicitly by Node-RED (from the device clock when it is usable, otherwise the arrival time), so the point keeps edge-time accuracy instead of InfluxDB's arrival time.
- **`_time` is also the registry's `last_seen`.** `services/influxService.ts` reads the newest row per `board_id` and derives `isOnline` from it (A5: 15-minute window). Because `pH` is a float and `rssi` an integer, the query pivots the fields and sorts by `_time`; `group(...) |> last()` fails with *"schema collision: cannot group float and integer types together"*.

---

## 3. Example Data Flow

### Step 1: Node-RED receives MQTT Payload
```json
{
  "boardID": "AA240238",
  "pH": 7.25,
  "turbidity": 2.50,
  "batt_voltage": 3.85,
  "rssi": -65
}
```

### Step 2: Node-RED derives the status tags
`parseFloat()` / `parseInt()` first (Rule 6), then the thresholds in
`MASTER_CONTEXT.md` §5.3 produce `wq_status`, `batt_level` and `wifi_status`.
For the payload above: `wq_status=Acceptable`, `batt_level=Full`, `wifi_status=Good`.

### Step 3: Node-RED writes one point to InfluxDB
```text
water_quality,board_id=AA240238,wq_status=Acceptable,batt_level=Full,wifi_status=Good pH=7.25,turbidity=2.5,batt_voltage=3.85,rssi=-65i 1758523200000000000
```
Written with the core `http request` node against the InfluxDB v2 write API
(`POST /api/v2/write?org=…&bucket=…&precision=ns`), so `rssi` keeps its `i` suffix
(integer) and `_time` stays exact.

### Step 4: Node-RED notifies the API, the API notifies the browser
`POST /api/internal/sensor-update` → Express emits the Socket.io event
`sensor-update` → Redux → dashboard, map and charts (Rule 5: no polling).

### Step 5: Reads
- Board registry + device status: MySQL plus the newest InfluxDB point per `board_id`
  (`GET /api/boards`, T-208).
- History: InfluxDB through `services/influxService.ts` (**TO DO**, T-213/T-214).
- Unsafe readings additionally fire the Telegram branch, rate-limited to one message
  per 15 minutes.