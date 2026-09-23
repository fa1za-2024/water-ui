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
// before the runtime starts, not after. The broker is now the external EMQX
// Serverless cluster (port 8883, TLS, username/password), so this default is the
// real host rather than a compose service name.
process.env.MQTT_HOST =
    process.env.MQTT_HOST || 'n1119107.ala.asia-southeast1.emqxsl.com';

module.exports = {
    // Editor + runtime port inside the container.
    uiPort: process.env.PORT || 1880,

    // The pipeline itself lives here.
    flowFile: 'flows.json',

    // Credential encryption is OFF by default so the committed flows_cred.json -
    // which holds the ${MQTT_USERNAME} / ${MQTT_PASSWORD} placeholders, never the
    // real values - is read as plaintext and substituted at runtime. Setting
    // NODE_RED_CREDENTIAL_SECRET turns encryption back on, but then credentials
    // must be (re)entered in the editor because the file is encrypted.
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || false,

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
