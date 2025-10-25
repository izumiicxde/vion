// controllers/analyticsController.js

const { simulateLatency, mockContents, mockJobs, generateCSV } = require("../helpers/mockData");

const generateTrendData = (count, baseValue, variability, id_seed = "") => {
    const data = [];
    let currentValue = baseValue;
    for (let i = 0; i < count; i++) {
        currentValue += (Math.random() - 0.5) * variability;
        data.push({
            date: new Date(Date.now() - (count - 1 - i) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            value: Math.max(0, Math.round(currentValue * (id_seed ? 0.5 + Math.random() : 1))), 
        });
    }
    return data;
};

const getContentPerformance = async (req, res) => {
    const { start_date, end_date, tag } = req.query;
    console.log(`[Controller] Simulating deep aggregation for content performance...`);
    await simulateLatency(1500, 3500); // Very high latency

    let filteredContents = Object.values(mockContents);
    if (tag) {
        filteredContents = filteredContents.filter((c) => c.tags && c.tags.includes(tag.toLowerCase()));
    }
    
    const totalContent = filteredContents.length;
    const totalViews = filteredContents.reduce((sum, c) => sum + c.views, 0);
    const totalLikes = filteredContents.reduce((sum, c) => sum + c.likes, 0);
    const avgLikesPerContent = totalContent > 0 ? (totalLikes / totalContent).toFixed(2) : 0;

    res.json({
        timestamp: new Date().toISOString(),
        query: req.query,
        metrics: {
            totalContent,
            totalViews,
            totalLikes,
            avgLikesPerContent,
            uniqueAuthors: [...new Set(filteredContents.map((c) => c.author))].length,
            topTags: ["tech", "news", "popular", "report"].sort(() => 0.5 - Math.random()).slice(0, 3), 
        },
        source: "Analytics Controller Aggregation Service",
    });
};

const getUserEngagementTrends = async (req, res) => {
    const { period = "daily", metric = "dau", user_id } = req.query;
    console.log(`[Controller] Simulating time-series data generation...`);
    await simulateLatency(1000, 2500); // High latency

    let title = `${metric.toUpperCase()} Trends`;
    let trendData = user_id ? generateTrendData(7, 50, 20, user_id) : generateTrendData(30, 1000, 200);

    res.json({
        timestamp: new Date().toISOString(),
        title: title,
        period: period,
        metric: metric,
        data: trendData,
        source: "Analytics Controller Time-Series Service",
    });
};

const generateReport = async (req, res) => {
    console.log(`[Controller] Initiating background job...`);
    await simulateLatency(200, 500); 

    const { report_type, filters } = req.body;
    const jobId = `report-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    mockJobs.set(jobId, {
        status: "queued", progress: 0, report_type, filters, requestedBy: req.user.username,
        createdAt: new Date().toISOString(), data: null,
    });

    // Simulate background processing
    setTimeout(async () => {
        const job = mockJobs.get(jobId);
        if (job) {
            job.status = "processing"; job.progress = 20;
            await simulateLatency(3000, 7000); 
            job.progress = 80;
            await simulateLatency(1000, 2000); 
            
            const reportData = Object.values(mockContents).map((c) => ({
                id: c.id, title: c.title, author: c.author, views: c.views, likes: c.likes, comments: c.comments_count, tags: c.tags, createdAt: c.createdAt, 
            }));

            job.data = generateCSV(reportData);
            job.status = "completed"; job.progress = 100;
            job.completedAt = new Date().toISOString();
            console.log(`[Controller] Job ${jobId} completed.`);
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
    console.log(`[Controller] Checking status for job ${jobId}.`);
    await simulateLatency(100, 300);

    const job = mockJobs.get(jobId);
    if (job) {
        // NOTE: The router ensures the user is authenticated. 
        res.json({
            job_id: jobId, status: job.status, progress: job.progress, requestedBy: job.requestedBy,
            createdAt: job.createdAt, completedAt: job.completedAt,
            source: "Analytics Controller Job Service",
        });
    } else {
        res.status(404).json({ message: "Job not found", source: "Analytics Controller Job Service" });
    }
};

const downloadReport = async (req, res) => {
    const jobId = req.params.job_id;
    console.log(`[Controller] Simulating file retrieval for job ${jobId}.`);
    await simulateLatency(800, 2000); 

    const job = mockJobs.get(jobId);
    if (job && job.status === "completed") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="report-${jobId}.csv"`);
        res.send(job.data);
    } else if (job && job.status !== "completed") {
        res.status(409).json({
            message: `Report ${jobId} is ${job.status}. Please wait.`, status: job.status, progress: job.progress,
            source: "Analytics Controller Job Service",
        });
    } else {
        res.status(404).json({ message: "Job not found or not completed", source: "Analytics Controller Job Service" });
    }
};

module.exports = {
    getContentPerformance,
    getUserEngagementTrends,
    generateReport,
    getReportStatus,
    downloadReport,
};