# syntax=docker/dockerfile:1
# =============================================================================
# Water UI - MinIO image for Railway
#
# Thin wrapper over the official image. Compose passes the server command in
# docker-compose.yml (`command: server /data --console-address ":9001"`), but
# Railway has no equivalent per-service command field for this setup, so the
# command is baked in here.
#
# The base image's /usr/bin/docker-entrypoint.sh prepends `minio` when the first
# argument is not already `minio` (verified by reading the script), so the CMD
# below resolves to:
#
#   minio server /data --address :9000 --console-address :9001
#
# WHY --address IS PINNED: Railway injects a PORT variable and health-checks that
# port, and MinIO ignores PORT - it listens on 9000 unless told otherwise. So the
# service MUST also carry the variable PORT=9000 in the Railway dashboard (see
# the deploy guide). Pinning --address here makes MinIO's side of that agreement
# explicit rather than relying on its default.
#
# The console (:9001) is not published on Railway: it would need its own port and
# domain, and the API/backend only need the S3 endpoint. Set MINIO_BROWSER=off to
# skip it entirely.
# =============================================================================
FROM quay.io/minio/minio:latest

CMD ["server", "/data", "--address", ":9000", "--console-address", ":9001"]
