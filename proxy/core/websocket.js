// core/websocket.js
let wssInstance = null;

function createWebSocketServer(wss, metrics) {
  wssInstance = wss;

  wss.on("connection", (ws) => {
    console.log("[WebSocket] Client connected for metrics.");
    ws.send(JSON.stringify({ message: "Connected to proxy metrics stream." }));
    broadcastMetrics(metrics);
  });

  wss.on("error", (error) => {
    console.error("[WebSocket Error]:", error);
  });

  setInterval(() => broadcastMetrics(metrics), 1000);
}

function broadcastMetrics(metrics) {
  if (!wssInstance) return;
  const payload = {
    timestamp: new Date().toISOString(),
    ...metrics,
    cacheHitRatio:
      metrics.totalRequests > 0
        ? (metrics.cacheHits / metrics.totalRequests).toFixed(2)
        : 0,
    backendLoadReduction:
      metrics.totalRequests > 0
        ? ((metrics.totalRequests - metrics.backendCalls) / metrics.totalRequests).toFixed(2)
        : 0,
  };

  wssInstance.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });
}

module.exports = { createWebSocketServer, broadcastMetrics };
