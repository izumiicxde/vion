// routes/analytics.js

const express = require("express");
const router = express.Router();
const { isAuthenticated, isAuthorized } = require("../middleware/auth");
const {
    getContentPerformance,
    getUserEngagementTrends,
    generateReport,
    getReportStatus,
    downloadReport
} = require("../controllers/analyticsController");

// Middleware to check if user is the requester OR an admin/analyst for jobs
const canAccessJob = (req, res, next) => {
    const jobId = req.params.job_id;
    const job = require("../helpers/mockdata").mockJobs.get(jobId);

    if (!job) {
        return res.status(404).json({ message: "Job not found", source: "Analytics Router" });
    }

    if (
        job.requestedBy !== req.user.username &&
        !["admin", "analyst"].includes(req.user.role)
    ) {
        return res.status(403).json({
            message: "Access denied. You can only view/download your own reports.",
            source: "Analytics Router"
        });
    }
    next();
};

router.get("/content-performance", isAuthorized(["admin", "analyst"]), getContentPerformance);
router.get("/user-engagement-trends", isAuthenticated, getUserEngagementTrends);
router.post("/generate-report", isAuthorized(["admin", "analyst"]), generateReport);

// Apply job access middleware to status and download routes
router.get("/report/:job_id/status", isAuthenticated, canAccessJob, getReportStatus);
router.get("/report/:job_id/download", isAuthenticated, canAccessJob, downloadReport);
module.exports = router;