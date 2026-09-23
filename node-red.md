# MQTT & Node-RED Setup Guide for Water UI

This guide provides step-by-step instructions to configure an MQTT connection with Node-RED and process incoming IoT sensor data. This forms the core data pipeline for the **Water UI** dashboard, enabling real-time monitoring, InfluxDB storage, and Telegram alerts.

---

## 📋 Prerequisites

Before you begin, ensure you have the following ready:
- **Node-RED Installed:** Your Node-RED server is up and running.
- **MQTT Broker Details:** Connection information for your MQTT broker (e.g., Mosquitto or EMQX).
  - Broker address (e.g., `test.mosquitto.org` or your server IP)
  - Port (default: `1883` for non-TLS, `8883` for TLS)
  - Optional: Username and Password
- **Sensor Payload Format:** Understand the JSON payload your IoT devices publish. For this guide, we use:
  ```json
  {
    "boardID": "mac-address",
    "pH": 12.75,
    "turbidity": 25.00,
    "batt_voltage": 3.4,
    "rssi": -75
  }
 ```

🔌 Step 1: Configure the MQTT Broker Connection in Node-RED
Drag an mqtt in node from the Network palette onto your workspace.

Double-click the node to open its configuration.

Next to the Server field, click the pencil icon to add a new broker connection.

In the new window, fill in your broker's details:

Server: Enter the IP address or hostname of your MQTT broker.

Port: Enter the port (e.g., 1883).

Security: If required, enter a Username and Password. Enable TLS for secure connections.

Click Add to save this broker configuration.

📥 Step 2: Configure the MQTT In Node to Subscribe

With the mqtt in node open, set the Action to "Subscribe to a single topic".

In the Topic field, enter the topic your devices publish to. You can use wildcards:

+ for a single-level wildcard (e.g., sensors/+/data)

# for a multi-level wildcard (e.g., sensors/#)

QoS (Quality of Service): Select QoS 2 for exactly-once delivery, ideal for critical sensor data.

Output: Set this to "a parsed JSON object" so Node-RED automatically converts the incoming string payload into a usable JavaScript object.

Click Done.

⚙️ Step 3: Add the Function Node for Data Processing
This node transforms raw sensor data into the structured format required for InfluxDB and determines the status flags (wq_status, batt_level, wifi_status).

Drag a function node from the Function palette and connect its input to the output of your mqtt in node.

Double-click the function node to open the code editor.

Paste the following JavaScript code:
 ```
 // 1. Extract incoming data from the parsed JSON payload
const payload = msg.payload;
const boardID = payload.boardID;
const pH = parseFloat(payload.pH);
const turbidity = parseFloat(payload.turbidity);
const batt_voltage = parseFloat(payload.batt_voltage);
const rssi = parseInt(payload.rssi);

// 2. Determine wq_status (Water Quality Status)
let wq_status = "Safe";
if (pH < 6.5 || pH > 8.5 || turbidity > 5.0) {
    wq_status = "Unsafe";
} else if (pH < 7.0 || pH > 8.0 || turbidity > 3.0) {
    wq_status = "Warning";
}

// 3. Determine batt_level (Assuming a 3.7V Li-ion battery)
let batt_level = "Full";
if (batt_voltage <= 3.3) {
    batt_level = "Critical";
} else if (batt_voltage <= 3.5) {
    batt_level = "Low";
} else if (batt_voltage <= 3.7) {
    batt_level = "Medium";
}

// 4. Determine wifi_status (Based on RSSI dBm)
let wifi_status = "Excellent";
if (rssi <= -80) {
    wifi_status = "Poor";
} else if (rssi <= -70) {
    wifi_status = "Fair";
} else if (rssi <= -60) {
    wifi_status = "Good";
}

// 5. Create the standardized timestamp (RFC3339 format for InfluxDB)
const time = new Date().toISOString();

// 6. Build the output payload with all required fields for InfluxDB
msg.payload = {
    time: time,
    boardID: boardID,
    pH: pH,
    turbidity: turbidity,
    wq_status: wq_status,
    batt_voltage: batt_voltage,
    batt_level: batt_level,
    rssi: rssi,
    wifi_status: wifi_status
};

// Return the message object to pass to the next node
return msg;
```

***Why this step is critical:

Data Type Safety: Using parseFloat() and parseInt() ensures values written to InfluxDB are numbers, not strings. This is essential for Chart.js rendering.

Centralized Logic: Node-RED acts as the "brain," calculating all derived statuses before data is stored. This keeps your Express API and React frontend lightweight.

📤 Step 4: Publish the Processed Data (Optional)
Drag an mqtt out node onto the canvas and connect it to the output of your function node.

Double-click the mqtt out node.

Server: Select the broker configuration you created in Step 1.

Topic: Enter a new topic for the processed data, e.g., water/processed.

Click Done.

This step is useful for testing or if another service needs to subscribe to the processed data.

🧪 Step 5: Test Your Flow
Add a debug node from the sidebar and connect it to the output of your function node.

Deploy your flow by clicking the Deploy button.

Use an MQTT client tool (like MQTTX, MQTT.fx, or mosquitto_pub) to publish a sample JSON payload to your input topic (e.g., sensors/board1/data).

Check the Debug window in Node-RED. You should see the transformed msg.payload object containing all calculated fields like wq_status and batt_level.

🚨 Step 6: Add Telegram Alerts (Branching Logic)
Drag a switch node and connect it to the output of your function node.

Double-click the switch node. Set the property to msg.payload.wq_status and the condition to == Unsafe.

Drag a telegram node from the node-red-contrib-telegrambot palette and connect it to the output of the switch node.

Configure the Telegram node with your bot's credentials and the chatId for your alert group.

In the message field, use a template to include dynamic data:
🚨 ALERT: Water Quality Unsafe at Board {{payload.boardID}}. pH: {{payload.pH}}, Turbidity: {{payload.turbidity}}.

Pro-Tip: To prevent alert spamming, insert a delay node between the switch and telegram nodes. Set its mode to "Rate Limit" and configure it to allow one message every 15 minutes.