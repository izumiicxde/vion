// controllers/feedController.js

const { MOCK_USERS, simulateLatency } = require("../helpers/mockData");

const login = async (req, res) => {
  console.log(`[Controller] Handling login request.`);
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
      return res.json({
        message: "Login successful",
        token: mockToken,
        user: { id: user.id, username: user.username, role: user.role },
      });
    }
  }
  console.log(`[Controller] Login failed for ${username}.`);
  res.status(401).json({ message: "Invalid credentials" });
};

const getGlobalTrending = async (req, res) => {
  console.log(
    `[Controller] Simulating EXTERNAL API call for global trending...`
  );
  await simulateLatency(1500, 3000);

  if (Math.random() < 0.15) {
    return res.status(503).json({
      message: "Service Unavailable - External API limit reached",
      source: "Mock External Service",
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

  res.json({
    timestamp: new Date().toISOString(),
    topics: trendingTopics,
    source: "Mock External Service",
  });
};

module.exports = {
  login,
  getGlobalTrending,
};
