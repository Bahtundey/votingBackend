
const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  
  return res.json({ ok: true, message: "Message received" });
});

module.exports = router; 
