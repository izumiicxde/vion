const express = require("express");
const router = express.Router();
const { login, getGlobalTrending } = require("../controllers/feedController");

router.post("/auth/login", login);
router.get("/feed/global-trending", getGlobalTrending);

module.exports = router;
