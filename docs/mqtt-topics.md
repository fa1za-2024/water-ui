# Water UI - MQTT Topic & Payload Contract

This document freezes the MQTT topic naming and payload schema used between the
**XIAO ESP32C3**, **Mosquitto** and **Node-RED**. Anything published on these
topics must match the contract below; Node-RED rejects payloads that do not.

- **Broker:** Mosquitto 2.x (`eclipse-mosquitto:2`), service name `mosquitto`
- **Ports:** `1883` MQTT (devices and Node-RED), `9002` MQTT over WebSockets
- **Auth:** anonymous while `allow_anonymous true` is set in `iot/mosquitto/mosquitto.conf`

---

## 1. Topic Map

| Topic | Direction | Retained | Purpose |
| :--- | :--- | :--- | :--- |
| `sensors/<boardId>/data` | ESP32C3 → broker | no | Telemetry reading (the main contract) |
| `sensors/<boardId>/status` | ESP32C3 → broker | **yes** | `online` / `offline` via Last Will and Testament |
| `sensors/+/data` | Node-RED subscribes | — | Every board's telemetry |
| `water/processed` | Node-RED → broker | no | Reserved for the enriched payload (not wired yet) |

`<boardId>` must equal `boards.board_id` in MySQL (`VARCHAR(50)`, e.g. `AA240238`)
and the `board_id` tag in InfluxDB. The firmware defaults to `#define BOARD_ID "AA240238"`
and only falls back to the Wi-Fi MAC address when that define is left **empty** - so if
you do let it fall back, register the MAC as `board_id` too, or the tag written and the
tag the API looks up will not match (`board_mac_address` is a separate column).

### Wildcards in use
- `+` matches exactly one level: `sensors/+/data` matches `sensors/AA240238/data`
  but **not** `sensors/AA240238/extra/data`.
- `#` matches all remaining levels and must be last: `sensors/#`.

---

## 2. Telemetry Payload — `sensors/<boardId>/data`

```json
{
  "boardID": "AA240238",
  "pH": 12.75,
  "turbidity": 25.00,
  "batt_voltage": 3.4,
  "rssi": -75,
  "ts": 1758523200000
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `boardID` | string | **yes** | Logical board id. `board_id` is also accepted. |
| `pH` | number | **yes** | 0–14. Rejected if not parseable by `parseFloat()`. |
| `turbidity` | number | **yes** | NTU. Rejected if not parseable by `parseFloat()`. |
| `batt_voltage` | number | no | Volts. Defaults to `0` when missing. |
| `rssi` | number | no | dBm, negative integer. Defaults to `0` when missing. |
| `ts` | integer | no | **Epoch milliseconds** from the device clock. When absent or impossible, Node-RED stamps the arrival time. |

Rules enforced by the Node-RED function node:

1. Numbers are cast with `parseFloat()` / `parseInt()` before anything reaches
   InfluxDB, so strings will never corrupt a float field (Rule 6).
2. A payload missing `boardID`, `pH` or `turbidity` is **dropped** with a
   `node.warn()` and written nowhere.
3. `pH` and `turbidity` must be finite numbers — `NaN` never reaches InfluxDB.

---

## 3. Status Payload — `sensors/<boardId>/status`

`online` is published retained on connect; `offline` is the broker's Last Will,
published automatically if the device disappears. The firmware implements both.

⚠️ **Nothing consumes this topic yet.** An earlier revision of this document claimed
the dashboard's Online/Offline indicator is driven by it - that is not what the API
does. The board registry derives `lastSeen`/`isOnline` from the newest **InfluxDB**
point per `board_id` (decision A5: the 15-minute window, implemented in T-208). The
status topic remains the more truthful signal in principle (it survives a device that
is powered off but had no InfluxDB write failure) and could replace the derivation
later; today it is published and unused.

---

## 4. Quality of Service — read this before debugging drops

| Hop | Requested QoS | Reality |
| :--- | :--- | :--- |
| ESP32C3 → broker | — | **QoS 0 only.** `PubSubClient::publish()` cannot do better. |
| broker → Node-RED | QoS 2 | Delivered at the lower of pub/sub QoS, so effectively **QoS 0**. |

The documented QoS 2 subscription in `docs/node-red.md` therefore does **not**
give exactly-once delivery end to end. If exactly-once is genuinely required,
the firmware must switch to a QoS-capable client (`arduino-mqtt` /
`AsyncMqttClient`). For this pipeline QoS 0 is fine: readings repeat every 30s
and InfluxDB overwrites nothing.

---

## 5. Derived Tags and Fields (what Node-RED writes)

The function node in `iot/node-red/flows.json` produces one InfluxDB point per
message:

- **Measurement:** `water_quality`
- **Tags:** `board_id`, `wq_status`, `batt_level`, `wifi_status`
- **Fields:** `pH` (float), `turbidity` (float), `batt_voltage` (float), `rssi` (integer — sent with the `i` suffix)

Line protocol produced from the example payload above:

```text
water_quality,board_id=AA240238,wq_status=Unsafe,batt_level=Low,wifi_status=Fair pH=12.75,turbidity=25,batt_voltage=3.4,rssi=-75i 1758523200000000000
```

Status thresholds are defined once in the function node and documented in
`MASTER_CONTEXT.md` section 5.3. The middle tier is **`Acceptable`** (stored in
InfluxDB) and is displayed as **Acceptable** in the UI.

---

## 6. Testing the Pipeline

Watch raw traffic on the broker:

```bash
# Subscribe to everything (from the repo root)
docker compose exec mosquitto mosquitto_sub -t 'sensors/#' -v
```

Publish a test reading by hand — no hardware needed:

```bash
docker compose exec mosquitto mosquitto_pub -t sensors/AA240238/data -m \
  '{"boardID":"AA240238","pH":7.1,"turbidity":1.5,"batt_voltage":3.8,"rssi":-58}'
```

Then confirm the point landed in InfluxDB:

```bash
docker compose exec influxdb influx query \
  'from(bucket:"water_quality_bucket") |> range(start:-5m) |> filter(fn:(r) => r._measurement == "water_quality")' \
  --org water_ui_org --token "$INFLUXDB_TOKEN"
```

Expected side effects: a debug message in Node-RED (http://localhost:1880), and a
`wq_status == "Unsafe"` payload additionally triggers the Telegram branch.

---

## 7. Enabling Authentication

Anonymous access is fine on a trusted LAN, but the broker is open to anyone who
can reach port 1883. To lock it down:

```bash
# 1. Create the password file inside the mounted config directory
docker compose exec mosquitto \
  mosquitto_passwd -b -c /mosquitto/config/passwd waterui '<STRONG_PASSWORD>'

# 2. Edit iot/mosquitto/mosquitto.conf:
#      - comment out  allow_anonymous true
#      - uncomment    password_file /mosquitto/config/passwd

# 3. Restart the broker
docker compose restart mosquitto
```

Then set `MQTT_USER` / `MQTT_PASSWORD` in the sketch and reflash.
