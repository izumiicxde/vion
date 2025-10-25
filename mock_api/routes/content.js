// routes/content.js

const express = require("express");
const router = express.Router();
const { isAuthenticated, isAuthorized } = require("../middleware/auth");
const { 
    getDashboardSummary, 
    getContentDetail, 
    advancedSearch, 
    addComment, 
    updateContent 
} = require("../controllers/contentController");

// Use an inline middleware function for granular dashboard authorization (self or admin/analyst)
const canAccessDashboard = (req, res, next) => {
    const targetUserId = req.params.id;
    if (
        req.user.role !== "admin" &&
        req.user.role !== "analyst" &&
        req.user.id !== targetUserId
    ) {
        return res.status(403).json({ message: "Access denied to view this dashboard.", source: "Content Router" });
    }
    next();
};

router.get("/user/:id/dashboard-summary", isAuthenticated, canAccessDashboard, getDashboardSummary);
router.get("/content/:id/full-detail", getContentDetail);
router.get("/search/advanced", advancedSearch);
router.post("/content/:id/comment", isAuthenticated, addComment);
router.put("/content/:id", isAuthorized(["admin"]), updateContent);

module.exports = router;