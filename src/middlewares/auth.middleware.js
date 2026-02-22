const crypto = require("crypto");
const User = require("../models/user.model.js");
const Session = require("../models/session.model.js");
const { pgClient } = require("../config/db.config.pg.js");
const { countTimeForRecovery } = require("../controllers/user.controller.js");

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

    // Allow in-complete sessions through for: (1) complete-data, (2) GET /api/auth, (3) GET /api/report/* (admin fetch reports)
    const isCompleteDataRoute = req.originalUrl && req.originalUrl.includes("complete-data");
    const isGetAuthRoute = req.method === "GET" && req.originalUrl && req.originalUrl.split("?")[0].endsWith("/auth");
    const isReportRoute = req.method === "GET" && req.originalUrl && req.originalUrl.includes("/report/");
    if (session.session_type === "in-complete" && !isCompleteDataRoute && !isGetAuthRoute && !isReportRoute) {
      return res.status(200).json({ redirect: `redirect to complete-profile` });
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

    if (user.is_deleted === true) {
      if (countTimeForRecovery(user.deleted_at) <= 0) {
        await pgClient.query(
          `update sessions set status ='expired' where id =$1`,
          [session.id],
        );
        return res.status(403).json({ error: "Account deleted permanently" });
      }
    }

    const suspendUserRes = await pgClient.query(
      `select * from suspended_user where user_id =$1`,
      [user.id],
    );

    const suspendRes = suspendUserRes.rows[0];

    if (suspendRes) {
      if (!suspendRes.suspend_until) {
        return res
          .status(403)
          .json({ error: "Your account is permanently suspended" });
      }
      if (new Date(suspendRes.suspend_until) > new Date()) {
        return res.status(403).json({
          error: `Account suspended until ${suspendRes.suspend_until}`,
        });
      }
      await pgClient.query(`delete from suspended_user where user_id=$1 `, [
        user.id,
      ]);
      await pgClient.query(`update users set status ='active' where id =$1`, [
        user.id,
      ]);
    }

    // if(! user.country || ! user.city || ! user.birthDate || ! user.country_code || !user.username){
    //   return res.status(403).json({error :`redirect to complete-profile`})
    // }

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
    csrfToken !== req.authSession?.csrf_token ||
    req.authSession.status !== "valid"
  ) {
    return res.status(403).json({ error: "CSRF token mismatch" });
  }

  return next();
};

module.exports = { authenticate, csrfCheck };
