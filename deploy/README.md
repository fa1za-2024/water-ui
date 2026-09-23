# Deploying Water UI

Water UI is deployed to **Railway** as seven services: MySQL and InfluxDB from
Railway's database templates, plus the backend, frontend, Node-RED, Mosquitto
and MinIO built from this repository.

## Start here

**[`railway/README.md`](railway/README.md)** — the full guide: the service
inventory, the per-service variable matrix, volumes, networking (including the
Mosquitto TCP proxy), first deploy, verification, operations and troubleshooting.

## What lives in this directory

| Path | What it is |
| :--- | :--- |
| `railway/README.md` | The deployment guide. |
| `railway/mosquitto/` | Mosquitto broker image, config and start script for Railway. |
| `railway/minio/` | MinIO (S3) image wrapper for Railway. |

## Where the rest of the Railway config lives

Railway reads `railway.json` from each service's **root directory**, so three of
them sit next to the code they build rather than under `deploy/`:

| Service | Root directory | Config |
| :--- | :--- | :--- |
| backend | `backend/` | `backend/railway.json` |
| frontend | `frontend/` | `frontend/railway.json` |
| node-red | `iot/node-red/` | `iot/node-red/railway.json` |
| mosquitto | `deploy/railway/mosquitto/` | `deploy/railway/mosquitto/railway.json` |
| minio | `deploy/railway/minio/` | `deploy/railway/minio/railway.json` |

---

## Local development is separate

Running the whole stack on your machine still uses the repository root's
`docker-compose.yml` and is unaffected by the deployment configuration. See
[`../docs/running-locally.md`](../docs/running-locally.md).

> **Note:** the previous Oracle Cloud (OCI) deployment has been retired and
> removed — its Terraform configuration, `cloud-init.yaml`, production Compose
> file and `deploy-stack.sh`/certificate scripts are gone. Railway is now the
> only supported deployment target.
