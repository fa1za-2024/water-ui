#!/bin/bash
# =============================================================================
# Water UI - LOCAL DEVELOPMENT ONLY MySQL grants
#
# Why this exists:
#   `prisma migrate dev` creates and drops a temporary "shadow database" to
#   detect schema drift. That requires CREATE DATABASE / DROP DATABASE, but the
#   image only grants MYSQL_USER privileges on the single MYSQL_DATABASE schema
#   - so migrate dev fails with:
#       P3014: Prisma Migrate could not create the shadow database
#       P1010: User was denied access on the database
#
#   This script widens the app user's privileges so the documented
#   `npm run prisma:migrate` workflow works out of the box.
#
# PRODUCTION NOTE:
#   Do not ship this. Use a least-privilege application user and apply schema
#   changes with `prisma migrate deploy`, which does NOT need a shadow database.
#
# Runs once, on first container start with an empty data directory.
# =============================================================================
set -e

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-SQL
	GRANT ALL PRIVILEGES ON *.* TO '${MYSQL_USER}'@'%' WITH GRANT OPTION;
	FLUSH PRIVILEGES;
SQL

echo "[water-ui] granted dev migration privileges to '${MYSQL_USER}'"
