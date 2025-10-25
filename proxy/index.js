// proxy.js
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const Redis = require("ioredis");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const proxyPort = 3001; // Proxy will run on port 3001
const backendPort = 3000; // Your mock backend is on port 3000
const backendBaseUrl = `http://localhost:${backendPort}`;

const redis = new Redis();

// Create HTTP server for Express app
const server = http.createServer(app);
// Create WebSocket server for dashboard metrics
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- PROXY METRICS ---
let totalRequests = 0;
let backendCalls = 0;
let cacheHits = 0;
let deduplicatedRequests = 0;
let totalLatencySaved = 0; // In ms
let successfulResponses = 0;
let errorResponses = 0;
let lastHourRequests = 0;
let lastHourBackendCalls = 0;

setInterval(() => {
  lastHourRequests = 0;
  lastHourBackendCalls = 0;
  console.log("[Proxy Metrics] Rolling window metrics reset.");
}, 60 * 60 * 1000);

const broadcastMetrics = () => {
  const metrics = {
    timestamp: new Date().toISOString(),
    totalRequests,
    backendCalls,
    cacheHits,
    deduplicatedRequests,
    cacheHitRatio:
      totalRequests > 0 ? (cacheHits / totalRequests).toFixed(2) : 0,
    backendLoadReduction:
      totalRequests > 0
        ? ((totalRequests - backendCalls) / totalRequests).toFixed(2)
        : 0,
    totalLatencySaved,
    inFlightRequests: inFlight.size,
    successfulResponses,
    errorResponses,
    lastHourRequests,
    lastHourBackendCalls,
  };
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(metrics));
    }
  });
};
setInterval(broadcastMetrics, 1000);

// --- IN-FLIGHT REQUEST DEDUPLICATION MAP ---
const inFlight = new Map();

// --- HELPER: GENERATE REQUEST FINGERPRINT ---
const getRequestFingerprint = (req) => {
  let fingerprint = `${req.method}:${req.originalUrl}`; // originalUrl includes path and query
  const authHeader = req.headers.authorization;
  if (authHeader) {
    fingerprint += `:${authHeader}`;
  }
  if (
    ["POST", "PUT", "PATCH"].includes(req.method) &&
    req.body &&
    Object.keys(req.body).length > 0
  ) {
    fingerprint += `:${crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex")}`;
  }
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
};

// --- HELPER: DETERMINE CACHE TTL ---
const getCacheTTL = (req, statusCode) => {
  // Default TTLs based on your mock backend endpoints
  const path = req.originalUrl.split("?")[0]; // Ignore query params for base path matching

  if (path === "/api/v1/health") return 1;
  if (path === "/api/v1/feed/global-trending") return 5;
  if (path.match(/\/api\/v1\/user\/[^/]+\/dashboard-summary/)) return 10;
  if (path.match(/\/api\/v1\/content\/[^/]+\/full-detail/)) return 60;
  if (path === "/api/v1/search/advanced") return 30; // Query params are handled by fingerprinting
  if (path === "/api/v1/analytics/content-performance") return 30;
  if (path === "/api/v1/analytics/user-engagement-trends") return 30;
  if (path.match(/\/api\/v1\/analytics\/report\/[^/]+\/status/)) return 5; // Job status
  if (
    path.match(/\/api\/v1\/analytics\/report\/[^/]+\/download/) &&
    statusCode === 200
  )
    return 60; // Successful download

  // Don't cache state-changing requests
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) return 0;

  // Default for other GET requests
  if (req.method === "GET") return 15;

  return 0; // No caching by default
};

// --- PROXY MIDDLEWARE ---
app.all("/api/*", async (req, res) => {
  totalRequests++;
  lastHourRequests++;
  const requestStartTime = process.hrtime.bigint();

  const fingerprint = getRequestFingerprint(req);
  // Use req.originalUrl directly for backend forwarding path
  const backendPath = req.originalUrl;
  const backendFullUrl = `${backendBaseUrl}${backendPath}`;

  console.log(
    `\n[Proxy][${req.method}] ${
      req.originalUrl
    } - Fingerprint: ${fingerprint.substring(0, 8)}...`
  );

  // --- 1. CHECK REDIS CACHE (Only for GET requests with a valid TTL) ---
  const cacheTTL = getCacheTTL(req); // Initial TTL check without status
  if (req.method === "GET" && cacheTTL > 0) {
    try {
      const cachedResponse = await redis.get(fingerprint);
      if (cachedResponse) {
        cacheHits++;
        const { status, headers, data } = JSON.parse(cachedResponse); // timestamp is not needed for response
        const latency =
          Number(process.hrtime.bigint() - requestStartTime) / 1_000_000;
        // A very rough estimate of saved latency for dashboard display
        totalLatencySaved += getCacheTTL(req, status) * 1000; // Assume the backend call would have taken TTL * 1000 ms

        console.log(
          `[Proxy][CACHE HIT] ${req.originalUrl} (${latency.toFixed(2)}ms)`
        );

        // Carefully set headers, avoid issues with content-encoding or other problematic headers
        for (const headerName in headers) {
          if (headerName.toLowerCase() === "content-encoding") {
            // Don't forward content-encoding header if we're decompressing and re-sending
            // or if we expect Express to handle it.
            continue;
          }
          if (headerName.toLowerCase() === "transfer-encoding") {
            // Avoid 'chunked' transfer encoding from being forwarded directly
            continue;
          }
          try {
            res.setHeader(headerName, headers[headerName]);
          } catch (headerError) {
            console.warn(
              `[Proxy] Could not set header ${headerName}: ${headerError.message}`
            );
          }
        }
        res.status(status).send(data);
        successfulResponses++;
        broadcastMetrics();
        return;
      }
    } catch (error) {
      console.error(
        `[Proxy][Redis Cache Error] ${req.originalUrl}:`,
        error.message
      );
      // Continue to backend if Redis fails
    }
  }

  // --- 2. CHECK IN-FLIGHT REQUESTS (Deduplication) ---
  if (inFlight.has(fingerprint)) {
    deduplicatedRequests++;
    console.log(
      `[Proxy][IN-FLIGHT] Request ${req.originalUrl} already in-flight. Queuing client.`
    );
    const { promise, timestamp: inFlightStartTime } = inFlight.get(fingerprint);

    try {
      const backendResponse = await promise;
      const latency =
        Number(process.hrtime.bigint() - requestStartTime) / 1_000_000;
      const backendProcessingDuration =
        Number(process.hrtime.bigint() - inFlightStartTime) / 1_000_000;
      totalLatencySaved += backendProcessingDuration - latency; // Time saved for this deduplicated request

      console.log(
        `[Proxy][DEDUPLICATED] Served ${
          req.originalUrl
        } from in-flight (${latency.toFixed(2)}ms).`
      );

      for (const headerName in backendResponse.headers) {
        if (
          headerName.toLowerCase() === "content-encoding" ||
          headerName.toLowerCase() === "transfer-encoding"
        )
          continue;
        try {
          res.setHeader(headerName, backendResponse.headers[headerName]);
        } catch (headerError) {
          console.warn(
            `[Proxy] Could not set header ${headerName} from in-flight: ${headerError.message}`
          );
        }
      }
      res.status(backendResponse.status).send(backendResponse.data);
      successfulResponses++;
      broadcastMetrics();
      return;
    } catch (error) {
      console.error(
        `[Proxy][DEDUPLICATION ERROR] Waiting for in-flight request ${req.originalUrl}:`,
        error.message
      );
      errorResponses++;
      broadcastMetrics();
      return res
        .status(500)
        .send(`Error waiting for original request: ${error.message}`);
    }
  }

  // --- 3. NO CACHE, NOT IN-FLIGHT - FORWARD TO BACKEND ---
  backendCalls++;
  lastHourBackendCalls++;
  console.log(
    `[Proxy][BACKEND CALL] Forwarding ${req.originalUrl} to backend.`
  );

  let resolveInFlight;
  let rejectInFlight;
  const requestPromise = new Promise((resolve, reject) => {
    resolveInFlight = resolve;
    rejectInFlight = reject;
  });

  inFlight.set(fingerprint, {
    promise: requestPromise,
    timestamp: process.hrtime.bigint(),
  });

  try {
    // Construct headers for the backend request, being explicit
    const headersForBackend = {};
    for (const headerName in req.headers) {
      // Filter out headers that might cause issues or are handled automatically
      if (
        !["host", "connection", "content-length", "transfer-encoding"].includes(
          headerName.toLowerCase()
        )
      ) {
        headersForBackend[headerName] = req.headers[headerName];
      }
    }
    headersForBackend["host"] = `localhost:${backendPort}`;
    headersForBackend["x-forwarded-for"] =
      req.ip || req.connection.remoteAddress;

    const backendResponse = await axios({
      method: req.method,
      url: backendFullUrl,
      headers: headersForBackend,
      data: req.body,
      validateStatus: () => true,
      responseType: "arraybuffer", // To handle binary data like CSV correctly
    });

    let responseData = backendResponse.data;
    const contentType = backendResponse.headers["content-type"];
    // Attempt to convert to string only if it's a known text type
    if (
      contentType &&
      (contentType.includes("application/json") ||
        contentType.includes("text/csv") ||
        contentType.includes("text/html") ||
        contentType.includes("text/plain"))
    ) {
      responseData = backendResponse.data.toString("utf8");
    }

    // --- Store in Redis Cache (if GET and has TTL and successful status) ---
    const responseTTL = getCacheTTL(req, backendResponse.status);
    if (
      req.method === "GET" &&
      responseTTL > 0 &&
      backendResponse.status >= 200 &&
      backendResponse.status < 300
    ) {
      try {
        await redis.setex(
          fingerprint,
          responseTTL,
          JSON.stringify({
            status: backendResponse.status,
            headers: backendResponse.headers,
            data: responseData, // Storing processed data
          })
        );
        console.log(
          `[Proxy][CACHED] Response for ${req.originalUrl} stored in Redis (TTL: ${responseTTL}s).`
        );
      } catch (redisError) {
        console.error(
          `[Proxy][Redis Set Error] ${req.originalUrl}:`,
          redisError.message
        );
      }
    }

    // Resolve the in-flight promise
    resolveInFlight({
      status: backendResponse.status,
      headers: backendResponse.headers,
      data: responseData,
    });

    inFlight.delete(fingerprint);

    const latency =
      Number(process.hrtime.bigint() - requestStartTime) / 1_000_000;
    console.log(
      `[Proxy][RESPONDED] ${
        req.originalUrl
      } (Backend Latency: ${latency.toFixed(2)}ms, Status: ${
        backendResponse.status
      })`
    );

    for (const headerName in backendResponse.headers) {
      if (
        headerName.toLowerCase() === "content-encoding" ||
        headerName.toLowerCase() === "transfer-encoding"
      )
        continue;
      try {
        res.setHeader(headerName, backendResponse.headers[headerName]);
      } catch (headerError) {
        console.warn(
          `[Proxy] Could not set header ${headerName} from backend response: ${headerError.message}`
        );
      }
    }
    res.status(backendResponse.status).send(responseData);
    successfulResponses++;
    broadcastMetrics();
    return;
  } catch (error) {
    console.error(
      `[Proxy][BACKEND ERROR] Failed to forward request ${req.originalUrl}:`,
      error.message
    );

    rejectInFlight(error);
    inFlight.delete(fingerprint);

    const latency =
      Number(process.hrtime.bigint() - requestStartTime) / 1_000_000;
    console.error(
      `[Proxy][ERROR RESPONSE] ${req.originalUrl} (${latency.toFixed(2)}ms)`
    );
    errorResponses++;
    broadcastMetrics();
    return res.status(500).json({
      message: `Proxy failed to connect to backend or received an invalid response: ${error.message}`,
      proxyTimestamp: new Date().toISOString(),
    });
  }
});

// --- Start the Proxy Server ---
server.listen(proxyPort, () => {
  console.log(
    `Smart Caching Reverse Proxy listening on http://localhost:${proxyPort}`
  );
  console.log(
    `Forwarding requests to mock backend on http://localhost:${backendPort}`
  );
  console.log(
    `WebSocket metrics server running on ws://localhost:${proxyPort}`
  );
});

wss.on("connection", (ws) => {
  console.log("[WebSocket] Client connected for metrics.");
  ws.send(JSON.stringify({ message: "Connected to proxy metrics stream." }));
  broadcastMetrics();
});

wss.on("error", (error) => {
  console.error("[WebSocket Error]:", error);
});

redis.on("error", (err) => {
  console.error("[Redis Connection Error]:", err);
});
