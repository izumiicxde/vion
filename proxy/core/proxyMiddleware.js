// core/proxyMiddleware.js
const axios = require("axios");
const { getRequestFingerprint, getSmartCacheTTL } = require("./utils");

function proxyMiddleware(redis, backendPort, metrics, broadcastMetrics) {
  return async (req, res) => {
    metrics.totalRequests++;
    const backendUrl = `http://localhost:${backendPort}${req.originalUrl}`;
    const fingerprint = getRequestFingerprint(req);

    // --- Stage 1: Cache Check with Distributed Counting & Logging Lock ---
    const initialTTL = getSmartCacheTTL(req);
    if (req.method === "GET" && initialTTL > 0) {
      try {
        const cached = await redis.get(fingerprint);
        if (cached) {
          metrics.cacheHits++;
          const parsed = JSON.parse(cached);

          // --- ROBUST DISTRIBUTED BATCH LOGIC ---
          const counterKey = `count:cache:${fingerprint}`;
          const loggingLockKey = `lock:log:${fingerprint}`;

          await redis.incr(counterKey); // Atomically increment the counter

          // Try to acquire a "logging lock". Only one process will succeed.
          const isLogger = await redis.set(
            loggingLockKey,
            "logging",
            "EX",
            5,
            "NX"
          );

          if (isLogger) {
            // This instance is the designated logger for this batch.
            setTimeout(async () => {
              const finalCount = await redis.get(counterKey);
              if (finalCount && finalCount > 0) {
                console.log(
                  `[CACHE HIT SUMMARY] ${finalCount}x concurrent requests for ${req.originalUrl} were served from cache.`
                );
                // Clean up BOTH keys. Releasing the lock allows a new batch to start.
                redis.del(counterKey, loggingLockKey);
              }
            }, 500); // Use a slightly longer window to ensure the whole batch is captured.
          }
          // --- END OF BATCH LOGIC ---

          res.set(parsed.headers).status(parsed.status).send(parsed.data);
          metrics.successfulResponses++;
          broadcastMetrics(metrics);
          return;
        }
      } catch (e) {
        console.error("[CACHE READ ERROR]", e);
      }
    }

    // --- Stage 2: Distributed Lock with Queue Counting ---
    const lockKey = `lock:queue:${fingerprint}`;
    const counterKey = `count:queue:${fingerprint}`;
    const lockAcquired = await redis.set(lockKey, "locked", "EX", 20, "NX");

    if (!lockAcquired) {
      // --- FOLLOWER LOGIC ---
      metrics.deduplicatedRequests++;
      await redis.incr(counterKey);
      redis.expire(counterKey, 20);

      // This log is fine, as it's useful for debugging individual requests.
      // console.log(`[IN-FLIGHT] Lock busy. Polling cache for ${req.originalUrl}`);
      try {
        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          const cached = await redis.get(fingerprint);
          if (cached) {
            const parsed = JSON.parse(cached);
            res.set(parsed.headers).status(parsed.status).send(parsed.data);
            metrics.successfulResponses++;
            broadcastMetrics(metrics);
            return;
          }
        }
        throw new Error("Timed out waiting for leader to populate cache.");
      } catch (e) {
        console.error(`[IN-FLIGHT ERROR] for ${req.originalUrl}:`, e.message);
        res
          .status(504)
          .json({ error: "Request timed out waiting for in-flight response." });
        metrics.errorResponses++;
        broadcastMetrics(metrics);
        return;
      }
    }

    // --- LEADER LOGIC ---
    metrics.backendCalls++;
    await redis.incr(counterKey);
    redis.expire(counterKey, 20);

    console.log(
      `[LEADER] Acquired lock for ${req.originalUrl}. Forwarding to backend.`
    );
    try {
      const backendResponse = await axios({
        method: req.method,
        url: backendUrl,
        headers: req.headers,
        data: req.body,
        validateStatus: () => true,
        responseType: "arraybuffer",
      });

      // ... processing logic ...
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
      }

      res
        .set(sharedResponse.headers)
        .status(sharedResponse.status)
        .send(sharedResponse.data);
      metrics.successfulResponses++;
    } catch (error) {
      console.error(
        `[BACKEND ERROR] Leader failed for ${req.originalUrl}:`,
        error.message
      );
      res
        .status(502)
        .json({ message: "Backend error", details: error.message });
      metrics.errorResponses++;
    } finally {
      const finalCount = await redis.get(counterKey);
      if (finalCount && finalCount > 0) {
        console.log(
          `[IN-FLIGHT SUMMARY] ${finalCount}x concurrent requests for ${req.originalUrl} were handled by a single backend call.`
        );
      }
      await redis.del(lockKey, counterKey);
      console.log(`[LOCK RELEASED] for ${req.originalUrl}`);
      broadcastMetrics(metrics);
    }
  };
}

module.exports = { proxyMiddleware };
