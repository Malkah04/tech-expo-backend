const { pgClient } = require("../config/db.config.pg");

const host =
  process.env.NODE_ENV === "development"
    ? process.env.LOCAL_ORIGIN
    : process.env.CLIENT_ORIGIN;

const checkSuspension = async (req, res, next) => {
  try {
    const result = await pgClient.query(
      `
      SELECT user_id
      FROM suspended_user
      WHERE suspend_until IS NOT NULL
      AND suspend_until <= now()
      `,
    );

    const expiredSuspends = result.rows;

    if (expiredSuspends.length > 0) {
      const userIds = expiredSuspends.map((s) => s.user_id);

      await pgClient.query(
        `DELETE FROM suspended_user WHERE user_id = ANY($1)`,
        [userIds],
      );

      await pgClient.query(
        `UPDATE users SET status = 'active' WHERE id = ANY($1)`,
        [userIds],
      );
    }
    next();
  } catch (err) {
    console.error("checkSuspension:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const stopSuspendUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("stopSuspendUser: req.user =", req.user);

    const suspensionRes = await pgClient.query(
      `
      SELECT suspend_until
      FROM suspended_user
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [req.user.id],
    );

    const suspension = suspensionRes.rows[0];

    if (!suspension) return next();

    if (suspension.suspend_until === null) {
      return res.redirect(
        `${host}/suspended-account?permanent=true&reason=${encodeURIComponent(suspension.reason || "Account permanently suspended")}`,
      );
    }

    if (new Date(suspension.suspend_until) > new Date()) {
      const daysLeft = Math.ceil(
        (new Date(suspension.suspend_until) - new Date()) /
          (1000 * 60 * 60 * 24),
      );
      return res.redirect(
        `${host}/suspended-account?days=${daysLeft}&reason=${encodeURIComponent(suspension.reason || "Account temporarily suspended")}&until=${suspension.suspend_until}`,
      );
    }

    return next();
  } catch (err) {
    console.error("checkUserSuspension:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { checkSuspension, stopSuspendUser };
