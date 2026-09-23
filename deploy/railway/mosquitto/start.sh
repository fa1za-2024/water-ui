#!/bin/ash
# =============================================================================
# Water UI - Mosquitto start script (Railway)
#
# This runs as the container CMD, i.e. AFTER the image's stock
# /docker-entrypoint.sh has chown'd /mosquitto/data and exec'd us. Its only job
# is to turn the MQTT_USERNAME / MQTT_PASSWORD service variables into the
# password file that listener 1884 (the TCP-proxied, internet-facing one)
# requires, then hand over to the broker.
# =============================================================================
set -eu

PUID="${PUID:-1883}"
PGID="${PGID:-1883}"

: "${MQTT_USERNAME:=waterui}"

if [ -z "${MQTT_PASSWORD:-}" ]; then
    echo "[mosquitto] FATAL: MQTT_PASSWORD is required - listener 1884 is reachable" >&2
    echo "[mosquitto] from the internet through the Railway TCP proxy." >&2
    exit 1
fi

mkdir -p /mosquitto/passwd /mosquitto/log
chown -R "${PUID}:${PGID}" /mosquitto/passwd /mosquitto/data /mosquitto/log 2>/dev/null || true

# -c overwrites the file, so the environment variable is the single source of
# truth: changing MQTT_PASSWORD in Railway takes effect on the next restart.
mosquitto_passwd -b -c /mosquitto/passwd/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"

# mosquitto_passwd writes 0600 root:root and the broker drops to uid 1883 before
# reading it, so without this it exits with "Unable to open pwfile".
chown "${PUID}:${PGID}" /mosquitto/passwd/passwd 2>/dev/null || true
chmod 0640 /mosquitto/passwd/passwd

echo "[mosquitto] starting: 1883 anonymous (private), 1884 password (TCP proxy)"
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
