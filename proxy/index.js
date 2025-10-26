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

// --- SERVER STATE ---
const serverStartTime = Date.now();

// --- CENTRAL METRICS OBJECT ---
const metrics = {
  totalRequests: 0,
  backendCalls: 0,
  cacheHits: 0,
  deduplicatedRequests: 0,
  successfulResponses: 0,
  errorResponses: 0,
  // --- NEW ---
  totalResponseTime: 0, // Sum of all response times in ms
  requestsCompleted: 0, // Count of completed requests (for calculating average)
};

// --- HELPER FUNCTION ---
const formatUptime = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

// --- BROADCAST FUNCTION ---
const broadcastMetrics = async () => {
  let inFlightQueues = [];
  try {
    const lockKeys = await redis.keys("lock:queue:*");
    if (lockKeys.length > 0) {
      const pipeline = redis.pipeline();
      lockKeys.forEach((lockKey) => {
        const fingerprint = lockKey.substring("lock:queue:".length);
        const counterKey = `count:queue:${fingerprint}`;
        pipeline.get(lockKey);
        pipeline.get(counterKey);
      });

      const results = await pipeline.exec();
      inFlightQueues = lockKeys
        .map((lockKey, index) => {
          const fingerprint = lockKey.substring("lock:queue:".length);
          const metadataResult = results[index * 2];
          const countResult = results[index * 2 + 1];
          if (metadataResult[0] || countResult[0] || !metadataResult[1])
            return null;

          try {
            const metadata = JSON.parse(metadataResult[1]);
            const count = parseInt(countResult[1], 10);

            // build fake "requests" list for UI log visualization
            const requests = Array.from({ length: count }).map((_, i) => ({
              id: `${fingerprint}-${i + 1}`,
              status: "In-Flight",
            }));

            return {
              fingerprint,
              url: metadata.url,
              method: metadata.method || "N/A",
              status: "Active",
              activeRequestCount: count,
              requests,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  } catch (e) {
    console.error("[METRICS ERROR] Could not fetch in-flight details:", e);
  }

  // compute metrics
  const totalRequests = metrics.totalRequests;
  const requestsCompleted = metrics.requestsCompleted;

  const cacheHitRatio =
    totalRequests > 0 ? metrics.cacheHits / totalRequests : 0;
  const errorRate =
    totalRequests > 0 ? metrics.errorResponses / totalRequests : 0;
  const avgResponseTime =
    requestsCompleted > 0 ? metrics.totalResponseTime / requestsCompleted : 0;

  const payload = {
    ...metrics,
    inFlightCount: inFlightQueues.length,
    inFlightQueues, // ✅ changed key name here
    cacheHitRatio,
    errorRate,
    avgResponseTime: avgResponseTime.toFixed(2),
    uptime: formatUptime(Date.now() - serverStartTime),
    timestamp: new Date().toISOString(),
    wsClientCount: wss.clients.size,
  };

  const payloadStr = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payloadStr);
    }
  });
};

// --- EXPRESS SETUP ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- PROXY MIDDLEWARE WITH ON-DEMAND METRIC PUSH ---
app.all(/^\/api\/.*/, async (req, res, next) => {
  const requestStartTime = Date.now();

  // --- NEW: Track response time on finish ---
  res.on("finish", () => {
    const duration = Date.now() - requestStartTime;
    metrics.totalResponseTime += duration;
    metrics.requestsCompleted++;
  });

  // Pass to your proxy middleware
  proxyMiddleware(redis, backendPort, metrics, async () => {
    await broadcastMetrics(); // send metrics ONLY when there’s a request
  })(req, res, next);
});

// --- WEBSOCKET CONNECTION HANDLER ---
wss.on("connection", (ws) => {
  console.log(
    `[WebSocket] Client connected. Total clients: ${wss.clients.size}`
  );
  ws.on("close", () => {
    console.log(
      `[WebSocket] Client disconnected. Total clients: ${wss.clients.size}`
    );
  });
  // Send one initial snapshot
  broadcastMetrics();
});

// --- START SERVER ---
server.listen(proxyPort, () => {
  console.log(`Caching Reverse Proxy running at http://localhost:${proxyPort}`);
  // Periodically broadcast metrics to keep UI alive even with no traffic
  setInterval(broadcastMetrics, 2000);
});

// --- ERROR HANDLERS ---
redis.on("error", (err) => console.error("[REDIS ERROR]", err));
wss.on("error", (error) => console.error("[WEBSOCKET ERROR]", error));
