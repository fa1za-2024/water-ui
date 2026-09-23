# MQTT & Node-RED Pipeline (Water UI)

This guide mirrors **section 5 of `MASTER_CONTEXT.md`** (the source of truth) and
describes the pipeline that is actually implemented in
[`iot/node-red/flows.json`](../iot/node-red/flows.json):

```
ESP32C3 --MQTT--> Mosquitto --> Node-RED --line protocol--> InfluxDB
                                    |--HTTP POST--> Express --> Socket.io --> React
                                    '--Telegram--> alert group (only when Unsafe)
```

The frozen topic names and payload schema live in [`mqtt-topics.md`](mqtt-topics.md);
the authoritative threshold table is §5.3 and the derivation rules are reproduced below.

---

## 1. Broker connection (as implemented)

| Item | Value |
| :--- | :--- |
| Broker | `eclipse-mosquitto:2`, Compose service `mosquitto` |
| Ports | `1883` MQTT (device + Node-RED), `9002` MQTT over WebSockets (A8 - MinIO keeps `9001`) |
| Auth | anonymous in local development (`allow_anonymous true` in `iot/mosquitto/mosquitto.conf`); how to lock it down: [`mqtt-topics.md`](mqtt-topics.md) §7 |
| Config | `iot/mosquitto/mosquitto.conf` is bind-mounted into the container (A9) |
| Node-RED | `nodered/node-red:latest` (v5), `./iot/node-red` mounted at `/data` (A9) |

Node-RED's official v5 image **does not run `npm install` from `/data`**, so Compose
overrides the entrypoint to install `iot/node-red/package.json` first and then `cd`
back before exec'ing Node-RED. Do not simplify that away - the Telegram nodes stay
unregistered without it (**A14**).

To add the broker by hand instead of using `flows.json`: drag an `mqtt in` node, click
the pencil next to **Server**, enter the broker host (`mosquitto` inside Compose, the
server IP from the host), port `1883`, optional credentials/TLS, then **Add**.

## 2. The flow, node by node

| Node | Type | What it does |
| :--- | :--- | :--- |
| **ESP32C3 telemetry** | `mqtt in` | Subscribes to `sensors/+/data`, QoS 2 requested, output **"a parsed JSON object"** |
| **Validate + derive statuses** | `function` | Casts with `parseFloat()` / `parseInt()`, drops invalid payloads, derives the three tags and builds the line protocol (§3, §4) |
| **InfluxDB write** | `http request` | `POST` to the InfluxDB v2 write API with `Authorization: Token …`; `msg.url` and the body are set by the function node |
| **Notify Express (Socket.io)** | `http request` | `POST $BACKEND_URL/api/internal/sensor-update` on the Express API, which emits the Socket.io `sensor-update` event (Rule 5: no polling). `BACKEND_URL` is set in `docker-compose.yml` - see the T-333 note in §6, because the wrong value fails **silently** |
| **wq_status == Unsafe ?** | `switch` | `msg.payload.wq_status == "Unsafe"` |
| **rate limit 1 / 15 min** | `delay` | `pauseType: rate`, `rate: 1` per 15 minutes, `drop: true` - one alert per 15 minutes |
| **Alert message** | `template` | `🚨 ALERT: Water Quality Unsafe at Board {{payload.boardID}}. pH: {{payload.pH}}, Turbidity: {{payload.turbidity}}.` |
| **Telegram alert** | `telegram sender` | Uses the `telegram bot` config node (token + chat id) |
| **Pipeline errors** | `catch` | Catches any node error in the tab and logs it, so a write failure is not silent |

Ordering note: the **derived statuses are computed once**, before anything is stored,
which keeps the Express API and the React frontend thin (§5.7).

## 3. Why the casts matter (Rule 6)

```javascript
// 1. Extract and normalise - strings in a float field break Chart.js
const payload = msg.payload;
const boardID = payload.boardID;
const pH = parseFloat(payload.pH);
const turbidity = parseFloat(payload.turbidity);
const batt_voltage = parseFloat(payload.batt_voltage);
const rssi = parseInt(payload.rssi);

// 2. Reject what cannot be a reading (see mqtt-topics.md section 2)
if (!boardID || !Number.isFinite(pH) || !Number.isFinite(turbidity)) {
    node.warn('dropped payload: boardID, pH and turbidity are required');
    return null;
}
```

`wq_status`, `batt_level` and `wifi_status` are then computed from §4's table, and the
function node builds one line-protocol point:

```text
water_quality,board_id=AA240238,wq_status=Unsafe,batt_level=Low,wifi_status=Fair pH=12.75,turbidity=25,batt_voltage=3.4,rssi=-75i 1758523200000000000
```

- `rssi` carries the **`i` suffix** so it stays an integer in InfluxDB.
- The timestamp is milliseconds from the device when usable (`ts`), otherwise the
  arrival time, converted to **nanoseconds as a string** so there is no `2^53` loss.
- The write goes through Node-RED's core `http request` node to
  `POST /api/v2/write?org=…&bucket=…&precision=ns` - no third-party InfluxDB node.
  (An earlier revision of this document described an `mqtt out` / contrib-node
  approach; the implemented path is the HTTP one, which is what keeps `_time` exact
  and `rssi` an integer.)

## 4. Derived status thresholds (single source of truth, §5.3)

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

The middle water-quality tier is **`Acceptable`**, not `Warning` (A1 - it is an
InfluxDB tag, so it could not have been normalised later).

## 5. Telegram alerts

1. Configure the `telegram bot` node with the bot token and the `chatId` of the alert
   group. The token is a Node-RED **credential**, so it is deliberately not stored in
   `flows.json` - set it in the editor or via `TELEGRAM_BOT_TOKEN` /
   `TELEGRAM_CHAT_ID` in `.env`.
2. `switch` on `msg.payload.wq_status == "Unsafe"`.
3. `template` builds the message, `telegram sender` sends it.
4. The `delay` node in **rate** mode allows **one message per 15 minutes** and drops
   the rest, so a sensor stuck in the unsafe range cannot spam the group.

Still open: with no bot token configured the branch stays inert, and a real alert has
never been observed (**T-104**, `BLOCKED` on getting a bot from BotFather).

## 6. Testing the pipeline

Publish a reading by hand - no hardware needed (from the repo root):

```bash
docker compose exec mosquitto mosquitto_pub -t sensors/AA240238/data -q 1 \
  -m '{"boardID":"AA240238","pH":7.1,"turbidity":1.5,"batt_voltage":3.8,"rssi":-58}'
```

Confirm the point landed in InfluxDB:

```bash
docker compose exec influxdb influx query \
  'from(bucket:"water_quality_bucket") |> range(start:-5m)
   |> filter(fn:(r) => r._measurement == "water_quality")' \
  --org water_ui_org --token "$INFLUXDB_TOKEN"
```

Then check the API sees it as the board's newest reading:

```bash
curl -s http://localhost:5000/api/boards/AA240238 -H "Authorization: Bearer $TOKEN"
# -> lastSeen = the point just written, isOnline = true (A5: 15-minute window)
```

Expected side effects: a debug message in Node-RED (http://localhost:1880), and an
`Unsafe` reading additionally triggers the (rate-limited) Telegram branch.
`mosquitto_sub -t 'sensors/#' -v` shows the raw traffic.

> ⚠️ **Where the pipeline posts next, and why a wrong value is invisible (T-333).** The
> function node's second output POSTs the derived reading to `BACKEND_URL` +
> `/api/internal/sensor-update`, and Express turns that into the Socket.io `sensor-update`
> event the dashboard and the boards table live on (Rule 5). `BACKEND_URL` defaults to
> `http://backend:5000` — the compose service, which only exists once the `app` profile is
> up (T-401) — so **a dev run with the API on the host must set
> `BACKEND_URL=http://host.docker.internal:5000`** in `.env` and then recreate the service:
>
> ```bash
> docker exec water_ui_nodered printenv BACKEND_URL    # env changes need a recreate, not a restart of the old container
> docker compose up -d nodered
> ```
>
> If the value is wrong, readings still land in InfluxDB and the charts still fill in, but the
> dashboard never updates live — and **nothing is logged**, because the flow's `http request`
> nodes use `senderr=false` and its `debug` nodes use `console=false` (so `docker logs
> water_ui_nodered` stays clean, and a headless run has no debug pane to look at). Verify the
> hop by its *effect*: watch the Socket.io event while you publish.
>
> ```bash
> # terminal 1 - watch what the browser would receive
> NODE_PATH=frontend/node_modules node -e "const{io}=require('socket.io-client');const s=io('http://localhost:5000');s.on('sensor-update',p=>console.log('SENSOR-UPDATE',JSON.stringify(p)));setTimeout(()=>process.exit(0),14000)"
> # terminal 2 - publish through the real broker (a probe board needs no MySQL row...)
> docker compose exec mosquitto mosquitto_pub -t sensors/PROBE1/data -q 2 \
>   -m '{"boardID":"PROBE1","pH":9.2,"turbidity":2.0,"batt_voltage":3.6,"rssi":-65}'
> # -> SENSOR-UPDATE {"boardID":"PROBE1",...,"wq_status":"Unsafe","batt_level":"Medium","wifi_status":"Good"}
> # ...but it does write a real series for PROBE1, so tombstone it when you are done:
> docker compose exec influxdb influx delete --bucket water_quality_bucket --org water_ui_org \
>   --token "$INFLUXDB_TOKEN" --predicate 'board_id="PROBE1"' \
>   --start 1970-01-01T00:00:00Z --stop 2030-01-01T00:00:00Z
> ```
>
> A `ts` field (device epoch **milliseconds**) becomes the point's `_time`; without it the
> arrival time is used, so a hand-published payload is stamped a second or two in the past.

## 7. Artefacts and known traps

| Artefact | Purpose |
| :--- | :--- |
| `docker-compose.yml` | MySQL, InfluxDB, Mosquitto, Node-RED, MinIO (+ minio-init; `app` profile for backend/frontend) |
| `iot/mosquitto/mosquitto.conf` | Listener `1883`, anonymous dev access, WebSockets on host `9002` |
| `iot/node-red/settings.js` | Flow file, credential secret, logging |
| `iot/node-red/flows.json` | The flow described above |
| `iot/node-red/package.json` | `node-red-contrib-telegrambot` (installed by the entrypoint override) |
| `iot/esp32c3/water_quality_mqtt.ino` | Firmware publishing the telemetry JSON (and the LWT `status` topic) |
| `docs/mqtt-topics.md` | Frozen topic naming, payload schema, QoS caveats |

Traps - discovered by running the stack, do not "simplify" them back:

- **A14:** Node-RED v5 does not install from `/data`, and its entrypoint uses a
  relative path to `red.js`.
- **T-333 - the notify hop is silent when it is misconfigured:** `BACKEND_URL` defaulted to the
  compose name `http://backend:5000`, which only resolves once the `app` profile (T-401) is up, so
  every reading reached InfluxDB and none reached the browser - with a clean container log (the
  `http request` nodes use `senderr=false` and the `debug` nodes use `console=false`). Compose now
  takes `${BACKEND_URL:-http://backend:5000}`, the nodered service carries
  `extra_hosts: host.docker.internal:host-gateway`, and `.env.example` documents the dev value.
  Prove the hop by watching the Socket.io event (§6), never by reading the log - and recreate the
  container (`docker compose up -d nodered`) after changing the env, since `ps` shows the stale one.
- **A16:** the internal ingest route must be mounted at `/api`, not
  `/api/dashboard`, or the Express notify step 404s forever.
- **QoS:** the firmware's `PubSubClient` publishes at **QoS 0**, so the QoS 2
  subscription above does not give exactly-once delivery end to end - see
  [`mqtt-topics.md`](mqtt-topics.md) §4.
- **Status topic:** the firmware publishes `sensors/<boardId>/status` (retained
  `online`, LWT `offline`), but Node-RED does not consume it yet; the dashboard's
  Online/Offline state is derived from the newest InfluxDB point (A5).
