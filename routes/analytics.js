const router = require("express").Router();
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

const { getPollAnalytics } = require("../controllers/analyticsController");

router.get("/:id", auth, adminOnly, getPollAnalytics);

module.exports = router;
