const express = require("express");
const auth = require("../middleware/auth");
const {
  registerUser,
  registerAdmin,
  login,
  getMe,
  updateProfile,
} = require("../controllers/authController");

const User = require("../models/User");

const router = express.Router();


router.post("/register", registerUser);

router.post("/register-admin", registerAdmin);


router.post("/login", login);


router.get("/check-email", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.json({ exists: false });

    const exists = await User.findOne({ email });
    res.json({ exists: !!exists });
  } catch (err) {
    console.error("CHECK EMAIL ERROR:", err);
    res.status(500).json({ exists: false });
  }
});


router.get("/me", auth, getMe);

router.put("/update-profile", auth, updateProfile);

module.exports = router;
