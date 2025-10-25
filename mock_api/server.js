const express = require("express");
const { authMiddleware } = require("./middleware/auth");
const { simulateLatency } = require("./helpers/mockData");

// Import Routers
const feedRouter = require("./routes/feed");
const contentRouter = require("./routes/content");
const analyticsRouter = require("./routes/analytics");

const app = express();
const port = 3000;
const API_VERSION = "/api/v1";

// --- Global Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// --- API Endpoints ---

// 0. GET /api/v1/health - Very fast health check
app.get(`${API_VERSION}/health`, async (req, res) => {
  console.log(`[Backend][${req.user.username}] Received GET /health.`);
  await simulateLatency(30, 80);
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    source: "Mock Backend (Root)",
  });
});

// --- Mount Routers ---
app.use(API_VERSION, feedRouter);
app.use(API_VERSION, contentRouter);
app.use(API_VERSION, analyticsRouter);

// --- Error Handling Middleware (Best practice) ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Something broke!", error: err.message });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
  console.log(`Open http://localhost:${port}${API_VERSION}/health to check.`);
});
