const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const nodemailer = require("nodemailer");



const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendMail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"VoteX" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log("📧 Email sent to:", to);
  } catch (err) {
    console.error(" Email error:", err.message);
  }
}

module.exports = sendMail;


if (!process.env.JWT_SECRET) {
  throw new Error(" JWT_SECRET is not defined in environment variables");
}

const JWT_SECRET = process.env.JWT_SECRET;


function generateToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}


async function registerUser(req, res) {
  try {
    const { name, email, password } = req.body;

    
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Email already registered" });
    }

   
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "user",
    });

    const token = generateToken(user);

    
    sendMail(
      user.email,
      "Welcome to VoteX 🎉",
      `
        <div style="font-family: Arial, sans-serif;">
          <h2>Welcome, ${user.name} </h2>
          <p>Your VoteX account has been created successfully.</p>

          <p><strong>What you can do now:</strong></p>
          <ul>
            <li>Vote in active polls</li>
            <li>See real-time results</li>
            <li>Track your voting history</li>
          </ul>

          <p>
             <a href="http://localhost:5173/login">
              Login to VoteX
            </a>
          </p>

          <hr />
          <p style="font-size: 12px; color: #777;">
            If you did not create this account, please ignore this email.
          </p>
        </div>
      `
    ).catch(err => {
      console.error(" Welcome email failed:", err.message);
    });

    
    return res.status(201).json({
      ok: true,
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
      },
    });

  } catch (err) {
    console.error("REGISTER USER ERROR:", err);
    return res.status(500).json({ error: "Registration failed" });
  }
}



async function registerAdmin(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
    });

    const token = generateToken(admin);

    return res.status(201).json({
      ok: true,
      message: "Admin registered successfully",
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        avatar: admin.avatar || null,
      },
    });
  } catch (err) {
    console.error("REGISTER ADMIN ERROR:", err);
    return res.status(500).json({ error: "Admin registration failed" });
  }
}


async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);

    return res.json({
      ok: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role, 
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Login failed" });
  }
}


async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: "User not found" });

    return res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    console.error("GET ME ERROR:", err);
    return res.status(500).json({ error: "Failed to load user" });
  }
}


async function updateProfile(req, res) {
  try {
    const { name, email, password } = req.body;

    const user = await User.findById(req.user.id).select("+password");
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;

    if (password && password.length >= 6) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    return res.json({
      ok: true,
      message: "Profile updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    return res.status(500).json({ error: "Profile update failed" });
  }
}

module.exports = {
  registerUser,
  registerAdmin,
  login,
  getMe,
  updateProfile,
};
