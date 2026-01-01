const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getUserVoteHistory } = require("../controllers/userController");

router.get("/history", auth, getUserVoteHistory);

module.exports = router;
