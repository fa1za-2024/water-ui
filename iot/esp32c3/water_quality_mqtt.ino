/**
 * ============================================================================
 * Water UI - XIAO ESP32C3 water quality publisher
 * ============================================================================
 *
 * Publishes pH / turbidity / battery / RSSI telemetry as JSON over MQTT to the
 * Mosquitto broker, which Node-RED consumes and writes to InfluxDB.
 *
 *   ESP32C3 --MQTT(sensors/<BOARD_ID>/data)--> Mosquitto --> Node-RED --> InfluxDB
 *
 * Board:    Seeed Studio XIAO ESP32C3   (Arduino core: esp32 by Espressif)
 * Library:  PubSubClient by Nick O'Leary  (Library Manager: "PubSubClient")
 *
 * QUICK START - LOCAL LAN
 *   1. Fill in WIFI_SSID / WIFI_PASSWORD / MQTT_HOST below.
 *      MQTT_HOST is the LAN IP of the machine running `docker compose up -d`
 *      (Windows: `ipconfig` -> IPv4 Address). 127.0.0.1 will NOT work.
 *   2. Leave MQTT_USE_TLS at 0 and MQTT_USER / MQTT_PASSWORD empty.
 *   3. Set BOARD_ID to the same value as boards.board_id in MySQL.
 *   4. Calibrate the three sensor constants further down.
 *   5. Flash, then open the Serial Monitor at 115200 baud.
 *
 * QUICK START - PRODUCTION (Railway)
 *   1. MQTT_HOST = the Mosquitto service's TCP proxy host, i.e.
 *      RAILWAY_TCP_PROXY_DOMAIN (e.g. shuttle.proxy.rlwy.net). NOT the
 *      *.railway.internal name - that only resolves inside Railway.
 *   2. MQTT_PORT = RAILWAY_TCP_PROXY_PORT (a high random port), NOT 1883.
 *   3. Leave MQTT_USE_TLS at 0: Railway's TCP proxy is raw TCP and does not
 *      terminate TLS, so there is nothing to verify.
 *   4. MQTT_USER / MQTT_PASSWORD = the MQTT_USERNAME / MQTT_PASSWORD service
 *      variables set on the Mosquitto service. The proxied listener rejects
 *      anonymous clients, so both are required.
 *   5. Read the security note in deploy/railway/README.md first: those
 *      credentials and every reading cross the public internet in the clear.
 *
 * NOTE ON QoS: PubSubClient can only PUBLISH at QoS 0, so QoS 2 subscriptions
 * in Node-RED are satisfied with QoS 0 delivery. See docs/mqtt-topics.md.
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>

// ---------------------------------------------------------------------------
// Configuration - edit these
// ---------------------------------------------------------------------------

// --- TLS switch -------------------------------------------------------------
// 0 = plaintext MQTT. Correct on a trusted LAN, and also correct for Railway:
//     its TCP proxy is raw TCP and does not terminate TLS, so there is no
//     broker certificate to verify.
// 1 = MQTT over TLS on 8883. Only for a broker you have fronted with your own
//     TLS-terminating proxy; flipping this also requires MQTT_CA_CERT below and
//     a real MQTT_USER/MQTT_PASSWORD.
//
// Encryption and authentication are independent: on Railway the connection is
// authenticated but NOT encrypted.
#define MQTT_USE_TLS     0

#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// LAN development: the LAN IP of the host running `docker compose up -d`
// (127.0.0.1 will NOT work).
// Production (Railway): the TCP proxy host on the Mosquitto service ->
//   Settings -> Networking -> TCP Proxy  (RAILWAY_TCP_PROXY_DOMAIN), e.g.
//   shuttle.proxy.rlwy.net
// NOT the *.railway.internal private name, which only resolves inside Railway.
#define MQTT_HOST        "192.168.1.100"

#if MQTT_USE_TLS
  #define MQTT_PORT      8883
#else
  // Plaintext. LAN: leave at 1883. Railway: set this to the proxy's own port
  // (RAILWAY_TCP_PROXY_PORT, a high random number) - NOT 1883, which is the
  // private, never-proxied listener that only Railway services can reach.
  #define MQTT_PORT      1883
#endif

// Leave blank ONLY while mosquitto has `listener_allow_anonymous true`, which is
// local development. The proxied production listener rejects anonymous clients,
// so both values must be set to the MQTT_USERNAME / MQTT_PASSWORD variables on
// the Mosquitto service.
#define MQTT_USER        ""
#define MQTT_PASSWORD    ""

#if MQTT_USE_TLS
// --- CA certificate ---------------------------------------------------------
// VERIFY THIS AGAINST THE SERVER. Do not trust a copy pasted from a forum.
//
// Only used with MQTT_USE_TLS=1, i.e. against a broker you fronted with your
// own TLS-terminating proxy. Railway's TCP proxy does NOT do TLS, so this block
// compiles out on the Railway path.
//
// Paste the CA that signed YOUR broker's certificate (for a Let's Encrypt leaf
// that is ISRG Root X1, valid until 2035, so it is a set-and-forget value):
//
//   curl -sS https://letsencrypt.org/certs/isrgrootx1.pem
//
// then paste the whole PEM block between the markers, replacing everything.
//
// WHY NOT setInsecure():
//   It skips verification entirely. Anyone able to intercept traffic could then
//   impersonate the broker, harvest MQTT_PASSWORD and inject fake water-quality
//   readings - which is the exact thing this system exists to detect. The
//   device only ever connects to one known host, so pinning its CA costs
//   nothing.
static const char MQTT_CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
REPLACE_THIS_ENTIRE_BLOCK_WITH_THE_CONTENTS_OF_isrgrootx1.pem
-----END CERTIFICATE-----
)EOF";
#endif

// Logical board id - must match boards.board_id in MySQL and the InfluxDB tag.
// If left empty, the Wi-Fi MAC address is used instead.
#define BOARD_ID         "AA240238"

#define PUBLISH_INTERVAL_MS  30000UL       // one reading every 30 seconds
#define ANALOG_SAMPLES       32            // averaged ADC samples per reading

// ---------------------------------------------------------------------------
// Pins (XIAO ESP32C3 analog inputs)
//   A0 = GPIO2, A1 = GPIO3, A2 = GPIO4, A3 = GPIO5   - all 3.3V, 12-bit
// ---------------------------------------------------------------------------
#define PIN_PH           A0
#define PIN_TURBIDITY    A1
#define PIN_BATTERY      A2

// ---------------------------------------------------------------------------
// Calibration - MEASURE YOUR OWN SENSORS, these are starting points only
// ---------------------------------------------------------------------------
const float ADC_VREF     = 3.3f;     // ESP32-C3 ADC reference
const float ADC_MAX_COUNT = 4095.0f; // 12-bit

// pH probe board: ~2.50V in a pH 7.00 buffer, ~0.18V change per pH unit.
// Typical boards invert the slope (higher pH -> lower voltage), hence the
// subtraction in readPH().
const float PH_NEUTRAL_VOLTAGE      = 2.50f;
const float PH_VOLTS_PER_PH_UNIT    = 0.18f;

// Turbidity: the sensor's clean-water output must be divided down to <= 3.3V
// before it reaches the ADC. Values below are AFTER that divider.
const float TURBIDITY_CLEAN_VOLTAGE = 3.00f;   // clear water
const float TURBIDITY_DIRTY_VOLTAGE = 0.30f;   // very turbid water
const float TURBIDITY_MAX_NTU       = 3000.0f;

// Battery: set to 1.0 for a direct connection, 2.0 for a 1:2 divider, etc.
const float BATTERY_DIVIDER_RATIO = 2.0f;

// ---------------------------------------------------------------------------
// Both WiFiClient and WiFiClientSecure derive from Arduino's Client, which is
// what PubSubClient takes, so the rest of the code is identical either way.
//
// This include lives here, not at the top of the file, on purpose:
// `#if MQTT_USE_TLS` is evaluated by the preprocessor as it reads top to bottom,
// and the switch is only #defined further up in the configuration block. Placing
// the include above that #define would silently evaluate to 0 and the build
// would fail on an unknown type instead of including the header.
#if MQTT_USE_TLS
  #include <WiFiClientSecure.h>
  WiFiClientSecure espClient;
#else
  WiFiClient       espClient;
#endif

PubSubClient mqtt(espClient);

char topicData[64];
char topicStatus[64];
unsigned long lastPublish = 0;

// ---------------------------------------------------------------------------
float readAverageVoltage(int pin) {
    uint32_t total = 0;
    for (int i = 0; i < ANALOG_SAMPLES; i++) {
        total += analogRead(pin);
        delay(2);
    }
    float counts = (float)total / (float)ANALOG_SAMPLES;
    return (counts / ADC_MAX_COUNT) * ADC_VREF;
}

float readPH() {
    float voltage = readAverageVoltage(PIN_PH);
    float ph = 7.0f + (PH_NEUTRAL_VOLTAGE - voltage) / PH_VOLTS_PER_PH_UNIT;
    if (ph < 0.0f)  ph = 0.0f;
    if (ph > 14.0f) ph = 14.0f;
    return ph;
}

float readTurbidityNTU() {
    float voltage = readAverageVoltage(PIN_TURBIDITY);
    float span = TURBIDITY_CLEAN_VOLTAGE - TURBIDITY_DIRTY_VOLTAGE;
    if (span <= 0.0f) return 0.0f;
    float ntu = ((TURBIDITY_CLEAN_VOLTAGE - voltage) / span) * TURBIDITY_MAX_NTU;
    if (ntu < 0.0f) ntu = 0.0f;
    return ntu;
}

float readBatteryVoltage() {
    return readAverageVoltage(PIN_BATTERY) * BATTERY_DIVIDER_RATIO;
}

// ---------------------------------------------------------------------------
void setupTopics() {
    const char* id = strlen(BOARD_ID) > 0 ? BOARD_ID : WiFi.macAddress().c_str();
    snprintf(topicData,   sizeof(topicData),   "sensors/%s/data",   id);
    snprintf(topicStatus, sizeof(topicStatus), "sensors/%s/status", id);
    Serial.printf("[mqtt] data topic:   %s\n", topicData);
    Serial.printf("[mqtt] status topic: %s\n", topicStatus);
}

void connectWiFi() {
    Serial.printf("[wifi] connecting to %s", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.printf("\n[wifi] connected, ip=%s rssi=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

// The ESP32 has no battery-backed clock, so it boots believing it is 1970.
//
// With MQTT_USE_TLS this is fatal rather than cosmetic: mbedTLS validates the
// broker's certificate against the system clock, so a device stuck in 1970
// rejects every certificate as "not yet valid". The resulting handshake error
// says nothing about the clock, which makes it a genuinely confusing failure.
// So the clock is synced before the first TLS attempt, and the wait is
// bounded so a blocked UDP/123 does not hang the device forever.
void syncTime() {
    Serial.print("[ntp] syncing clock");
    configTime(0, 0, "pool.ntp.org", "time.google.com");

    // 1600000000 is Sep 2020 - comfortably past the 1970 default, and any
    // value below it means the sync has not landed yet.
    unsigned long started = millis();
    while (time(nullptr) < 1600000000UL) {
        if (millis() - started > 20000UL) {
            Serial.println(" FAILED (20s)");
            Serial.println("[ntp] TLS handshakes will fail until the clock is real.");
            Serial.println("[ntp] Check that this network does not block UDP/123.");
            return;
        }
        delay(500);
        Serial.print(".");
    }
    Serial.printf(" ok (epoch %lu)\n", (unsigned long)time(nullptr));
}

void connectMQTT() {
    while (!mqtt.connected()) {
        // Board id keeps the MQTT client id unique per device.
        const char* id = strlen(BOARD_ID) > 0 ? BOARD_ID : WiFi.macAddress().c_str();
        Serial.printf("[mqtt] connecting to %s:%d ... ", MQTT_HOST, MQTT_PORT);

        // Last Will and Testament: the broker publishes this if we drop off.
        bool ok = mqtt.connect(id,
                               strlen(MQTT_USER) > 0 ? MQTT_USER : nullptr,
                               strlen(MQTT_PASSWORD) > 0 ? MQTT_PASSWORD : nullptr,
                               topicStatus, 0, true, "offline");
        if (ok) {
            Serial.println("ok");
            mqtt.publish(topicStatus, "online", true);   // retained
        } else {
            Serial.printf("failed (rc=%d), retrying in 5s\n", mqtt.state());
            delay(5000);
        }
    }
}

void publishReading() {
    float ph     = readPH();
    float turbid = readTurbidityNTU();
    float batt   = readBatteryVoltage();
    int   rssi   = WiFi.RSSI();

    // Only include "ts" when the clock is real, otherwise Node-RED would stamp
    // the reading with 1970. Without "ts" Node-RED uses its arrival time.
    time_t now = time(nullptr);
    char tsFragment[32];
    if (now > 1600000000) {
        snprintf(tsFragment, sizeof(tsFragment), ",\"ts\":%lld", (long long)now * 1000LL);
    } else {
        tsFragment[0] = '\0';
    }

    char payload[224];
    snprintf(payload, sizeof(payload),
             "{\"boardID\":\"%s\",\"pH\":%.2f,\"turbidity\":%.2f,"
             "\"batt_voltage\":%.2f,\"rssi\":%d%s}",
             strlen(BOARD_ID) > 0 ? BOARD_ID : WiFi.macAddress().c_str(),
             ph, turbid, batt, rssi, tsFragment);

    bool published = mqtt.publish(topicData, payload);
    Serial.printf("[mqtt] publish %s -> %s\n", published ? "ok" : "FAILED", payload);
}

// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println("\n=== Water UI - XIAO ESP32C3 water quality publisher ===");

    analogReadResolution(12);
    // ~2.5dB attenuation allows readings up to roughly 3.3V.
    analogSetPinAttenuation(PIN_PH,        ADC_11db);
    analogSetPinAttenuation(PIN_TURBIDITY, ADC_11db);
    analogSetPinAttenuation(PIN_BATTERY,   ADC_11db);

    connectWiFi();

    // Before anything TLS, and before the first reading so the payload gets a
    // real "ts" instead of being stamped with its arrival time by Node-RED.
    syncTime();

    setupTopics();

#if MQTT_USE_TLS
    // Detected by name rather than by length: a placeholder of about the right
    // size would sail past a length check and only surface later as an opaque
    // "certificate verify failed".
    if (strstr(MQTT_CA_CERT, "REPLACE_THIS_ENTIRE_BLOCK") != nullptr) {
        Serial.println();
        Serial.println("[tls] FATAL: MQTT_CA_CERT is still the placeholder text.");
        Serial.println("[tls] Fetch the CA and paste it into the sketch:");
        Serial.println("[tls]   curl -sS https://letsencrypt.org/certs/isrgrootx1.pem");
        while (true) {
            delay(1000);
        }
    }
    // Pin the single CA this device needs rather than loading the system bundle,
    // which does not fit comfortably in the ESP32C3's ~400 KB of RAM anyway.
    espClient.setCACert(MQTT_CA_CERT);
    Serial.println("[tls] CA pinned, certificate verification enabled");
#else
    Serial.println("[tls] DISABLED - plaintext MQTT, LAN use only");
#endif

    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setKeepAlive(30);
    mqtt.setBufferSize(256);
    connectMQTT();

    publishReading();   // send one immediately so the pipeline can be verified
    lastPublish = millis();
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
    }
    if (!mqtt.connected()) {
        connectMQTT();
    }
    mqtt.loop();

    if (millis() - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = millis();
        publishReading();
    }
}
