/**
 * Node-RED settings for the Water UI IoT pipeline.
 *
 * This file is mounted at /data/settings.js (see ../../docker-compose.yml).
 * Keep it minimal - anything not listed here falls back to the Node-RED
 * defaults, which are sensible for local development.
 */
// --- Editor authentication ---------------------------------------------------
// Enabled only when NODE_RED_ADMIN_PASSWORD_HASH is present, so this same file
// still works unchanged for local development, which does not set it.
//
// The editor can rewrite the whole pipeline - including the InfluxDB token and
// the Telegram bot token - so leaving it open on an internet-facing host would
// hand over the data store. Both deployment paths (Compose and Railway)
// therefore always set it.
//
// Generate a hash with (bcryptjs ships inside the node-red image). The
// `--entrypoint node` is required: the image's entrypoint would otherwise take
// the -e script as Node-RED arguments and start the editor instead.
//   docker run --rm --entrypoint node nodered/node-red -e \
//     "console.log(require('bcryptjs').hashSync(process.argv[1], 8))" 'your-password'
const adminUser = process.env.NODE_RED_ADMIN_USER || 'admin';
const adminPasswordHash = process.env.NODE_RED_ADMIN_PASSWORD_HASH;

// --- MQTT broker host --------------------------------------------------------
// flows.json points the mqtt-broker config node at "${MQTT_HOST}", which
// Node-RED substitutes when it loads the flows - so the variable must be set
// before the runtime starts, not after. Compose supplies the `mosquitto`
// service name; Railway supplies the broker's private domain
// (mosquitto.railway.internal), because service names do not resolve there.
// This default keeps a bare `node-red` run working with no environment at all.
process.env.MQTT_HOST = process.env.MQTT_HOST || 'mosquitto';

module.exports = {
    // Editor + runtime port inside the container.
    uiPort: process.env.PORT || 1880,

    // The pipeline itself lives here.
    flowFile: 'flows.json',

    // Encrypts credentials stored in flows_cred.json. Override in .env.
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || 'water-ui-dev-credential-secret',

    // Editor login. Spread in only when a hash is configured, so development
    // keeps its open editor while production cannot start without a login.
    ...(adminPasswordHash
        ? {
              adminAuth: {
                  type: 'credentials',
                  users: [
                      {
                          username: adminUser,
                          password: adminPasswordHash,
                          permissions: '*'
                      }
                  ]
              }
          }
        : {}),

    // Function nodes only need Node core + env.get(), so external modules off.
    functionExternalModules: false,

    // Quiet, structured container logs.
    logging: {
        console: {
            level: 'info',
            metrics: false,
            audit: false
        }
    },

    // Projects (git-backed flow versioning) stay off for local dev.
    editorTheme: {
        projects: {
            enabled: false
        }
    }
};
