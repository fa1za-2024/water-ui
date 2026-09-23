/**
 * ============================================================================
 * Water UI - XIAO ESP32C3 water quality publisher
 * ============================================================================
 *
 * Publishes pH / turbidity / battery / RSSI telemetry as JSON over MQTT to the
 * external EMQX Serverless broker over TLS, which Node-RED consumes and writes
 * to InfluxDB.
 *
 *   ESP32C3 --MQTT/TLS(sensors/<BOARD_ID>/data)--> EMQX --> Node-RED --> InfluxDB
 *
 * Board:    Seeed Studio XIAO ESP32C3   (Arduino core: esp32 by Espressif)
 * Library:  PubSubClient by Nick O'Leary  (Library Manager: "PubSubClient")
 *
 * QUICK START - EXTERNAL BROKER (EMQX Serverless)
 *   1. Fill in WIFI_SSID / WIFI_PASSWORD below.
 *   2. MQTT_HOST / MQTT_PORT / MQTT_USER / MQTT_PASSWORD / MQTT_CA_CERT are
 *      already set for the EMQX Serverless cluster documented in
 *      docs/emqx broker.txt. MQTT_USE_TLS is 1 because that broker is TLS-only
 *      (port 8883).
 *   3. Set BOARD_ID to the same value as boards.board_id in MySQL.
 *   4. Calibrate the three sensor constants further down.
 *   5. Flash, then open the Serial Monitor at 115200 baud.
 *
 *   SECURITY: MQTT_USER / MQTT_PASSWORD are deliberately left blank. Copy them
 *   from docs/emqx broker.txt, which is git-ignored and stays on the developer's
 *   machine - real broker credentials must never be committed to this public repo.
 *
 * QUICK START - LOCAL LAN (self-hosted Mosquitto, if ever re-added)
 *   1. Set MQTT_HOST to the LAN IP of the broker (127.0.0.1 will NOT work).
 *   2. Set MQTT_USE_TLS to 0 and clear MQTT_USER / MQTT_PASSWORD.
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
// 1 = MQTT over TLS on 8883. Required by the external EMQX Serverless broker,
//     whose only MQTT listener is TLS.
// 0 = plaintext MQTT, for a trusted LAN broker only (no certificate to verify).
#define MQTT_USE_TLS     1

#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// External EMQX Serverless broker - see docs/emqx broker.txt.
// The self-hosted Mosquitto (and its Railway TCP proxy) has been retired, so
// there is no LAN/Railway host to choose between any more.
#define MQTT_HOST        "n1119107.ala.asia-southeast1.emqxsl.com"

#if MQTT_USE_TLS
  #define MQTT_PORT      8883
#else
  // Plaintext fallback for a LAN broker.
  #define MQTT_PORT      1883
#endif

// EMQX Serverless authenticates every listener, so both values are required.
// Fill them in from docs/emqx broker.txt, which is git-ignored - never commit
// real broker credentials to this public repository.
#define MQTT_USER        ""
#define MQTT_PASSWORD    ""

#if MQTT_USE_TLS
// --- CA certificate ---------------------------------------------------------
// The EMQX Serverless certificate chains to DigiCert Global Root G2. This is the
// CA supplied with the cluster (see docs/emqxsl-ca.crt), pinned here so the
// device verifies the broker it is told to trust.
//
// WHY NOT setInsecure():
//   It skips verification entirely. Anyone able to intercept traffic could then
//   impersonate the broker, harvest MQTT_PASSWORD and inject fake water-quality
//   readings - which is the exact thing this system exists to detect. The
//   device only ever connects to one known host, so pinning its CA costs
//   nothing.
static const char MQTT_CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI
2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx
1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ
q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz
tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ
vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV
5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY
1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4
NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG
Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91
8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe
pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl
MrY=
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
