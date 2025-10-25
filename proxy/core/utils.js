// core/utils.js
const crypto = require("crypto");

const getRequestFingerprint = (req) => {
  let fingerprint = `${req.method}:${req.originalUrl}`;
  if (req.headers.authorization) fingerprint += `:${req.headers.authorization}`;
  if (
    ["POST", "PUT", "PATCH"].includes(req.method) &&
    Object.keys(req.body).length > 0
  ) {
    fingerprint += `:${crypto
      .createHash("sha26")
      .update(JSON.stringify(req.body))
      .digest("hex")}`;
  }
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
};

// The new, unified "smart" TTL function
const getSmartCacheTTL = (req, backendResponse = null) => {
  // --- Stage 1: Absolute Exclusions (Never Cache) ---
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) return 0;
  if (
    backendResponse &&
    (backendResponse.status < 200 || backendResponse.status >= 400)
  )
    return 0;

  // --- Stage 2: High-Priority Path-Based Rules ---
  const path = req.originalUrl.split("?")[0];
  const statusCode = backendResponse ? backendResponse.status : 200;

  if (path === "/api/v1/health") return 1;
  if (path.match(/\/api\/v1\/analytics\/report\/[^/]+\/status/)) return 5;

  // --- Stage 3: Content-Based Dynamic Rules (only if we have a response) ---
  if (backendResponse) {
    const headers = backendResponse.headers;
    const contentType = headers["content-type"] || "";
    const contentLength = parseInt(headers["content-length"] || "0", 10);

    if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
      return contentLength > 100000 ? 3600 : 600;
    }
    if (
      contentType.includes("csv") ||
      contentType.includes("pdf") ||
      contentType.includes("octet-stream")
    ) {
      return 1800;
    }
    if (contentType.includes("application/json")) {
      if (contentLength > 50000) return 300;
      if (contentLength < 500) return 10;
      return 60;
    }
  }

  // --- Stage 4: General Path-Based Fallbacks ---
  if (path === "/api/v1/feed/global-trending") return 5;
  if (path.match(/\/api\/v1\/user\/[^/]+\/dashboard-summary/)) return 10;

  // --- Stage 5: Final Default ---
  if (req.method === "GET") return 15;

  return 0;
};

module.exports = { getRequestFingerprint, getSmartCacheTTL };
