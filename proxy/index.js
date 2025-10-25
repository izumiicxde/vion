// index.js
const express = require("express");
const http = require("http");
const Redis = require("ioredis");
const WebSocket = require("ws");

// --- CORRECTED IMPORTS ---
// We only need the factory function from proxyMiddleware
const { proxyMiddleware } = require("./core/proxyMiddleware");
// Assuming websocket.js exports these functions
const { createWebSocketServer, broadcastMetrics } = require("./core/websocket");

const app = express();
const proxyPort = 3001;
const backendPort = 3000;

const redis = new Redis();
const server = http.createServer(app);

// --- NEW: DEFINE METRICS OBJECT CENTRALLY ---
// This is the single source of truth for your application's state.
const metrics = {
  totalRequests: 0,
  backendCalls: 0,
  cacheHits: 0,
  deduplicatedRequests: 0,
  successfulResponses: 0,
  errorResponses: 0,
  // You can add the semantic counters here too if you're implementing that feature
  // semanticFullHits: 0,
  // semanticPartialHits: 0,
  // semanticMisses: 0,
};

// --- WebSocket Setup ---
const wss = new WebSocket.Server({ server });
// Pass the metrics object to the WebSocket server so it can read from it
createWebSocketServer(wss, metrics);

// --- Express Setup ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Attach Proxy Middleware ---
// The factory function receives all its dependencies. This is clean and correct.
app.all(
  /^\/api\/.*/,
  proxyMiddleware(redis, backendPort, metrics, () =>
    broadcastMetrics(wss, metrics)
  )
);

// --- Start the Proxy Server ---
server.listen(proxyPort, () => {
  console.log(`Caching Reverse Proxy running at http://localhost:${proxyPort}`);
  console.log(
    `Forwarding requests to backend at http://localhost:${backendPort}`
  );
  console.log(`WebSocket Metrics at ws://localhost:${proxyPort}`);
});

// --- Optional: Add Redis error handling ---
redis.on("error", (err) => {
  console.error("[REDIS ERROR]", err);
});
