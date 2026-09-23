# syntax=docker/dockerfile:1
# Water UI - backend image (Express API + Socket.io, TypeScript)
#
# Debian slim rather than alpine: bcrypt and the Prisma/MariaDB native bits
# resolve prebuilt binaries far more reliably against glibc.

# --- Stage 1: generate the Prisma client and compile TypeScript -------------
FROM node:24-slim AS build
WORKDIR /app

# Prisma 7 loads prisma.config.ts for EVERY CLI command, and that file resolves
# the datasource with prisma/config's `env('DATABASE_URL')`, which THROWS when
# the variable is unset:
#
#   PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL
#
# `prisma generate` therefore cannot run in a bare build stage - even though it
# only reads the schema and never opens a connection. This placeholder satisfies
# the loader. It is scoped to the build stage on purpose, so it does NOT leak
# into the runtime image where a wrong-but-present URL would be worse than a
# clear failure; compose supplies the real DATABASE_URL at run time.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"

COPY package*.json ./
# `npm ci` needs a lockfile; fall back to `npm install` on a fresh checkout.
RUN npm ci || npm install

# Prisma's schema engine needs OpenSSL, and node:*-slim does not ship it. Without
# this, every CLI command prints:
#
#   prisma:warn Prisma failed to detect the libssl/openssl version to use, and
#   may not work as expected. Defaulting to "openssl-1.1.x".
#   ... Please manually install OpenSSL via `apt-get install -y openssl`
#
# It happens to still work for `generate` and for a no-op `migrate deploy`, but
# the guess is wrong on a Debian image carrying OpenSSL 3.x and the engine is
# most fragile exactly where it matters most: applying a migration to an EMPTY
# database, which is exactly what a first Railway deploy does (the backend
# service runs `prisma migrate deploy` as its preDeployCommand).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY prisma ./prisma
# Prisma 7 generates a TypeScript client into src/generated/prisma.
RUN npx prisma generate

COPY src ./src
# tsc: src/**.ts -> dist/**.js (CommonJS), including the generated client.
RUN npm run build

# --- Stage 2: production runtime ------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
# devDependencies are installed ON PURPOSE: the Prisma CLI (`migrate deploy`)
# and tsx (the seed script) are devDependencies, and both are needed inside the
# container.
#
# `--include=dev` is NOT redundant. `NODE_ENV=production` is set above, and npm
# reads that as "omit devDependencies", so a plain `npm ci` here silently skips
# tsx entirely. The failure is delayed and confusing:
#
#   npm run prisma:deploy  -> works (prisma also arrives transitively)
#   npm run prisma:seed    -> "sh: 1: tsx: not found"
#
# which is exactly the first-deploy path. Passing the flag explicitly keeps this
# correct even if the ENV line above is ever moved.
RUN npm ci --include=dev || npm install --include=dev

# Needed here too, not only in the build stage: this is the image where the
# Prisma CLI actually runs. Railway's preDeployCommand runs `prisma migrate
# deploy` in this container, and the seed script runs here too.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Compiled output already contains dist/generated (the Prisma client).
COPY --from=build /app/dist ./dist

# The generated client again, as TypeScript, under src/.
#
# The API runs from dist/ and does not need this, but prisma/seed.ts is executed
# by tsx straight from source and imports the client as
# '../src/generated/prisma/client'. Without this copy, `npm run prisma:seed`
# dies with:
#
#   Error: Cannot find module '../src/generated/prisma/client'
#   Require stack: - /app/prisma/seed.ts
#
# which is a first-deploy failure, since seeding creates the one profile the
# dashboard logs in with. Only the generated client is copied - not all of
# src/ - so the sources themselves stay out of the runtime image.
COPY --from=build /app/src/generated ./src/generated

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./

EXPOSE 5000

# Migrations are NOT run here on purpose, so that a bad migration fails the
# deploy instead of crash-looping the container:
#   Railway     - railway.json preDeployCommand: `npx prisma migrate deploy`
#                 (seed once with `railway run npm run prisma:seed`)
#   local       - docker compose --profile app exec backend npx prisma migrate deploy
#                 docker compose --profile app exec backend npm run prisma:seed
CMD ["node", "dist/index.js"]
