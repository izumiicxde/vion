// core/proxyMiddleware.js
const axios = require("axios");
const crypto = require("crypto");

const inFlight = new Map();

const metrics = {
  totalRequests: 0,
  backendCalls: 0,
  cacheHits: 0,
  deduplicatedRequests: 0,
  totalLatencySaved: 0,
  successfulResponses: 0,
  errorResponses: 0,
};

const getRequestFingerprint = (req) => {
  let fingerprint = `${req.method}:${req.originalUrl}`;
  if (req.headers.authorization) fingerprint += `:${req.headers.authorization}`;
  if (["POST", "PUT", "PATCH"].includes(req.method) && Object.keys(req.body).length > 0) {
    fingerprint += `:${crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex")}`;
  }
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
};

const getCacheTTL = (req) => {
  if (req.method !== "GET") return 0;
  if (req.originalUrl.includes("trending")) return 5;
  return 15;
};

function proxyMiddleware(redis, backendPort, metrics, broadcastMetrics) {
  return async (req, res) => {
    metrics.totalRequests++;
    const startTime = process.hrtime.bigint();

    const fingerprint = getRequestFingerprint(req);
    const backendUrl = `http://localhost:${backendPort}${req.originalUrl}`;

    // 1️⃣ Try Redis cache
    const ttl = getCacheTTL(req);
    if (req.method === "GET" && ttl > 0) {
      const cached = await redis.get(fingerprint);
      if (cached) {
        metrics.cacheHits++;
        const parsed = JSON.parse(cached);
        console.log(`[CACHE HIT] ${req.originalUrl}`);
        for (const header in parsed.headers) res.setHeader(header, parsed.headers[header]);
        res.status(parsed.status).send(parsed.data);
        metrics.successfulResponses++;
        broadcastMetrics(metrics);
        return;
      }
    }

    // 2️⃣ Check in-flight requests
    if (inFlight.has(fingerprint)) {
      metrics.deduplicatedRequests++;
      console.log(`[IN-FLIGHT] Queuing identical request for ${req.originalUrl}`);
      const { promise } = inFlight.get(fingerprint);
      try {
        const backendResponse = await promise;
        res.status(backendResponse.status).send(backendResponse.data);
        metrics.successfulResponses++;
        broadcastMetrics(metrics);
        return;
      } catch (e) {
        res.status(500).json({ error: "Error serving from in-flight" });
        metrics.errorResponses++;
        return;
      }
    }

    // 3️⃣ Forward to backend
    metrics.backendCalls++;
    let resolveInFlight, rejectInFlight;
    const p = new Promise((resolve, reject) => {
      resolveInFlight = resolve;
      rejectInFlight = reject;
    });
    inFlight.set(fingerprint, { promise: p });

    try {
      const backendResponse = await axios({
        method: req.method,
        url: backendUrl,
        headers: req.headers,
        data: req.body,
      });

      // Cache response
      if (req.method === "GET" && ttl > 0 && backendResponse.status < 400) {
        await redis.setex(
          fingerprint,
          ttl,
          JSON.stringify({
            status: backendResponse.status,
            headers: backendResponse.headers,
            data: backendResponse.data,
          })
        );
      }

      resolveInFlight(backendResponse);
      inFlight.delete(fingerprint);

      res.status(backendResponse.status).send(backendResponse.data);
      metrics.successfulResponses++;
      broadcastMetrics(metrics);
    } catch (error) {
      rejectInFlight(error);
      inFlight.delete(fingerprint);
      res.status(500).json({ message: "Backend error", details: error.message });
      metrics.errorResponses++;
      broadcastMetrics(metrics);
    }
  };
}

module.exports = { proxyMiddleware, metrics };
