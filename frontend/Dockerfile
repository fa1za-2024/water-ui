# syntax=docker/dockerfile:1
# Water UI - frontend image (multi-stage: build with Node, serve with nginx)

# --- Stage 1: build the static bundle --------------------------------------
FROM node:24-slim AS build
WORKDIR /app

COPY package*.json ./
# `npm ci` needs a lockfile; fall back to `npm install` on a fresh checkout.
RUN npm ci || npm install

COPY . .
RUN npm run build

# --- Stage 2: serve ---------------------------------------------------------
FROM nginx:alpine AS runtime

# Defaults keep the Compose / self-hosted path byte-for-byte unchanged. Railway
# overrides both with service variables (PORT=<assigned>, BACKEND_UPSTREAM=
# http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080) - see nginx.conf.template.
ENV PORT=80
ENV BACKEND_UPSTREAM=http://backend:5000
# Fallback only - 05-resolver.envsh overwrites this with the container's real
# nameserver so nginx can re-resolve the backend after it is redeployed.
ENV DNS_RESOLVER=127.0.0.11

# Proxies /api and /socket.io to the backend service, and SPA-fallbacks to
# index.html. The stock nginx entrypoint envsubst's /etc/nginx/templates/*.template
# into /etc/nginx/conf.d/ at container start.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Sourced by that entrypoint before envsubst runs, so ${DNS_RESOLVER} is populated.
COPY docker-entrypoint.d/05-resolver.envsh /docker-entrypoint.d/05-resolver.envsh
RUN chmod +x /docker-entrypoint.d/05-resolver.envsh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
