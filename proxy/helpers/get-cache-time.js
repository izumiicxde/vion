const getDynamicCacheTTL = (req, backendResponse) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) return 0;
  if (backendResponse.status < 200 || backendResponse.status >= 400) return 0;

  const headers = backendResponse.headers;
  const contentType = headers["content-type"] || "";
  const contentLength = parseInt(headers["content-length"] || "0", 10);

  // Rule 1: Cache large, static assets for a long time
  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    if (contentLength > 100000) {
      // Over 100KB
      return 3600; // 1 hour
    }
    return 600; // 10 minutes for smaller media
  }

  // Rule 2: Cache downloadable reports/CSVs for a while
  if (
    contentType.includes("csv") ||
    contentType.includes("pdf") ||
    contentType.includes("octet-stream")
  ) {
    return 1800; // 30 minutes
  }

  // Rule 3: Be more specific with JSON based on size
  if (contentType.includes("application/json")) {
    if (contentLength > 50000) {
      // Large JSON reports > 50KB
      return 300; // 5 minutes
    }
    if (contentLength < 500) {
      // Small JSON objects are often dynamic statuses
      return 10; // 10 seconds
    }
    return 60; // 1 minute for medium-sized JSON
  }

  // Fallback to the original path-based logic if no content rules match
  return getCacheTTL(req, backendResponse.status);
};

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

module.exports = { getDynamicCacheTTL, getCacheTTL };
