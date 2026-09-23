# syntax=docker/dockerfile:1
# =============================================================================
# Water UI - Node-RED image for Railway
#
# The compose stack bind-mounts ./iot/node-red onto /data and runs `npm install`
# there at start. Railway has no bind mounts, so the tracked project files are
# baked into /data at build time instead.
#
# Only the five TRACKED files are copied. Runtime state (.config.*,
# .sessions.json, .npm/, lib/) is git-ignored and must not be baked in: editor
# auth comes from NODE_RED_ADMIN_PASSWORD_HASH and the InfluxDB/Telegram
# credentials come from environment variables via env.get() inside flows.json.
#
# flows_cred.json IS copied now. It holds the ${MQTT_USERNAME}/${MQTT_PASSWORD}
# placeholders for the external broker, which Node-RED substitutes at runtime -
# the real values never enter the image or the repository (T-3.3).
#
# The base image no longer installs /data/package.json on start, so the extra
# palette node (node-red-contrib-telegrambot) is installed here.
# =============================================================================
FROM nodered/node-red:latest

USER root

COPY flows.json settings.js flows_cred.json package.json package-lock.json /data/

RUN cd /data \
    && npm install --no-fund --no-audit --omit=dev \
    && chown -R node-red:node-red /data

USER node-red

EXPOSE 1880
