const { pgClient } = require("../config/db.config.pg");

const AuthReport = async (req, res, next) => {
  try {
    const user = req.user;
    let email = req.body.email || req.query.email;

    if (!user && !email) {
      return res
        .status(401)
        .json({ error: "You must be logged in or provide your email" });
    }

    let userId;

    if (user) {
      const userRes = await pgClient.query(
        `SELECT * FROM users WHERE id = $1 AND is_deleted = false`,
        [user.id],
      );

      if (userRes.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Your account is deleted. Cannot make a report." });
      }

      userId = user.id;
    } else {
      const userRes = await pgClient.query(
        `SELECT * FROM users WHERE email = $1 AND is_deleted = false`,
        [email.toLowerCase()],
      );

      if (userRes.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "This user is deleted or does not exist." });
      }

      userId = userRes.rows[0].id;
    }

    const suspensionRes = await pgClient.query(
      `SELECT suspend_until FROM suspended_user WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    const suspension = suspensionRes.rows[0];

    if (suspension) {
      if (suspension.suspend_until === null) {
        req.reportUser = { id: userId, suspended: true, forever: true };
        return next();
      } else if (new Date(suspension.suspend_until) > new Date()) {
        req.reportUser = { id: userId, suspended: true, forever: false };
        return next();
      }
    }

    req.reportUser = { id: userId, suspended: false };
    next();
  } catch (err) {
    console.error("AuthReport:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { AuthReport };
