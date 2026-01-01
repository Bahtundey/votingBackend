function adminOnly(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access only" });
    }

    next();
  } catch (err) {
    console.error("ADMIN ONLY MIDDLEWARE ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = adminOnly;
