// core/proxyMiddleware.js
const axios = require("axios");
const { getRequestFingerprint, getSmartCacheTTL } = require("./utils");

const inFlight = new Map();
const cacheHitLogger = new Map(); // Used to debounce cache hit logs

function proxyMiddleware(redis, backendPort, metrics, broadcastMetrics) {
  return async (req, res) => {
    metrics.totalRequests++;
    const backendUrl = `http://localhost:${backendPort}${req.originalUrl}`;
    const fingerprint = getRequestFingerprint(req);

    // --- Stage 1: Cache Check ---
    const initialTTL = getSmartCacheTTL(req);
    if (req.method === "GET" && initialTTL > 0) {
      try {
        const cached = await redis.get(fingerprint);
        if (cached) {
          metrics.cacheHits++;
          const parsed = JSON.parse(cached);

          // --- NEW: ROBUST BATCH LOGIC FOR CACHE HITS ---
          const LOG_DEBOUNCE_MS = 50; // Window to group rapid requests

          if (!cacheHitLogger.has(fingerprint)) {
            // This is the FIRST request in a batch. It sets the initial timer.
            const logBatch = {
              count: 1,
              timerId: setTimeout(() => {
                console.log(
                  `[CACHE HIT SUMMARY] ${logBatch.count}x concurrent requests for ${req.originalUrl} were served from cache.`
                );
                cacheHitLogger.delete(fingerprint); // Clean up
              }, LOG_DEBOUNCE_MS),
            };
            cacheHitLogger.set(fingerprint, logBatch);
          } else {
            // This is a SUBSEQUENT request. Increment the count and reset the timer.
            const logBatch = cacheHitLogger.get(fingerprint);
            logBatch.count++;
            clearTimeout(logBatch.timerId); // Cancel the previous timer
            logBatch.timerId = setTimeout(() => {
              // Set a new one
              console.log(
                `[CACHE HIT SUMMARY] ${logBatch.count}x concurrent requests for ${req.originalUrl} were served from cache.`
              );
              cacheHitLogger.delete(fingerprint); // Clean up
            }, LOG_DEBOUNCE_MS);
          }
          // --- END OF BATCH LOGIC ---

          // Send response immediately to every request
          res.set(parsed.headers).status(parsed.status).send(parsed.data);
          metrics.successfulResponses++;
          broadcastMetrics(metrics);
          return;
        }
      } catch (e) {
        console.error("[CACHE READ ERROR]", e);
      }
    }

    // --- Stage 2 & 3: In-Flight and Backend Logic (This part is unchanged and works correctly) ---
    if (inFlight.has(fingerprint)) {
      metrics.deduplicatedRequests++;
      const flightRequest = inFlight.get(fingerprint);
      if (flightRequest.queuedCount === 0) {
        console.log(
          `[IN-FLIGHT] Original request in progress. Queuing subsequent requests for ${req.originalUrl}...`
        );
      }
      flightRequest.queuedCount++;
      try {
        const sharedResponse = await flightRequest.promise;
        res
          .set(sharedResponse.headers)
          .status(sharedResponse.status)
          .send(sharedResponse.data);
        metrics.successfulResponses++;
        broadcastMetrics(metrics);
        return;
      } catch (e) {
        res.status(500).json({ error: "Error serving from in-flight" });
        metrics.errorResponses++;
        return;
      }
    }

    metrics.backendCalls++;
    console.log(`[TO BACKEND] Forwarding original request: ${req.originalUrl}`);
    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        const backendResponse = await axios({
          method: req.method,
          url: backendUrl,
          headers: req.headers,
          data: req.body,
          validateStatus: () => true,
          responseType: "arraybuffer",
        });
        let responseData = backendResponse.data.toString("utf8");
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

    inFlight.set(fingerprint, { promise: requestPromise, queuedCount: 0 });

    try {
      const finalResponse = await requestPromise;
      res
        .set(finalResponse.headers)
        .status(finalResponse.status)
        .send(finalResponse.data);
      metrics.successfulResponses++;
    } catch (error) {
      res
        .status(502)
        .json({ message: "Backend error", details: error.message });
      metrics.errorResponses++;
    } finally {
      const flightRequest = inFlight.get(fingerprint);
      if (flightRequest && flightRequest.queuedCount > 0) {
        const totalRequests = flightRequest.queuedCount + 1;
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
