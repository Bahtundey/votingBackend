const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

const {
  createPoll,
  getPolls,
  getPollById,
  getActivePolls,
  getHistoryPolls,
  votePoll,
  updatePoll,
  deletePoll,
} = require("../controllers/pollController");




router.get("/", auth, getPolls);
router.get("/active", auth, getActivePolls);
router.get("/history", auth, getHistoryPolls);
router.get("/:id", auth, getPollById);


router.post("/:id/vote", auth, votePoll);



router.post("/", auth, adminOnly, createPoll);


router.put("/:id", auth, adminOnly, updatePoll);


router.delete("/:id", auth, adminOnly, deletePoll);

module.exports = router;
