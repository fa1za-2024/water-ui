# Deploying Water UI on Railway

Water UI runs as **seven Railway services** in one project. Two are Railway
database templates; five are built from this repository.

```
                        Internet
                            │
        ┌───────────────────┼───────────────────────────┐
        │ 443 (HTTPS)       │ 443 (HTTPS)               │ raw TCP (device MQTT)
        ▼                   ▼                           ▼
  ┌───────────┐       ┌───────────┐                ┌────────────────┐
  │ frontend  │──/api─▶│  backend  │                │   mosquitto    │
  │  (nginx)  │──/sock─▶│ (Express) │                │  :1884 proxy   │
  └───────────┘       └─────┬─────┘                └───────┬────────┘
   React + proxy            │                              │ :1883
                            ▼                              ▼
                     ┌─────────────┐   ┌──────────────┐   (private network)
                     │ MySQL       │   │  node-red    │◀──┘
                     │ (template)  │   │  pipeline    │
                     └─────────────┘   └──────┬───────┘
                     ┌─────────────┐          │
                     │ InfluxDB    │◀─────────┘
                     │ (template)  │
                     └─────────────┘
                     ┌─────────────┐
                     │   minio     │◀── backend (avatars)
                     │  (S3)       │◀── browser (public domain)
                     └─────────────┘
```

Everything except `frontend`, `node-red`, `minio` (avatars) and the Mosquitto
TCP proxy stays on the private network and is never exposed publicly.

> **Security note — read before pointing devices at it.** Railway's TCP proxy is
> raw TCP and does **not** terminate TLS, and no certificate can be issued for a
> `*.railway.app` hostname you do not own. The device-facing MQTT listener is
> therefore **authenticated but unencrypted**: the username, password and every
> reading cross the public internet in the clear. If that is not acceptable for
> your deployment, keep the devices on the LAN or put your own TLS-terminating
> proxy in front of Mosquitto (see [`../../iot/esp32c3/water_quality_mqtt.ino`](../../iot/esp32c3/water_quality_mqtt.ino),
> which still supports TLS for that case). This is the one real regression
> against the retired self-hosted (OCI) deployment, which terminated TLS on 8883.

---

## 1. Prerequisites

| Need | How |
| :--- | :--- |
| Railway account | <https://railway.app> — the free trial covers a project of this size briefly; sustained use is usage-billed |
| Railway CLI | `npm i -g @railway/cli` (this repository was prepared with v5.15.0) |
| Logged in | `railway login` |
| This repository on GitHub | Railway builds from a repo, not from your working tree |

Optional but recommended before the first deploy — build every custom image
locally so a broken Dockerfile fails on your machine, not in the dashboard:

```bash
docker build -t water-ui-backend   backend
docker build -t water-ui-frontend  frontend
docker build -t water-ui-nodered   iot/node-red
docker build -t water-ui-minio     deploy/railway/minio
docker build -t water-ui-mosquitto deploy/railway/mosquitto
```

---

## 2. What to create

| Service | Source | Root directory | Public? | Volume | `railway.json` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MySQL` | Railway **template** | — | **no** | managed | — |
| `InfluxDB` | Railway **template** | — | **no** | managed | — |
| `backend` | this repo | `backend` | **no** | — | `backend/railway.json` |
| `frontend` | this repo | `frontend` | HTTPS domain | — | `frontend/railway.json` |
| `mosquitto` | this repo | `deploy/railway/mosquitto` | **TCP proxy** | `/mosquitto/data` | `deploy/railway/mosquitto/railway.json` |
| `minio` | this repo | `deploy/railway/minio` | HTTPS domain | `/data` | `deploy/railway/minio/railway.json` |
| `node-red` | this repo | `iot/node-red` | HTTPS domain | — (see §7) | `iot/node-red/railway.json` |

**Keep those service names exactly.** Every cross-service variable in §4 uses
Railway's reference syntax `${{ServiceName.VARIABLE}}`, which is matched against
the service name — rename a service and the references resolve to nothing.

Railway reads `railway.json` from each service's **root directory**, which is why
the five repo services each carry one.

---

## 3. Build the project

### 3.1 Create it

Either in the dashboard (**New Project → Deploy from GitHub repo**, pick this
repo, then add the rest as services), or with the CLI:

```bash
railway init            # create the project
railway link            # attach this directory to it
```

### 3.2 Add the two databases

In the project: **New → Database → MySQL**, then **New → Database → InfluxDB**.
Railway names them `MySQL` and `InfluxDB`; keep those names.

Do **not** enable public networking on either. Confirm on the service's
**Variables** tab which names it actually exposes (they can differ between
template versions) before you write the references in §4 — the names used below
are the current ones:

* MySQL: `MYSQL_URL`, `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`
* InfluxDB: `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN`, `DOCKER_INFLUXDB_INIT_ORG`, `DOCKER_INFLUXDB_INIT_BUCKET`

### 3.3 Add the five repo services

**New → GitHub Repo → this repository**, once per service, then immediately set
**Settings → Source → Root Directory** to that service's folder. Do this *before*
the first build.

| Service | Root Directory |
| :--- | :--- |
| `backend` | `backend` |
| `frontend` | `frontend` |
| `node-red` | `iot/node-red` |
| `mosquitto` | `deploy/railway/mosquitto` |
| `minio` | `deploy/railway/minio` |

**Skip this and the build fails immediately.** Railpack — Railway's default
builder — analyzes the configured root, and at the repository root there is no
single app, so language detection gives up:

```
╭─────────────────╮
│ Railpack 0.39.0 │
╰─────────────────╯
  ⚠ Script start.sh not found
  ✖ Railpack could not determine how to build the app.
  The app contents that Railpack analyzed contains:
  ./
  ├── backend/
  ├── deploy/
  ...
```

The reason Railpack ran at all is subtle: each service's `railway.json` — the
file that declares `"builder": "DOCKERFILE"` — is **only read from the configured
root directory**. While the root is the repository root, that file is invisible,
Railway sees no `Dockerfile`, and falls back to Railpack.

This is a per-service dashboard setting, and the CLI cannot set it: neither
`railway add --repo` nor `railway service source connect` has a root-directory
flag.

### 3.4 Volumes

Attach these under **Service → Settings → Volumes**. Create them **before the
first successful deploy** if you want data to survive from the start:

| Service | Mount path | Why |
| :--- | :--- | :--- |
| `minio` | `/data` | profile pictures |
| `mosquitto` | `/mosquitto/data` | retained/queued messages |

`node-red` deliberately has **no volume** — see §7.

### 3.5 Networking

| Service | Setting |
| :--- | :--- |
| `frontend` | **Generate Domain** (HTTPS) |
| `minio` | **Generate Domain** (HTTPS), target port **9000** |
| `node-red` | **Generate Domain** (HTTPS) |
| `mosquitto` | **Settings → Networking → TCP Proxy**, target port **1884** |

The TCP proxy gives you `RAILWAY_TCP_PROXY_DOMAIN` and `RAILWAY_TCP_PROXY_PORT`.
Those two values are what the ESP32C3 connects to (§7).

---

## 4. Variables

Set these per service (**Service → Variables → Raw Editor** is fastest). Values
in `${{...}}` are Railway references, resolved at deploy time.

### `MySQL` / `InfluxDB`

Nothing to add — use the template's own variables via references below.

### `backend`

| Variable | Value |
| :--- | :--- |
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` |
| `DB_TLS` | `require` |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | a long random string |
| `JWT_EXPIRES_IN` | `7d` |
| `INFLUXDB_URL` | `http://${{InfluxDB.RAILWAY_PRIVATE_DOMAIN}}:8086` |
| `INFLUXDB_TOKEN` | `${{InfluxDB.DOCKER_INFLUXDB_INIT_ADMIN_TOKEN}}` |
| `INFLUXDB_ORG` | `${{InfluxDB.DOCKER_INFLUXDB_INIT_ORG}}` |
| `INFLUXDB_BUCKET` | `${{InfluxDB.DOCKER_INFLUXDB_INIT_BUCKET}}` |
| `MINIO_ENDPOINT` | `${{minio.RAILWAY_PRIVATE_DOMAIN}}` |
| `MINIO_PORT` | `9000` |
| `MINIO_USE_SSL` | `false` |
| `MINIO_ACCESS_KEY` | `${{minio.MINIO_ROOT_USER}}` |
| `MINIO_SECRET_KEY` | `${{minio.MINIO_ROOT_PASSWORD}}` |
| `MINIO_BUCKET_NAME` | `profile-pictures` |
| `MINIO_PUBLIC_URL` | `https://${{minio.RAILWAY_PUBLIC_DOMAIN}}` |
| `MQTT_HOST` | `${{mosquitto.RAILWAY_PRIVATE_DOMAIN}}` |
| `MQTT_PORT` | `1883` |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGIN` | `https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}` |
| `ALLOW_REGISTRATION` | `false` |
| `SEED_PASSWORD` | a strong password for the seeded profile |

Notes:

* **`PORT=8080` is pinned on purpose.** `frontend` has to name the backend's port
  in `BACKEND_UPSTREAM`, and a pinned value is one less moving part than a
  reference to an assigned port.
* `MINIO_PUBLIC_URL` must have **no trailing slash and no `/profile-pictures`
  suffix** — the backend appends `/<bucket>/<object>` itself.
* `DB_TLS=require` encrypts the MySQL connection without verifying Railway's
  certificate. Set `verify` only if you supply a CA whose SAN matches the host.
* `MINIO_PUBLIC_URL` and `CORS_ORIGIN` reference a public domain, so generate the
  `minio` and `frontend` domains (§3.5) **before** the first backend deploy.

### `frontend`

| Variable | Value |
| :--- | :--- |
| `BACKEND_UPSTREAM` | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080` |

Do **not** set `PORT`; Railway assigns it and
[`nginx.conf.template`](../../frontend/nginx.conf.template) listens on it. There
are no `VITE_*` variables to set — the bundle is built with a relative
`/api` base and nginx proxies it, so the browser stays same-origin.

### `mosquitto`

| Variable | Value |
| :--- | :--- |
| `MQTT_USERNAME` | `waterui` (or your choice) |
| `MQTT_PASSWORD` | a strong password — **required**; the container refuses to start without it |

The password file is generated at container start, so changing `MQTT_PASSWORD`
and restarting rotates the credential. Listener `1883` stays anonymous for
Railway-internal clients; listener `1884` (the proxied one) requires these
credentials.

### `minio`

| Variable | Value |
| :--- | :--- |
| `PORT` | `9000` — **required**; MinIO ignores Railway's assigned port otherwise and the healthcheck fails |
| `MINIO_ROOT_USER` | a username |
| `MINIO_ROOT_PASSWORD` | a strong password |
| `MINIO_BROWSER` | `off` (optional — the console on `:9001` is not published) |

The `profile-pictures` bucket is created, and made anonymously readable, by the
backend's `ensureBucket()` on the first avatar upload — there is no `minio-init`
equivalent on Railway, so an unused, empty bucket simply does not exist yet.

### `node-red`

| Variable | Value |
| :--- | :--- |
| `MQTT_HOST` | `${{mosquitto.RAILWAY_PRIVATE_DOMAIN}}` |
| `MQTT_PORT` | `1883` |
| `INFLUX_URL` | `http://${{InfluxDB.RAILWAY_PRIVATE_DOMAIN}}:8086` |
| `INFLUX_ORG` | `${{InfluxDB.DOCKER_INFLUXDB_INIT_ORG}}` |
| `INFLUX_BUCKET` | `${{InfluxDB.DOCKER_INFLUXDB_INIT_BUCKET}}` |
| `INFLUX_TOKEN` | `${{InfluxDB.DOCKER_INFLUXDB_INIT_ADMIN_TOKEN}}` |
| `BACKEND_URL` | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080` |
| `NODE_RED_CREDENTIAL_SECRET` | a long random string |
| `NODE_RED_ADMIN_USER` | `admin` |
| `NODE_RED_ADMIN_PASSWORD_HASH` | a bcrypt hash (below) |

`MQTT_HOST` matters more than it looks: the flow stores
`"broker": "${MQTT_HOST}"` and Node-RED substitutes the variable **when it loads
the flows**, so it must be present at container start. It is why the pipeline
reaches the broker on Railway (`mosquitto.railway.internal`) exactly as it does
in Compose (the `mosquitto` service name).

Generate the editor password hash (bcryptjs ships inside the Node-RED image).
`--entrypoint node` is required: the image's own entrypoint would otherwise
swallow the `-e` script as Node-RED arguments and start the editor instead:

```bash
docker run --rm --entrypoint node nodered/node-red -e \
  "console.log(require('bcryptjs').hashSync(process.argv[1], 8))" 'your-admin-password'
```

Set `NODE_RED_ADMIN_PASSWORD_HASH` to the output. Without it the editor is
**open to anyone who can reach the domain** — the editor can rewrite the whole
pipeline and read the InfluxDB token.

---

## 5. First deploy, migrate, seed

1. Deploy in dependency order: `MySQL`, `InfluxDB`, `mosquitto`, `minio`,
   `backend`, `frontend`, `node-red`.
2. `backend` runs `npx prisma migrate deploy` as its **preDeployCommand**
   (`backend/railway.json`), so the tables are created before the API starts. If
   MySQL is not up yet, fix MySQL and redeploy `backend`.
3. Seed the single profile and the demo board **once**. It has to run **inside
   the container**, not locally: `DATABASE_URL` points at `mysql.railway.internal`,
   which your machine cannot resolve.

   ```bash
   railway link                 # select the backend service
   railway ssh -- npm run prisma:seed
   ```

   This creates the one user and one board (`AA240238`) the dashboard expects.
   Re-running it is safe.

The seed prints the login it creates; the password is the `SEED_PASSWORD`
variable you set in §4.

---

## 6. Verify

```bash
# Dashboard resolves and serves the SPA
curl -sI https://$FRONTEND_DOMAIN | head -3                 # expect 200

# nginx proxies to Express AND auth middleware ran (the API has no public /api/health)
curl -s -o /dev/null -w '%{http_code}\n' \
  https://$FRONTEND_DOMAIN/api/boards                       # expect 401

# Avatars are reachable from the browser origin
curl -s -o /dev/null -w '%{http_code}\n' \
  https://$MINIO_DOMAIN/minio/health/live                   # expect 200
```

Then, end to end:

1. Open `https://$FRONTEND_DOMAIN`, log in with the seeded profile.
2. Open `https://$NODE_RED_DOMAIN`, log in, and confirm the **Mosquitto** broker
   node shows "connected".
3. Publish a reading through the TCP proxy as a device would (substitute the
   proxy host/port and the credentials from §4):

   ```bash
   mosquitto_pub -h $RAILWAY_TCP_PROXY_DOMAIN -p $RAILWAY_TCP_PROXY_PORT \
     -u waterui -P "$MQTT_PASSWORD" \
     -t sensors/AA240238/data \
     -m '{"boardID":"AA240238","pH":7.1,"turbidity":1.5,"batt_voltage":3.8,"rssi":-58}'
   ```

4. The dashboard's live values update over Socket.io (no refresh), and the same
   point is readable in InfluxDB.

`backend` logs `[water-ui] API + Socket.io listening on :8080` on a good start,
and `[water-ui] refusing to start: MySQL is unreachable` when `DATABASE_URL` is
wrong — that probe runs before the port opens, so a bad database fails the
deploy instead of serving 500s.

---

## 7. Node-RED: what persists and what does not

The Node-RED image bakes `flows.json`, `settings.js` and the palette node into
`/data`, and deliberately has **no volume**: Railway mounts volumes as empty, so
a volume on `/data` would *hide* those baked files and start Node-RED with no
flow at all.

The consequences to know:

* **Editing the flow in the Railway editor does not survive a redeploy.** A
  Docker image is immutable; the next deploy starts from the repo's
  `flows.json`. To make a change permanent, export it from the editor and commit
  it to `iot/node-red/flows.json`.
* **The Telegram branch stays inert.** Its bot token is a Node-RED *credential*
  (`flows_cred.json`), which is git-ignored and not baked in. Configure it in the
  editor if you want alerts (and remember they will not persist), or wire the
  token through an environment variable first.

If you need a persistent editor, the supported pattern is different from this
setup and needs a start script that copies the baked files into an empty volume
on first boot — not enabled here.

---

## 8. Point the ESP32C3 at the broker

In [`iot/esp32c3/water_quality_mqtt.ino`](../../iot/esp32c3/water_quality_mqtt.ino):

```c
#define MQTT_USE_TLS     0                     // the TCP proxy is raw TCP
#define MQTT_HOST        "shuttle.proxy.rlwy.net"   // RAILWAY_TCP_PROXY_DOMAIN
#define MQTT_PORT        12345                      // RAILWAY_TCP_PROXY_PORT
#define MQTT_USER        "waterui"
#define MQTT_PASSWORD    "<from the mosquitto service variables>"
```

Use the **proxy** host and port, not `mosquitto.railway.internal` and not `1883`
— the private name resolves only inside Railway, and `1883` is the private,
never-proxied listener. Both values are on the Mosquitto service under
**Settings → Networking → TCP Proxy**.

---

## 9. Operating it

```bash
railway logs                 # follow the linked service's logs
railway redeploy             # redeploy the linked service
railway variables            # print the linked service's variables
railway ssh                  # open a shell INSIDE the running container
railway run <cmd>            # run a LOCAL command with the service's variables
```

Beware the distinction between the last two: `railway run` executes on your
machine, so anything it touches must be reachable from outside Railway — the
`*.railway.internal` database hostnames are not.

**Rotating secrets.** Change the variable in the dashboard and restart the
service. Two exceptions: `minio`'s root credentials require recreating the
variable *and* keeping the volume consistent with existing objects, and the
InfluxDB admin token is only applied on first boot — rotate it with
`influx auth` inside the service rather than by editing the template variable.

**Backups.** Railway volume backups are a paid feature, and the backend image
ships no `mysqldump`, so a portable dump means either using Railway's volume
backups or temporarily enabling a public connection to MySQL (turn on its TCP
proxy, run `mysqldump` from your machine against `MYSQL_PUBLIC_URL`, then turn it
off again). InfluxDB has no dump helper wired up here; treat its data as
reproducible telemetry unless you add one.

---

## 10. Troubleshooting

**`railpack prepare exited with an error` / `Script start.sh not found`.** The
service's **Root Directory** is still the repository root, so Railway used
Railpack (its default builder) and Railpack found no single app to build. Set
**Settings → Source → Root Directory** to that service's folder — see the table
in §3.3 — and redeploy. Railway then uses the `Dockerfile` and `railway.json` in
that folder. The root directory is dashboard-only (the CLI cannot set it), and
`railway.json` is only read from it.

**`backend` crash-loops with `refusing to start: MySQL is unreachable`.** The
boot probe could not open a connection at `DATABASE_URL`. The log now names the
target and the concrete TCP verdict, so the entry itself tells you which case it
is:

| The log says | What it means | Fix |
| :--- | :--- | :--- |
| `DATABASE_URL is not set` | no value on the service, so it refuses to fall back to the dev default | set `DATABASE_URL=${{MySQL.MYSQL_URL}}` on `backend` |
| `ENOTFOUND` | the hostname does not resolve | the reference did not resolve — check the database service's **exact** name, and that it is in the same environment |
| `ECONNREFUSED` | host resolved, nothing listening | MySQL is stopped or not deployed, or the port is wrong |
| `no TCP response within 3000 ms` | the port is blackholed | wrong host, or the database is not on this project's private network |
| `accepted a TCP connection but rejected the query` | reachable, but MySQL refused the query | credentials, database name, or `DB_TLS` |

Note that the *old* generic message (`boot probe timed out after 3500 ms`) could
not distinguish these — the Prisma pool does not report its own error until its
10 s acquire timeout, which is longer than the probe's 3.5 s bound, so the probe
always won and said only "timed out". That is why the check in
[`backend/src/config/db.ts`](../../backend/src/config/db.ts) now probes the socket
first.

**`minio` fails its healthcheck.** `PORT` is not `9000`, or the public domain
targets a different port. MinIO ignores Railway's assigned `PORT`, so the service
variable must pin it (see §4) and the domain must target `9000`.

**`mosquitto` exits immediately.** `MQTT_PASSWORD` is unset — `start.sh` refuses
to start a broker whose internet-facing listener has no password.

**Readings reach InfluxDB but the dashboard never updates.** `BACKEND_URL` on
`node-red` is wrong. It must be
`http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080`, never `localhost` and never
the compose name `backend`.

**Node-RED cannot reach the broker.** `MQTT_HOST` is unset or still literally
`mosquitto`. Service names do not resolve on Railway; use
`${{mosquitto.RAILWAY_PRIVATE_DOMAIN}}`.

**`backend` deploy fails in its pre-deploy step.** MySQL is down or
`DATABASE_URL` is unset. `prisma migrate deploy` runs before the new container
starts and aborts the deploy on failure — which is the intended behaviour.

**Avatars 404.** `MINIO_PUBLIC_URL` is missing the path or has a trailing slash,
or the `minio` public domain is not generated. It must be
`https://<minio-domain>` with nothing after it.

**Editor is unreachable / 401 loops.** `NODE_RED_ADMIN_PASSWORD_HASH` is not a
valid bcrypt hash, so `adminAuth` was not installed correctly. Regenerate it
with the command in §4.

**`frontend` crash-loops with `host not found in upstream "backend"`.** nginx
resolves `proxy_pass` hostnames **at startup** and exits if they do not resolve.
`BACKEND_UPSTREAM` is unset, misspelled, or still the compose name `backend`; it
must be `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080`. This is also why a
misconfigured `BACKEND_UPSTREAM` takes down `GET /` too, not just `/api/*`.

**`backend` cannot connect to MySQL with `DB_TLS=require`.** If the logs show a
TLS/handshake error (rather than a plain connection refusal), the Railway MySQL
layout is not offering a TLS listener. Setting `DB_TLS=disable` unblocks it, but
re-exposes the `caching_sha2_password` restart bug the TLS path exists to avoid —
prefer fixing TLS over turning it off.

---

## 11. Teardown

Deleting the Railway project destroys the services **and their volumes** —
MySQL, InfluxDB, MinIO objects and Mosquitto state all go with it. Export
anything you need first. No local files are written by the deployment, so there
is nothing to clean up in the repository.

---

## What changed from the retired OCI deployment

| Area | OCI (removed) | Railway (this) |
| :--- | :--- | :--- |
| Provisioning | Terraform + cloud-init + shell scripts | Railway dashboard / CLI |
| TLS on MQTT | Let's Encrypt on 8883 | **none** — raw TCP proxy on a password-protected listener |
| Hostname | `sslip.io` from the instance IP | Railway-provided domains |
| Secrets | generated by `deploy-stack.sh` into `deploy/compose/.env` | Railway variables |
| Dependencies | one VM, Compose | seven managed services |
| Node-RED state | bind-mounted `iot/node-red` | baked into the image, stateless |
