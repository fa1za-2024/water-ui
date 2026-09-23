Water UI — Simplification Action Plan
Decision: Keep Socket.io. It is a library, not a Railway service, and it stays as the live-update path.

Important: Do not implement this before tomorrow’s presentation. Use the current working stack for the demo. This plan is for after the demo.

1. Final Decisions
#	Decision	Effect
1	Remove avatar feature	No upload UI, no DB column, no storage
2	Remove MinIO	Delete minio service and all MINIO_* variables
3	Remove Node-RED	Delete node-red service and public flow editor
4	Port Node-RED function nodes to Node.js	New backend/src/services/ingestService.ts
5	Use external MQTT broker	Delete self-hosted mosquitto and TCP proxy
6	Keep Socket.io	No change; still used for live dashboard updates
2. Target Architecture
text
backend  (Express API + Socket.io + MQTT ingest + Telegram)
   │
   ├── MySQL       (boards; users optional)
   ├── InfluxDB    (telemetry)
   └── External MQTT broker (HiveMQ / EMQX / managed Mosquitto)
Optional later: merge the React build into backend to remove the frontend service.

3. Railway Service List
Stage	Services	Count
Today	backend, frontend, MySQL, InfluxDB, mosquitto, minio, node-red	7
After Phase 1	backend, frontend, MySQL, InfluxDB, mosquitto, node-red	6
After Phase 2	backend, frontend, MySQL, InfluxDB, mosquitto	5
After Phase 3	backend, frontend, MySQL, InfluxDB	4
After optional L1	backend, MySQL, InfluxDB	3
Removed services: minio, node-red, mosquitto
Kept library: socket.io / socket.io-client
New resource: none required (avatars removed, so no volume)

4. Phase 0 — Preparation
□ Create branch: simplify/remove-minio-nodered-mosquitto
□ Back up Railway environment variables
□ Verify local docker compose stack works end-to-end
□ Note current Railway service IDs
□ Open T-4xx tasks in tracker (Rule 8)
5. Phase 1 — Remove Avatar & MinIO
Goal: Delete avatar feature and MinIO service.

Task	Action
T-1.1	Remove avatar upload UI from frontend/src/components/profile/ProfileModal.jsx
T-1.2	Remove uploadAvatar from frontend/src/api/authApi.js
T-1.3	Delete POST /upload-avatar from backend/src/routes/userRoutes.ts
T-1.4	Delete uploadAvatar handler and ensureBucket() from backend/src/controllers/userController.ts
T-1.5	Delete backend/src/config/minio.ts
T-1.6	Remove profilePictureUrl from backend/prisma/schema.prisma and create migration
T-1.7	Remove dependencies: minio, multer, @types/multer (if unused)
T-1.8	Delete minio service from Railway
T-1.9	Delete deploy/railway/minio/
T-1.10	Remove minio and minio-init from docker-compose.yml
T-1.11	Remove all MINIO_* variables from .env.example, backend/.env.example, and Railway
Acceptance: App builds, login works, profile shows initials, no MinIO service running.

6. Phase 2 — Replace Node-RED with Node.js Ingest Service
Goal: Move all Node-RED function-node logic into the backend.

New file
text
backend/src/services/ingestService.ts
Responsibilities
Subscribe to sensors/+/data

Parse parseFloat / parseInt

Derive wq_status, batt_level, wifi_status

Write to InfluxDB

Emit over Socket.io

Send rate-limited Telegram alert

Tasks
Task	Action
T-2.1	Extract exact thresholds from iot/node-red/flows.json
T-2.2	Create ingestService.ts skeleton with MQTT client
T-2.3	Implement normalizeReading() and derivation functions
T-2.4	Reuse existing InfluxDB write logic
T-2.5	Emit sensor-update via Socket.io
T-2.6	Implement Telegram alert with cooldown
T-2.7	Wire startIngest(io) into backend/src/index.ts
T-2.8	Wire stopIngest() into backend/src/lifecycle.ts
T-2.9	Add env vars: MQTT_*, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
T-2.10	Test end-to-end with local Mosquitto
T-2.11	Delete node-red service from Railway
T-2.12	Delete iot/node-red/, deploy/railway/node-red/, docs/node-red.md
T-2.13	Remove NODE_RED_* and BACKEND_URL variables
Acceptance: Device/Simulator → MQTT → backend → InfluxDB + Socket.io + Telegram works without Node-RED.

7. Phase 3 — Switch to External MQTT Broker
Goal: Remove self-hosted Mosquitto and TCP proxy.

Task	Action
T-3.1	Choose broker: HiveMQ Cloud or EMQX Cloud Serverless
T-3.2	Create cluster and note hostname, port 8883, username, password
T-3.3	Set backend env: MQTT_HOST, MQTT_PORT=8883, MQTT_USERNAME, MQTT_PASSWORD, MQTT_USE_TLS=true
T-3.4	Ensure backend uses mqtts:// or TLS options
T-3.5	Update ESP32 firmware: MQTT_HOST, MQTT_PORT=8883, MQTT_USE_TLS=1
T-3.6	Test with frontend Simulator
T-3.7	Delete mosquitto service and TCP proxy from Railway
T-3.8	Delete deploy/railway/mosquitto/
T-3.9	Remove mosquitto from docker-compose.yml and delete its volume
Acceptance: Simulator/device publishes to cloud broker; backend receives and processes; no local Mosquitto.

8. Phase 4 — Documentation & Cleanup
Task	Action
T-4.1	Update MASTER_CONTEXT.md: remove MinIO, Node-RED, Mosquitto
T-4.2	Update docs/technology.md
T-4.3	Update docs/modules.md
T-4.4	Update docs/database.md (remove profile_picture_url)
T-4.5	Update deploy/railway/README.md
T-4.6	Update .env.example files
T-4.7	Delete stale docs: docs/MASTER_CONTEXT.md.bak, root node-red.md (T-503)
T-4.8	Update docker-compose.yml
T-4.9	Mark tasks [x] with evidence
Acceptance: Documentation matches new architecture.

9. Phase 5 — Optional: Merge Frontend into Backend (L1)
Goal: Remove frontend service and reach 3 services.

Task	Action
T-5.1	Add frontend build stage to backend/Dockerfile
T-5.2	Copy Vite dist/ into backend image
T-5.3	Add express.static() + SPA fallback in backend/src/index.ts
T-5.4	Remove CORS_ORIGIN
T-5.5	Remove BACKEND_UPSTREAM
T-5.6	Delete frontend service and frontend/railway.json
T-5.7	Delete frontend/nginx.conf.template
Acceptance: SPA loads from backend domain; /api and /socket.io work; 3 services total.

10. Socket.io Decision
Item	Decision
Keep Socket.io?	Yes
Why?	It is not a Railway service; it already works; removing it adds risk with no service-count benefit
Alternative if ever needed	SSE or plain ws
When to consider	Only after Phases 1–4 are complete and tested