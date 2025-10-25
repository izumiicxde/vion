// helpers/mockData.js

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

// --- Helper functions ---
const simulateLatency = (minMs, maxMs) => {
    const latency = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, latency));
};

const generateLongText = (words = 1000) => {
    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
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
const mockContents = {};
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
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
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
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        last_updated: new Date().toISOString(),
    };
    mockContents[content.id] = content;
}

// Mock Job Storage for report generation
const mockJobs = new Map(); // jobId -> { status, data, createdAt, progress }

module.exports = {
    MOCK_USERS,
    MOCK_TOKENS,
    verifyToken,
    simulateLatency,
    generateLongText,
    generateCSV,
    mockContents,
    mockJobs,
};