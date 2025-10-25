const express = require("express");
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Mock JWT Token and User Store ---
const MOCK_USERS = {
  user1: { password: "password1", role: "user", id: "u1" },
  admin1: { password: "adminpassword", role: "admin", id: "a1" },
  analyst1: { password: "analystpassword", role: "analyst", id: "an1" }, // New role!
  guest: { password: "guest", role: "guest", id: "g1" },
};

const MOCK_TOKENS = {
  mock_user_jwt: { username: "user1", role: "user", id: "u1" },
  mock_admin_jwt: { username: "admin1", role: "admin", id: "a1" },
  mock_analyst_jwt: { username: "analyst1", role: "analyst", id: "an1" }, // New token!
};

const verifyToken = (token) => MOCK_TOKENS[token];

// --- Helper functions ---
const simulateLatency = (minMs, maxMs) => {
  const latency = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, latency));
};

const generateLongText = (words = 1000) => {
  const lorem =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
  let longText = "";
  for (let i = 0; i < words; i++) {
    longText +=
      lorem.split(" ")[Math.floor(Math.random() * lorem.split(" ").length)] +
      " ";
  }
  return longText.trim();
};

const generateCSV = (data) => {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) => Object.values(row).join(",")).join("\n");
  return `${headers}\n${rows}`;
};

// --- Mock Data Generation ---
let contentCounter = 1;
const mockContents = {}; // Existing content data
for (let i = 1; i <= 30; i++) {
  const content = {
    id: contentCounter++,
    title: `Standard Article ${i}`,
    author: `Author ${Math.floor(Math.random() * 5) + 1}`,
    views: Math.floor(Math.random() * 1000) + 100,
    summary: `Summary of article ${i}.`,
    body: generateLongText(800),
    comments_count: Math.floor(Math.random() * 20),
    likes: Math.floor(Math.random() * 100),
    tags: ["tech", "news", "popular"][Math.floor(Math.random() * 3)],
    createdAt: new Date(
      Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
    ).toISOString(),
    last_updated: new Date().toISOString(),
  };
  mockContents[content.id] = content;
}
for (let i = 31; i <= 35; i++) {
  const content = {
    id: contentCounter++,
    title: `Deep Dive Report ${i - 30}`,
    author: `Senior Analyst ${Math.floor(Math.random() * 2) + 1}`,
    views: Math.floor(Math.random() * 500) + 50,
    summary: `A comprehensive report.`,
    body: generateLongText(5000),
    comments_count: 0,
    likes: 0,
    tags: "report",
    createdAt: new Date(
      Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
    ).toISOString(),
    last_updated: new Date().toISOString(),
  };
  mockContents[content.id] = content;
}

const trendingContentIds = Object.keys(mockContents).slice(0, 10);

// Mock Job Storage for report generation
const mockJobs = new Map(); // jobId -> { status, data, createdAt, progress }

// --- Middleware for Authentication (simple mock) ---
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    req.user = verifyToken(token);
  } else {
    req.user = { role: "guest", username: "guest", id: "g1" };
  }
  next();
});

// --- API Endpoints ---

// 0. GET /api/v1/health - Very fast health check
app.get("/api/v1/health", async (req, res) => {
  console.log(`[Backend][${req.user.username}] Received GET /api/v1/health.`);
  await simulateLatency(30, 80);
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    source: "Mock Backend",
  });
});

// 1. POST /api/v1/auth/login - Authentication (No Cache/Dedupe)
app.post("/api/v1/auth/login", async (req, res) => {
  console.log(
    `[Backend][${req.user.username}] Received POST /api/v1/auth/login.`
  );
  await simulateLatency(150, 300);
  const { username, password } = req.body;

  const user = MOCK_USERS[username];
  if (user && user.password === password) {
    const mockToken =
      username === "user1"
        ? "mock_user_jwt"
        : username === "admin1"
        ? "mock_admin_jwt"
        : username === "analyst1"
        ? "mock_analyst_jwt"
        : null;
    if (mockToken) {
      console.log(`[Backend] User ${username} logged in.`);
      return res.json({
        message: "Login successful",
        token: mockToken,
        user: { id: user.id, username: user.username, role: user.role },
      });
    }
  }
  console.log(`[Backend] Login failed for ${username}.`);
  res.status(401).json({ message: "Invalid credentials" });
});

// 2. GET /api/v1/feed/global-trending - Simulated External API Call, HIGH Latency, Cacheable
app.get("/api/v1/feed/global-trending", async (req, res) => {
  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/feed/global-trending. Simulating EXTERNAL API call...`
  );
  await simulateLatency(1500, 3000);

  if (Math.random() < 0.15) {
    // Increased failure rate to 15%
    console.warn(
      `[Backend][${req.user.username}] Simulated external API rate limit hit for global trending.`
    );
    return res.status(503).json({
      message: "Service Unavailable - External API limit reached",
      source: "Mock Backend",
    });
  }

  const trendingTopics = [
    {
      topic: "#AIRevolution",
      volume: Math.floor(Math.random() * 500000) + 100000,
    },
    {
      topic: "#GreenEnergy",
      volume: Math.floor(Math.random() * 300000) + 50000,
    },
    {
      topic: "#FutureOfWork",
      volume: Math.floor(Math.random() * 200000) + 30000,
    },
    {
      topic: "#Web3Gaming",
      volume: Math.floor(Math.random() * 100000) + 10000,
    },
  ];

  console.log(
    `[Backend][${req.user.username}] Responding to GET /api/v1/feed/global-trending.`
  );
  res.json({
    timestamp: new Date().toISOString(),
    topics: trendingTopics,
    source: "Mock External Service",
  });
});

// 3. GET /api/v1/user/:id/dashboard-summary - Complex Internal Aggregation, Authenticated, Cache per user
app.get("/api/v1/user/:id/dashboard-summary", async (req, res) => {
  const targetUserId = req.params.id;
  if (
    req.user.role !== "admin" &&
    req.user.role !== "analyst" &&
    req.user.id !== targetUserId
  ) {
    console.warn(
      `[Backend][${req.user.username}] Unauthorized attempt to view dashboard for user ${targetUserId}.`
    );
    return res
      .status(403)
      .json({ message: "Access denied.", source: "Mock Backend" });
  }

  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/user/${targetUserId}/dashboard-summary. Simulating complex aggregation...`
  );
  await simulateLatency(1000, 2000);

  const userPosts = Object.values(mockContents).filter((c) =>
    c.author.includes(targetUserId === "u1" ? "Author 1" : "Admin 1")
  );
  const totalViews = userPosts.reduce((sum, post) => sum + post.views, 0);
  const totalLikes = userPosts.reduce((sum, post) => sum + post.likes, 0);

  console.log(
    `[Backend][${req.user.username}] Responding to GET /api/v1/user/${targetUserId}/dashboard-summary.`
  );
  res.json({
    timestamp: new Date().toISOString(),
    userId: targetUserId,
    username: req.user.username,
    role: req.user.role,
    summary: {
      articlesPublished: userPosts.length,
      totalViews: totalViews,
      totalLikes: totalLikes,
      recentActivity: `Last updated ${new Date(
        userPosts[0]?.last_updated || Date.now()
      ).toLocaleTimeString()}`,
      recommendedTopics: ["AI", "Data Science", "Blockchain"],
    },
    source: "Mock Backend Aggregation",
  });
});

// 4. GET /api/v1/content/:id/full-detail - Large Content, Cacheable
app.get("/api/v1/content/:id/full-detail", async (req, res) => {
  const contentId = parseInt(req.params.id);
  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/content/${contentId}/full-detail. Simulating large data retrieval/rendering...`
  );
  await simulateLatency(800, 1800);

  const content = mockContents[contentId];
  if (content) {
    const version = req.query.version || "v1";
    let fullContentBody = content.body;
    if (version === "v2") {
      fullContentBody = `<div style="background-color:#f0f0f0; padding: 20px; border-left: 5px solid #007bff;">${content.body}<p><em>(Rendered with v2 layout improvements)</em></p></div>`;
    } else {
      fullContentBody = `<div>${content.body}</div>`;
    }
    console.log(
      `[Backend][${req.user.username}] Responding to GET /api/v1/content/${contentId}/full-detail (version: ${version}).`
    );
    res.json({
      id: content.id,
      title: content.title,
      author: content.author,
      html_body: fullContentBody,
      accessedBy: req.user.username,
      version: version,
      source: "Mock Backend Content Service",
    });
  } else {
    console.log(
      `[Backend][${req.user.username}] Content ${contentId} not found.`
    );
    res.status(404).json({
      message: "Content not found",
      source: "Mock Backend Content Service",
    });
  }
});

// 5. GET /api/v1/search/advanced - Complex Query Params, Deep Search, Cacheable
app.get("/api/v1/search/advanced", async (req, res) => {
  const {
    q,
    author,
    min_views,
    sort_by = "views",
    order = "desc",
    page = 1,
    limit = 10,
    tags,
  } = req.query; // Added tags
  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/search/advanced (query: ${q}, author: ${author}, tags: ${tags}, views>=${min_views}). Simulating complex search...`
  );
  await simulateLatency(600, 1500);

  let results = Object.values(mockContents);
  if (q) {
    const lowerQ = q.toLowerCase();
    results = results.filter(
      (c) =>
        c.title.toLowerCase().includes(lowerQ) ||
        c.summary.toLowerCase().includes(lowerQ)
    );
  }
  if (author) {
    results = results.filter((c) =>
      c.author.toLowerCase().includes(author.toLowerCase())
    );
  }
  if (min_views) {
    results = results.filter((c) => c.views >= parseInt(min_views));
  }
  if (tags) {
    results = results.filter((c) => c.tags.includes(tags.toLowerCase()));
  } // Filter by tags

  results.sort((a, b) => {
    /* sorting logic */
  });
  const startIndex = (parseInt(page) - 1) * parseInt(limit);
  const endIndex = startIndex + parseInt(limit);
  const paginatedResults = results.slice(startIndex, endIndex).map((c) => {
    const { body, ...rest } = c;
    return { ...rest, summary: rest.summary.substring(0, 150) + "..." };
  });

  console.log(
    `[Backend][${req.user.username}] Responding to GET /api/v1/search/advanced with ${paginatedResults.length} results.`
  );
  res.json({
    timestamp: new Date().toISOString(),
    query: req.query,
    count: results.length,
    page: parseInt(page),
    limit: parseInt(limit),
    results: paginatedResults,
    source: "Mock Backend Search Service",
  });
});

// 6. POST /api/v1/content/:id/comment - State Change, Authenticated, NO Cache/Dedupe
app.post("/api/v1/content/:id/comment", async (req, res) => {
  const contentId = parseInt(req.params.id);
  if (req.user.role === "guest") {
    return res
      .status(401)
      .json({ message: "Unauthorized.", source: "Mock Backend" });
  }
  console.log(
    `[Backend][${req.user.username}] Received POST /api/v1/content/${contentId}/comment. Simulating comment creation...`
  );
  await simulateLatency(200, 400);
  const content = mockContents[contentId];
  if (content) {
    content.comments_count++;
    console.log(
      `[Backend][${req.user.username}] Comment added to content ${contentId}.`
    );
    res.status(201).json({
      status: "success",
      contentId: contentId,
      newCommentsCount: content.comments_count,
      message: `Comment added by ${req.user.username}.`,
      source: "Mock Backend",
    });
  } else {
    res
      .status(404)
      .json({ message: "Content not found", source: "Mock Backend" });
  }
});

// 7. PUT /api/v1/content/:id - Content Update (Authenticated, Admin-only, NO Cache/Dedupe)
app.put("/api/v1/content/:id", async (req, res) => {
  const contentId = parseInt(req.params.id);
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Forbidden.", source: "Mock Backend" });
  }
  console.log(
    `[Backend][${req.user.username}] Received PUT /api/v1/content/${contentId}. Simulating content update...`
  );
  await simulateLatency(300, 600);
  const content = mockContents[contentId];
  if (content) {
    Object.assign(content, req.body, {
      last_updated: new Date().toISOString(),
    });
    console.log(
      `[Backend][${req.user.username}] Content ${contentId} updated.`
    );
    res.json({
      status: "success",
      contentId: contentId,
      updatedAt: content.last_updated,
      message: `Content ${contentId} updated successfully.`,
      source: "Mock Backend",
    });
  } else {
    res
      .status(404)
      .json({ message: "Content not found", source: "Mock Backend" });
  }
});

// --- New Analytics Endpoints ---

// 8. GET /api/v1/analytics/content-performance - Complex Aggregation, Cacheable, Admin/Analyst only
app.get("/api/v1/analytics/content-performance", async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "analyst") {
    console.warn(
      `[Backend][${req.user.username}] Unauthorized access to content performance analytics.`
    );
    return res.status(403).json({
      message: "Access denied. Requires admin or analyst role.",
      source: "Mock Backend",
    });
  }

  const { start_date, end_date, tag } = req.query;
  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/analytics/content-performance (dates: ${start_date}-${end_date}, tag: ${tag}). Simulating deep aggregation...`
  );
  await simulateLatency(1500, 3500); // Very high latency

  let filteredContents = Object.values(mockContents);
  if (tag) {
    filteredContents = filteredContents.filter(
      (c) => c.tags && c.tags.includes(tag.toLowerCase())
    );
  }
  if (start_date) {
    const sd = new Date(start_date);
    filteredContents = filteredContents.filter(
      (c) => new Date(c.createdAt) >= sd
    );
  }
  if (end_date) {
    const ed = new Date(end_date);
    filteredContents = filteredContents.filter(
      (c) => new Date(c.createdAt) <= ed
    );
  }

  const totalContent = filteredContents.length;
  const totalViews = filteredContents.reduce((sum, c) => sum + c.views, 0);
  const totalLikes = filteredContents.reduce((sum, c) => sum + c.likes, 0);
  const avgLikesPerContent =
    totalContent > 0 ? (totalLikes / totalContent).toFixed(2) : 0;
  const uniqueAuthors = [...new Set(filteredContents.map((c) => c.author))]
    .length;

  console.log(
    `[Backend][${req.user.username}] Responding to GET /api/v1/analytics/content-performance.`
  );
  res.json({
    timestamp: new Date().toISOString(),
    query: req.query,
    metrics: {
      totalContent,
      totalViews,
      totalLikes,
      avgLikesPerContent,
      uniqueAuthors,
      topTags: ["tech", "news", "popular", "report"]
        .sort(() => 0.5 - Math.random())
        .slice(0, 3), // Mock top tags
    },
    source: "Mock Backend Analytics Service",
  });
});

// 9. GET /api/v1/analytics/user-engagement-trends - Time-Series Data, Cacheable, Authenticated
app.get("/api/v1/analytics/user-engagement-trends", async (req, res) => {
  if (req.user.role === "guest") {
    return res.status(401).json({
      message: "Unauthorized. Requires login.",
      source: "Mock Backend",
    });
  }

  const { period = "daily", metric = "dau", user_id } = req.query;
  console.log(
    `[Backend][${
      req.user.username
    }] Received GET /api/v1/analytics/user-engagement-trends (period: ${period}, metric: ${metric}, user: ${
      user_id || "global"
    }). Simulating time-series data generation...`
  );
  await simulateLatency(1000, 2500); // High latency

  const generateTrendData = (count, baseValue, variability, id_seed = "") => {
    const data = [];
    let currentValue = baseValue;
    for (let i = 0; i < count; i++) {
      currentValue += (Math.random() - 0.5) * variability;
      data.push({
        date: new Date(Date.now() - (count - 1 - i) * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        value: Math.max(
          0,
          Math.round(currentValue * (id_seed ? 0.5 + Math.random() : 1))
        ), // Slightly personalized if user_id
      });
    }
    return data;
  };

  let trendData;
  let title = `${metric.toUpperCase()} ${
    period.charAt(0).toUpperCase() + period.slice(1)
  } Trends`;
  if (user_id) {
    title = `User ${user_id} ${metric.toUpperCase()} Trends`;
    trendData = generateTrendData(7, 50, 20, user_id); // Last 7 days, personalized
  } else {
    trendData = generateTrendData(30, 1000, 200); // Last 30 days, global
  }

  console.log(
    `[Backend][${req.user.username}] Responding to GET /api/v1/analytics/user-engagement-trends.`
  );
  res.json({
    timestamp: new Date().toISOString(),
    title: title,
    period: period,
    metric: metric,
    data: trendData,
    source: "Mock Backend Analytics Service",
  });
});

// 10. POST /api/v1/analytics/generate-report - Long-Running Task, No Cache/Dedupe, Returns Job ID
app.post("/api/v1/analytics/generate-report", async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "analyst") {
    return res.status(403).json({
      message: "Access denied. Requires admin or analyst role.",
      source: "Mock Backend",
    });
  }
  console.log(
    `[Backend][${req.user.username}] Received POST /api/v1/analytics/generate-report. Initiating background job...`
  );
  await simulateLatency(200, 500); // Quick response to start job

  const { report_type, filters } = req.body;
  const jobId = `report-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  mockJobs.set(jobId, {
    status: "queued",
    progress: 0,
    report_type,
    filters,
    requestedBy: req.user.username,
    createdAt: new Date().toISOString(),
    data: null, // Will hold the final report data
  });

  // Simulate background processing
  setTimeout(async () => {
    const job = mockJobs.get(jobId);
    if (job) {
      job.status = "processing";
      job.progress = 20;
      console.log(`[Backend] Job ${jobId} started processing.`);
      await simulateLatency(3000, 7000); // Long processing time
      job.progress = 80;
      await simulateLatency(1000, 2000); // Final crunch

      // Generate some mock report data (e.g., CSV content)
      const reportData = Object.values(mockContents).map((c) => ({
        id: c.id,
        title: c.title,
        author: c.author,
        views: c.views,
        likes: c.likes,
        comments: c.comments_count,
        tags: c.tags,
        createdAt: c.createdAt,
      }));
      job.data = generateCSV(reportData);
      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      console.log(`[Backend] Job ${jobId} completed.`);
    }
  }, 1000); // Start processing after 1 second

  res.status(202).json({
    message: "Report generation started successfully",
    job_id: jobId,
    status: "queued",
    source: "Mock Backend Job Service",
  });
});

// 11. GET /api/v1/analytics/report/:job_id/status - Status Check, Cacheable for short time
app.get("/api/v1/analytics/report/:job_id/status", async (req, res) => {
  const jobId = req.params.job_id;
  if (req.user.role === "guest") {
    return res.status(401).json({
      message: "Unauthorized. Requires login.",
      source: "Mock Backend",
    });
  }

  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/analytics/report/${jobId}/status.`
  );
  await simulateLatency(100, 300);

  const job = mockJobs.get(jobId);
  if (job) {
    // Only allow requestor or admin/analyst to check status
    if (
      job.requestedBy !== req.user.username &&
      req.user.role !== "admin" &&
      req.user.role !== "analyst"
    ) {
      console.warn(
        `[Backend][${req.user.username}] Unauthorized access to job status for ${jobId}.`
      );
      return res.status(403).json({
        message: "Access denied. You can only check your own report status.",
        source: "Mock Backend",
      });
    }
    res.json({
      job_id: jobId,
      status: job.status,
      progress: job.progress,
      requestedBy: job.requestedBy,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      source: "Mock Backend Job Service",
    });
  } else {
    res
      .status(404)
      .json({ message: "Job not found", source: "Mock Backend Job Service" });
  }
});

// 12. GET /api/v1/analytics/report/:job_id/download - Large File Download, Cacheable
app.get("/api/v1/analytics/report/:job_id/download", async (req, res) => {
  const jobId = req.params.job_id;
  if (req.user.role === "guest") {
    return res.status(401).json({
      message: "Unauthorized. Requires login.",
      source: "Mock Backend",
    });
  }

  console.log(
    `[Backend][${req.user.username}] Received GET /api/v1/analytics/report/${jobId}/download.`
  );
  await simulateLatency(800, 2000); // Simulating file retrieval

  const job = mockJobs.get(jobId);
  if (job && job.status === "completed") {
    // Only allow requestor or admin/analyst to download
    if (
      job.requestedBy !== req.user.username &&
      req.user.role !== "admin" &&
      req.user.role !== "analyst"
    ) {
      console.warn(
        `[Backend][${req.user.username}] Unauthorized access to download report for ${jobId}.`
      );
      return res.status(403).json({
        message: "Access denied. You can only download your own reports.",
        source: "Mock Backend",
      });
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="report-${jobId}.csv"`
    );
    res.send(job.data);
    console.log(`[Backend][${req.user.username}] Report ${jobId} downloaded.`);
  } else if (job && job.status !== "completed") {
    res.status(409).json({
      message: `Report ${jobId} is ${job.status}. Please wait.`,
      status: job.status,
      progress: job.progress,
      source: "Mock Backend Job Service",
    });
  } else {
    res.status(404).json({
      message: "Job not found or not completed",
      source: "Mock Backend Job Service",
    });
  }
});

app.listen(port, () => {
  console.log(`Mock Backend API listening on http://localhost:${port}`);
});
