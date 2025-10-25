// index.js
const express = require("express");
const Redis = require("ioredis");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const app = express();
const port = 3000;

// Redis setup
const redis = new Redis();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("tiny"));

// Rate limiter (basic)
const limiter = rateLimit({
  windowMs: 1000, // 1 sec
  max: 50, // max requests per IP per window
});
app.use(limiter);

// --- Mock Users and Tokens ---
const MOCK_USERS = {
  user1: { password: "password1", role: "user", id: "u1" },
  admin1: { password: "adminpassword", role: "admin", id: "a1" },
  analyst1: { password: "analystpassword", role: "analyst", id: "an1" },
  guest: { password: "guest", role: "guest", id: "g1" },
};

const MOCK_TOKENS = {
  mock_user_jwt: { username: "user1", role: "user", id: "u1" },
  mock_admin_jwt: { username: "admin1", role: "admin", id: "a1" },
  mock_analyst_jwt: { username: "analyst1", role: "analyst", id: "an1" },
};

const verifyToken = (token) => MOCK_TOKENS[token];

// --- Mock Content ---
let contentCounter = 1;
const mockContents = {};
for (let i = 1; i <= 35; i++) {
  mockContents[contentCounter] = {
    id: contentCounter,
    title: `Article ${i}`,
    author: `Author ${Math.floor(Math.random() * 5) + 1}`,
    views: Math.floor(Math.random() * 1000),
    likes: Math.floor(Math.random() * 100),
    comments_count: Math.floor(Math.random() * 20),
    tags: ["tech", "news", "report"][Math.floor(Math.random() * 3)],
    body: "Lorem ipsum dolor sit amet ".repeat(200 + i),
    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    last_updated: new Date().toISOString(),
  };
  contentCounter++;
}

const mockJobs = new Map();

// --- Middleware for Authentication ---
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    req.user = verifyToken(token) || { role: "guest", username: "guest", id: "g1" };
  } else {
    req.user = { role: "guest", username: "guest", id: "g1" };
  }
  next();
});

// --- Helper ---
const simulateLatency = (minMs, maxMs) =>
  new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));

const generateCSV = (data) => {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) => Object.values(row).join(",")).join("\n");
  return `${headers}\n${rows}`;
};

// --- Endpoints ---

// Health
app.get("/api/v1/health", async (req, res) => {
  await simulateLatency(10, 50);
  res.json({ status: "healthy", timestamp: new Date().toISOString(), source: "Mock Backend" });
});

// Login
app.post("/api/v1/auth/login", async (req, res) => {
  await simulateLatency(100, 300);
  const { username, password } = req.body;
  const user = MOCK_USERS[username];
  if (user && user.password === password) {
    const token = Object.keys(MOCK_TOKENS).find((t) => MOCK_TOKENS[t].username === username);
    return res.json({ message: "Login successful", token, user: { id: user.id, username, role: user.role } });
  }
  res.status(401).json({ message: "Invalid credentials" });
});

// Global Trending (Cacheable)
app.get("/api/v1/feed/global-trending", async (req, res) => {
  const cacheKey = "global_trending";
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  await simulateLatency(1000, 2000);
  const topics = [
    { topic: "#AI", volume: Math.floor(Math.random() * 500000) },
    { topic: "#Web3", volume: Math.floor(Math.random() * 300000) },
    { topic: "#Tech", volume: Math.floor(Math.random() * 200000) },
  ];

  const response = { timestamp: new Date().toISOString(), topics, source: "Mock External Service" };
  await redis.set(cacheKey, JSON.stringify(response), "EX", 10); // cache 10s
  res.json(response);
});

// Content Full Detail
app.get("/api/v1/content/:id/full-detail", async (req, res) => {
  await simulateLatency(500, 1500);
  const content = mockContents[parseInt(req.params.id)];
  if (!content) return res.status(404).json({ message: "Content not found" });
  res.json({ ...content, accessedBy: req.user.username, source: "Mock Backend Content Service" });
});

// Search Advanced
app.get("/api/v1/search/advanced", async (req, res) => {
  await simulateLatency(300, 1000);
  let results = Object.values(mockContents);
  const { q, author, min_views, tags, page = 1, limit = 10 } = req.query;

  if (q) results = results.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  if (author) results = results.filter((c) => c.author.toLowerCase().includes(author.toLowerCase()));
  if (min_views) results = results.filter((c) => c.views >= parseInt(min_views));
  if (tags) results = results.filter((c) => c.tags.includes(tags.toLowerCase()));

  const startIndex = (page - 1) * limit;
  const paginated = results.slice(startIndex, startIndex + parseInt(limit));
  res.json({ timestamp: new Date().toISOString(), count: results.length, page, limit, results: paginated, source: "Mock Backend Search Service" });
});

// Analytics Content Performance (Admin/Analyst)
app.get("/api/v1/analytics/content-performance", async (req, res) => {
  if (!["admin", "analyst"].includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  await simulateLatency(1000, 2000);
  const totalContent = Object.keys(mockContents).length;
  const totalViews = Object.values(mockContents).reduce((a, c) => a + c.views, 0);
  const totalLikes = Object.values(mockContents).reduce((a, c) => a + c.likes, 0);
  res.json({ totalContent, totalViews, totalLikes, source: "Mock Backend Analytics" });
});

// Analytics Generate Report (Background Job)
app.post("/api/v1/analytics/generate-report", async (req, res) => {
  if (!["admin", "analyst"].includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  await simulateLatency(100, 300);

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mockJobs.set(jobId, { status: "queued", progress: 0, requestedBy: req.user.username, data: null, createdAt: new Date().toISOString() });

  setTimeout(async () => {
    const job = mockJobs.get(jobId);
    if (!job) return;
    job.status = "processing";
    job.progress = 50;
    await simulateLatency(2000, 4000);

    const reportData = Object.values(mockContents).map((c) => ({ id: c.id, title: c.title, views: c.views, likes: c.likes }));
    job.data = generateCSV(reportData);
    job.status = "completed";
    job.progress = 100;
    job.completedAt = new Date().toISOString();
  }, 1000);

  res.status(202).json({ message: "Report generation started", job_id: jobId, status: "queued", source: "Mock Backend" });
});

// Job Status
app.get("/api/v1/analytics/report/:job_id/status", async (req, res) => {
  const job = mockJobs.get(req.params.job_id);
  if (!job) return res.status(404).json({ message: "Job not found" });
  if (job.requestedBy !== req.user.username && !["admin", "analyst"].includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  res.json(job);
});

// Job Download
app.get("/api/v1/analytics/report/:job_id/download", async (req, res) => {
  const job = mockJobs.get(req.params.job_id);
  if (!job || job.status !== "completed") return res.status(404).json({ message: "Report not ready" });
  if (job.requestedBy !== req.user.username && !["admin", "analyst"].includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="report-${req.params.job_id}.csv"`);
  res.send(job.data);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error", source: "Mock Backend" });
});

// Start server
app.listen(port, () => console.log(`Mock Backend API listening on http://localhost:${port}`));
