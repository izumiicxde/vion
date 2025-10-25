// index.js
const express = require("express");
const http = require("http");
const Redis = require("ioredis");
const WebSocket = require("ws");
const { proxyMiddleware } = require("./core/proxyMiddleware");

const app = express();
const proxyPort = 3001;
const backendPort = 3000;

const redis = new Redis();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- CENTRAL METRICS OBJECT ---
const metrics = {
  totalRequests: 0,
  backendCalls: 0,
  cacheHits: 0,
  deduplicatedRequests: 0,
  successfulResponses: 0,
  errorResponses: 0,
};

// --- UPGRADED WEBSOCKET BROADCASTER ---
const broadcastMetrics = async () => {
  // <<< NEW: LOGIC TO GET DETAILED IN-FLIGHT INFO FROM REDIS
  let inFlightDetails = [];
  try {
    // 1. Find all active lock keys. NOTE: In production, use SCAN for performance. For a demo, KEYS is fine.
    const lockKeys = await redis.keys("lock:queue:*");

    if (lockKeys.length > 0) {
      // 2. For each lock, get its metadata (the value of the lock key) and its queue count.
      const pipeline = redis.pipeline();
      lockKeys.forEach((lockKey) => {
        const fingerprint = lockKey.substring("lock:queue:".length);
        const counterKey = `count:queue:${fingerprint}`;
        pipeline.get(lockKey); // Get the metadata (url, startTime)
        pipeline.get(counterKey); // Get the queue count
      });
      const results = await pipeline.exec();

      // 3. Process the results to build the details array.
      inFlightDetails = lockKeys
        .map((lockKey, index) => {
          const metadataResult = results[index * 2];
          const countResult = results[index * 2 + 1];

          // metadataResult is [error, value], countResult is [error, value]
          if (metadataResult[0] || countResult[0] || !metadataResult[1]) {
            return null; // Skip if there was an error or data is missing
          }

          try {
            const metadata = JSON.parse(metadataResult[1]);
            const count = parseInt(countResult[1], 10);

            return {
              url: metadata.url,
              duration_ms: Date.now() - metadata.startTime,
              queued_requests: count,
            };
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean); // Filter out any nulls from errors
    }
  } catch (e) {
    console.error("[METRICS ERROR] Could not fetch in-flight details:", e);
  }
  // <<< END NEW

  const payload = {
    ...metrics,
    inFlightCount: inFlightDetails.length, // The total number of in-flight requests
    inFlightDetails: inFlightDetails, // The new detailed array
    cacheHitRatio:
      metrics.totalRequests > 0
        ? (metrics.cacheHits / metrics.totalRequests).toFixed(2)
        : 0,
    timestamp: new Date().toISOString(),
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
};

// Use an async wrapper for setInterval to handle the async broadcastMetrics function
setInterval(async () => {
  await broadcastMetrics();
}, 1000);

wss.on("connection", (ws) => {
  console.log("[WebSocket] Client connected for metrics.");
  broadcastMetrics();
});

// --- EXPRESS SETUP ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ATTACH PROXY MIDDLEWARE ---
app.all(
  /^\/api\/.*/,
  proxyMiddleware(redis, backendPort, metrics, broadcastMetrics)
);

// --- START THE PROXY SERVER ---
server.listen(proxyPort, () => {
  console.log(`Caching Reverse Proxy running at http://localhost:${proxyPort}`);
});

// --- ERROR HANDLING ---
redis.on("error", (err) => {
  console.error("[REDIS ERROR]", err);
});
wss.on("error", (error) => {
  console.error("[WEBSOCKET ERROR]", error);
});
