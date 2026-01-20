const crypto = require("crypto");
const User = require("../models/user.model.js");
const Session = require("../models/session.model.js");
const { pgClient } = require("../config/db.config.pg.js");

const authenticate = async (req, res, next) => {
  const { sessionToken } = req.cookies;
  if (!sessionToken || typeof sessionToken !== "string") {
    return res.status(400).json({ error: "Unauthorized" });
  }

  try {
    const searchQuery = `
    select * from sessions
    where session_token = $1
    and status ='valid'
    and expires_at > now()`;

    const result = await pgClient.query(searchQuery, [sessionToken]);
    const session = result.rows[0];

    if (!session) {
      res.clearCookie("sessionToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
      });
      return res.status(400).json({ error: "Session expired or invalid" });
    }

    const userQuery = `
    select * from users
    where id = $1`;
    const userRes = await pgClient.query(userQuery, [session.user_id]);
    const user = userRes.rows[0];
    if (!user) {
      await pgClient.query(
        `update sessions set status = 'expired' where id = $1`,
        [session.id],
      );
      res.clearCookie("sessionToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
      });
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
