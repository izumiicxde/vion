// controllers/analyticsController.js
const { simulateLatency, mockContents, mockJobs, generateCSV } = require("../helpers/mockdata");
const PDFDocument = require("pdfkit"); // optional if PDF endpoint is needed

// --- Helper function for trend data ---
const generateTrendData = (count, baseValue, variability, id_seed = "") => {
    const data = [];
    let currentValue = baseValue;
    for (let i = 0; i < count; i++) {
        currentValue += (Math.random() - 0.5) * variability;
        data.push({
            date: new Date(Date.now() - (count - 1 - i) * 24 * 60 * 60 * 1000)
                .toISOString().split("T")[0],
            value: Math.max(0, Math.round(currentValue * (id_seed ? 0.5 + Math.random() : 1))),
        });
    }
    return data;
};

// --- Analytics Endpoints ---
const getContentPerformance = async (req, res) => {
    const { tag } = req.query;
    await simulateLatency(500, 1000);

    let filteredContents = Object.values(mockContents);
    if (tag) {
        filteredContents = filteredContents.filter(c => c.tags && c.tags.includes(tag.toLowerCase()));
    }

    const totalContent = filteredContents.length;
    const totalViews = filteredContents.reduce((sum, c) => sum + c.views, 0);
    const totalLikes = filteredContents.reduce((sum, c) => sum + c.likes, 0);

    res.json({
        timestamp: new Date().toISOString(),
        query: req.query,
        metrics: {
            totalContent,
            totalViews,
            totalLikes,
            avgLikesPerContent: totalContent ? (totalLikes / totalContent).toFixed(2) : 0,
            uniqueAuthors: [...new Set(filteredContents.map(c => c.author))].length,
            topTags: ["tech", "news", "popular", "report"].sort(() => 0.5 - Math.random()).slice(0, 3),
        },
        source: "Analytics Controller Aggregation Service",
    });
};

const getUserEngagementTrends = async (req, res) => {
    const { period = "daily", metric = "dau", user_id } = req.query;
    await simulateLatency(1000, 2500);

    const title = `${metric.toUpperCase()} Trends`;
    const trendData = user_id ? generateTrendData(7, 50, 20, user_id) : generateTrendData(30, 1000, 200);

    res.json({
        timestamp: new Date().toISOString(),
        title,
        period,
        metric,
        data: trendData,
        source: "Analytics Controller Time-Series Service",
    });
};

const generateReport = async (req, res) => {
    const { report_type, filters } = req.body;
    const jobId = `report-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    mockJobs.set(jobId, {
        status: "queued", progress: 0, report_type, filters, requestedBy: req.user.username,
        createdAt: new Date().toISOString(), data: null,
    });

    setTimeout(async () => {
        const job = mockJobs.get(jobId);
        if (job) {
            job.status = "processing"; job.progress = 20;
            await simulateLatency(3000, 7000);
            job.progress = 80;
            await simulateLatency(1000, 2000);

            const reportData = Object.values(mockContents).map(c => ({
                id: c.id, title: c.title, author: c.author,
                views: c.views, likes: c.likes, comments: c.comments_count,
                tags: c.tags, createdAt: c.createdAt,
            }));

            job.data = generateCSV(reportData);
            job.status = "completed"; job.progress = 100;
            job.completedAt = new Date().toISOString();
        }
    }, 1000);

    res.status(202).json({
        message: "Report generation started successfully",
        job_id: jobId,
        status: "queued",
        source: "Analytics Controller Job Service",
    });
};

const getReportStatus = async (req, res) => {
    const jobId = req.params.job_id;
    const job = mockJobs.get(jobId);

    if (job) {
        res.json({
            job_id: jobId,
            status: job.status,
            progress: job.progress,
            requestedBy: job.requestedBy,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
            source: "Analytics Controller Job Service",
        });
    } else {
        res.status(404).json({ message: "Job not found", source: "Analytics Controller Job Service" });
    }
};

const downloadReport = async (req, res) => {
    const jobId = req.params.job_id;
    const job = mockJobs.get(jobId);

    if (job && job.status === "completed") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="report-${jobId}.csv"`);
        res.send(job.data);
    } else if (job) {
        res.status(409).json({
            message: `Report ${jobId} is ${job.status}. Please wait.`,
            status: job.status,
            progress: job.progress,
            source: "Analytics Controller Job Service",
        });
    } else {
        res.status(404).json({ message: "Job not found or not completed", source: "Analytics Controller Job Service" });
    }
};

// --- New Direct CSV Download ---
const sendCSVReport = async (req, res) => {
    const data = Object.values(mockContents).map(c => ({
        id: c.id, title: c.title, author: c.author,
        views: c.views, likes: c.likes, comments: c.comments_count,
        tags: Array.isArray(c.tags) ? c.tags.join("|") : c.tags,
        createdAt: c.createdAt,
    }));

    const csvData = generateCSV(data);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="mock_report.csv"`);
    res.send(csvData);
};

module.exports = {
    getContentPerformance,
    getUserEngagementTrends,
    generateReport,
    getReportStatus,
    downloadReport,
    sendCSVReport,
};
