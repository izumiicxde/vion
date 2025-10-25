const express = require("express");
const http = require("http");
const Redis = require("ioredis");
const WebSocket = require("ws");

const { createWebSocketServer, broadcastMetrics } = require("./core/websocket");
const { proxyMiddleware, metrics } = require("./core/proxyMiddleware");

const app = express();
const proxyPort = 3001;
const backendPort = 3000;

const redis = new Redis();
const server = http.createServer(app);

// --- WebSocket Setup ---
const wss = new WebSocket.Server({ server });
createWebSocketServer(wss, metrics);

// --- Express Setup ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Attach Proxy Middleware ---
app.all(/^\/api\/.*/, proxyMiddleware(redis, backendPort, metrics, broadcastMetrics));

// --- Start the Proxy Server ---
server.listen(proxyPort, () => {
  console.log(`✅ Smart Caching Reverse Proxy running at http://localhost:${proxyPort}`);
  console.log(`➡️ Forwarding requests to backend at http://localhost:${backendPort}`);
  console.log(`📊 WebSocket Metrics at ws://localhost:${proxyPort}`);
});
