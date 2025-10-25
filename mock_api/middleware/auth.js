// middleware/auth.js

const { verifyToken } = require("../helpers/mockdata");

// Middleware 1: Extracts token and sets req.user (or guest)
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        req.user = verifyToken(token);
    }

    if (!req.user) {
        req.user = { role: "guest", username: "guest", id: "g1" };
    }

    console.log(`[Middleware] Request from user: ${req.user.username} (Role: ${req.user.role})`);
    next();
};

// Middleware 2: Restricts access to authenticated users (not guest)
const isAuthenticated = (req, res, next) => {
    if (req.user.role === "guest") {
        return res.status(401).json({
            message: "Unauthorized. Requires login.",
            source: "Auth Middleware"
        });
    }
    next();
};

// Middleware 3: Restricts access based on required roles
const isAuthorized = (requiredRoles) => (req, res, next) => {
    if (!requiredRoles.includes(req.user.role)) {
        return res.status(403).json({
            message: `Forbidden. Requires one of: ${requiredRoles.join(", ")} role.`,
            source: "Auth Middleware"
        });
    }
    next();
};

module.exports = {
    authMiddleware,
    isAuthenticated,
    isAuthorized,
};