// core/proxyMiddleware.js
const axios = require("axios");
const { getRequestFingerprint, getSmartCacheTTL } = require("./utils");

const inFlight = new Map();

function proxyMiddleware(redis, backendPort, metrics, broadcastMetrics) {
  return async (req, res) => {
    metrics.totalRequests++;
    const backendUrl = `http://localhost:${backendPort}${req.originalUrl}`;
    const fingerprint = getRequestFingerprint(req);

    // --- Stage 1: Cache Check (No change here) ---
    // ... (cache logic remains the same)
    const initialTTL = getSmartCacheTTL(req);
    if (req.method === "GET" && initialTTL > 0) {
      try {
        const cached = await redis.get(fingerprint);
        if (cached) {
          metrics.cacheHits++;
          // We will not batch cache logs as they are independent events
          console.log(`[CACHE HIT] Served from cache: ${req.originalUrl}`);
          const parsed = JSON.parse(cached);
          res.set(parsed.headers);
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
      const flightRequest = inFlight.get(fingerprint);

      // MODIFIED: Log only when the *first* duplicate request arrives
      if (flightRequest.queuedCount === 0) {
        console.log(
          `[IN-FLIGHT] Original request in progress. Queuing subsequent requests for ${req.originalUrl}...`
        );
      }
      flightRequest.queuedCount++;

      try {
        // Silently wait for the shared response
        const sharedResponse = await flightRequest.promise;
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
    console.log(`[TO BACKEND] Forwarding original request: ${req.originalUrl}`);
    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        // ... (axios call and caching logic is unchanged)
        const backendResponse = await axios({
          method: req.method,
          url: backendUrl,
          headers: req.headers,
          data: req.body,
          validateStatus: () => true,
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

    // MODIFIED: Store an object with the promise and a counter
    inFlight.set(fingerprint, { promise: requestPromise, queuedCount: 0 });

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
      // NEW: Log the final summary count before cleaning up
      const flightRequest = inFlight.get(fingerprint);
      if (flightRequest && flightRequest.queuedCount > 0) {
        const totalRequests = flightRequest.queuedCount + 1; // +1 for the original
        console.log(
          `[IN-FLIGHT SUMMARY] ${totalRequests}x concurrent requests for ${req.originalUrl} were handled by a single backend call.`
        );
      }
      inFlight.delete(fingerprint);
      broadcastMetrics(metrics);
    }
  };
}

module.exports = { proxyMiddleware };
