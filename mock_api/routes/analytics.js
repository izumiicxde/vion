// routes/analytics.js
const express = require("express");
const router = express.Router();
const { isAuthenticated, isAuthorized } = require("../middleware/auth");
const {
    getContentPerformance,
    getUserEngagementTrends,
    generateReport,
    getReportStatus,
    downloadReport,
    sendCSVReport
} = require("../controllers/analyticsController");

// Middleware to check if user can access a job
const canAccessJob = (req, res, next) => {
    const job = require("../helpers/mockdata").mockJobs.get(req.params.job_id);
    if (!job) return res.status(404).json({ message: "Job not found", source: "Analytics Router" });

    if (job.requestedBy !== req.user.username && !["admin", "analyst"].includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied", source: "Analytics Router" });
    }
    next();
};

// Routes
router.get("/content-performance", isAuthorized(["admin", "analyst"]), getContentPerformance);
router.get("/user-engagement-trends", isAuthenticated, getUserEngagementTrends);
router.post("/generate-report", isAuthorized(["admin", "analyst"]), generateReport);
router.get("/report/:job_id/status", isAuthenticated, canAccessJob, getReportStatus);
router.get("/report/:job_id/download", isAuthenticated, canAccessJob, downloadReport);
router.get("/report/download-csv", isAuthenticated, sendCSVReport);

module.exports = router;
