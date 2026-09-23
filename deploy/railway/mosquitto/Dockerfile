# syntax=docker/dockerfile:1
# =============================================================================
# Water UI - Mosquitto image for Railway
#
# The stock /docker-entrypoint.sh is kept on purpose: it chowns /mosquitto/data
# (PUID/PGID 1883) and then execs the CMD below. start.sh needs root to write
# and chown the password file, which is why it stays the entrypoint's child
# rather than being baked into a non-root image.
# =============================================================================
FROM eclipse-mosquitto:2

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY start.sh /usr/local/bin/water-ui-mosquitto-start.sh
RUN chmod +x /usr/local/bin/water-ui-mosquitto-start.sh

CMD ["/usr/local/bin/water-ui-mosquitto-start.sh"]
