// controllers/contentController.js

const { mockContents, simulateLatency } = require("../helpers/mockdata");

const getDashboardSummary = async (req, res) => {
    const targetUserId = req.params.id;

    console.log(`[Controller] Simulating complex aggregation for user ${targetUserId}...`);
    await simulateLatency(1000, 2000);

    const userPosts = Object.values(mockContents).filter((c) =>
        c.author.includes(targetUserId === "u1" ? "Author 1" : "Admin 1")
    );
    const totalViews = userPosts.reduce((sum, post) => sum + post.views, 0);
    const totalLikes = userPosts.reduce((sum, post) => sum + post.likes, 0);

    res.json({
        timestamp: new Date().toISOString(),
        userId: targetUserId,
        username: req.user.username,
        role: req.user.role,
        summary: {
            articlesPublished: userPosts.length,
            totalViews: totalViews,
            totalLikes: totalLikes,
            recentActivity: `Last updated ${new Date(userPosts[0]?.last_updated || Date.now()).toLocaleTimeString()}`,
            recommendedTopics: ["AI", "Data Science", "Blockchain"],
        },
        source: "Content Controller Aggregation",
    });
};

const getContentDetail = async (req, res) => {
    const contentId = parseInt(req.params.id);
    console.log(`[Controller] Simulating large data retrieval for content ${contentId}...`);
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
        res.json({
            id: content.id,
            title: content.title,
            author: content.author,
            html_body: fullContentBody,
            accessedBy: req.user.username,
            version: version,
            source: "Content Controller Content Service",
        });
    } else {
        res.status(404).json({ message: "Content not found", source: "Content Controller Content Service" });
    }
};

const advancedSearch = async (req, res) => {
    const { q, author, min_views, sort_by = "views", order = "desc", page = 1, limit = 10, tags } = req.query;
    console.log(`[Controller] Simulating complex search...`);
    await simulateLatency(600, 1500);

    let results = Object.values(mockContents);

    // --- Filtering Logic ---
    if (q) {
        const lowerQ = q.toLowerCase();
        results = results.filter((c) => c.title.toLowerCase().includes(lowerQ) || c.summary.toLowerCase().includes(lowerQ));
    }
    if (tags) {
        results = results.filter((c) => c.tags.includes(tags.toLowerCase()));
    }

    // --- Pagination Logic ---
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedResults = results.slice(startIndex, endIndex).map((c) => {
        const { body, ...rest } = c;
        return { ...rest, summary: rest.summary.substring(0, 150) + "..." };
    });

    res.json({
        timestamp: new Date().toISOString(),
        query: req.query,
        count: results.length,
        page: parseInt(page),
        limit: parseInt(limit),
        results: paginatedResults,
        source: "Content Controller Search Service",
    });
};

const addComment = async (req, res) => {
    const contentId = parseInt(req.params.id);
    console.log(`[Controller] Simulating comment creation...`);
    await simulateLatency(200, 400);
    const content = mockContents[contentId];
    if (content) {
        content.comments_count++; // State Change
        res.status(201).json({
            status: "success",
            contentId: contentId,
            newCommentsCount: content.comments_count,
            message: `Comment added by ${req.user.username}.`,
            source: "Content Controller",
        });
    } else {
        res.status(404).json({ message: "Content not found", source: "Content Controller" });
    }
};

const updateContent = async (req, res) => {
    const contentId = parseInt(req.params.id);
    console.log(`[Controller] Simulating content update...`);
    await simulateLatency(300, 600);
    const content = mockContents[contentId];
    if (content) {
        Object.assign(content, req.body, {
            last_updated: new Date().toISOString(),
        });
        res.json({
            status: "success",
            contentId: contentId,
            updatedAt: content.last_updated,
            message: `Content ${contentId} updated successfully.`,
            source: "Content Controller",
        });
    } else {
        res.status(404).json({ message: "Content not found", source: "Content Controller" });
    }
};

module.exports = {
    getDashboardSummary,
    getContentDetail,
    advancedSearch,
    addComment,
    updateContent,
};