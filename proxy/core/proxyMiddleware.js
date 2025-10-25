// core/proxyMiddleware.js
const axios = require("axios");
const { getRequestFingerprint, getSmartCacheTTL } = require("./utils"); // Import from our new file

const inFlight = new Map();

function proxyMiddleware(redis, backendPort, metrics, broadcastMetrics) {
  return async (req, res) => {
    metrics.totalRequests++;
    const backendUrl = `http://localhost:${backendPort}${req.originalUrl}`;
    const fingerprint = getRequestFingerprint(req);

    // --- Stage 1: Initial Cache Check ---
    // We call getSmartCacheTTL WITHOUT a response to see if this path is EVER cacheable.
    const initialTTL = getSmartCacheTTL(req);
    if (req.method === "GET" && initialTTL > 0) {
      try {
        const cached = await redis.get(fingerprint);
        if (cached) {
          metrics.cacheHits++;
          const parsed = JSON.parse(cached);
          console.log(`[CACHE HIT] ${req.originalUrl}`);
          res.set(parsed.headers); // Use res.set to apply all headers at once
          res.status(parsed.status).send(parsed.data);
          metrics.successfulResponses++;
          broadcastMetrics(metrics);
          return;
        }
      } catch (e) {
        console.error("[CACHE READ ERROR]", e);
      }
    }

    // --- Stage 2: In-Flight Request Deduplication ---
    if (inFlight.has(fingerprint)) {
      metrics.deduplicatedRequests++;
      console.log(`[IN-FLIGHT] Queuing request for ${req.originalUrl}`);
      try {
        const sharedResponse = await inFlight.get(fingerprint);
        res.set(sharedResponse.headers);
        res.status(sharedResponse.status).send(sharedResponse.data);
        metrics.successfulResponses++;
        broadcastMetrics(metrics);
        return;
      } catch (e) {
        res.status(500).json({ error: "Error serving from in-flight" });
        metrics.errorResponses++;
        return;
      }
    }

    // --- Stage 3: Forward to Backend ---
    metrics.backendCalls++;
    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        const backendResponse = await axios({
          method: req.method,
          url: backendUrl,
          headers: req.headers,
          data: req.body,
          validateStatus: () => true, // Handle all status codes
          responseType: "arraybuffer",
        });

        let responseData = backendResponse.data;
        const contentType = backendResponse.headers["content-type"];
        if (
          contentType &&
          (contentType.includes("application/json") ||
            contentType.includes("text/"))
        ) {
          responseData = backendResponse.data.toString("utf8");
        }

        const sharedResponse = {
          status: backendResponse.status,
          headers: backendResponse.headers,
          data: responseData,
        };

        // --- DYNAMIC CACHING LOGIC ---
        // NEW: Calculate the FINAL TTL now that we have the response.
        const dynamicTTL = getSmartCacheTTL(req, backendResponse);

        if (dynamicTTL > 0) {
          await redis.setex(
            fingerprint,
            dynamicTTL,
            JSON.stringify(sharedResponse)
          );
          console.log(
            `[CACHED] Response for ${req.originalUrl} with Smart TTL: ${dynamicTTL}s`
          );
        }

        resolve(sharedResponse);
      } catch (error) {
        reject(error);
      }
    });

    inFlight.set(fingerprint, requestPromise);

    try {
      const finalResponse = await requestPromise;
      res.set(finalResponse.headers);
      res.status(finalResponse.status).send(finalResponse.data);
      metrics.successfulResponses++;
    } catch (error) {
      res
        .status(502)
        .json({ message: "Backend error", details: error.message });
      metrics.errorResponses++;
    } finally {
      inFlight.delete(fingerprint);
      broadcastMetrics(metrics);
    }
  };
}

module.exports = { proxyMiddleware };
