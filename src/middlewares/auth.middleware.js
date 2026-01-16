const crypto = require("crypto");
const User = require("../models/user.model.js");
const Session = require("../models/session.model.js");

const authenticate = async (req, res, next) => {
  const { sessionToken } = req.cookies;
  if (!sessionToken || typeof sessionToken !== "string") {
    return res.status(400).json({ error: "Unauthorized" });
  }

  try {
    const session = await Session.findOne({ sessionToken });

    if (
      !session ||
      session.status !== "valid" ||
      session.expiresAt < new Date()
    ) {
      if (session) {
        session.status = "expired";
        await session.save();
      }
      res.clearCookie("sessionToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
      });
      return res.status(400).json({ error: "Session expired or invalid" });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      session.status = "expired";
      await session.save();
      res.clearCookie("sessionToken");
      return res.status(400).json({ error: "User not found" });
    }

    req.user = user;
    req.authSession = session;
    return next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const csrfCheck = async (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const csrfToken = req.headers["x-csrf-token"];
  if (
    !csrfToken ||
    csrfToken !== req.authSession?.csrfToken ||
    req.authSession.status !== "valid"
  ) {
    return res.status(403).json({ error: "CSRF token mismatch" });
  }

  return next();
};

module.exports = { authenticate, csrfCheck };
