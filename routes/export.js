const express = require("express");
const router = express.Router();
const { exportCSV, exportPDF } = require("../controllers/exportController");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");


router.get("/:id/csv", auth, adminOnly, exportCSV);
router.get("/:id/pdf", auth, adminOnly, exportPDF);

module.exports = router;
