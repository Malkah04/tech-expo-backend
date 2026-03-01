const { pgClient } = require("../config/db.config.pg");
const { URLSearchParams } = require("url");

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
      SELECT suspend_until, reason
      FROM suspended_user
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [req.user.id],
    );

    const suspension = suspensionRes.rows[0];

    if (!suspension) return next();

    const until = suspension.suspend_until || null;
    const reason = suspension.reason || null;
    const now = new Date();

    // Decide if this request should be handled as a browser redirect
    const originalUrl = req.originalUrl || "";
    const acceptHeader = req.headers.accept || "";
    const isSocialAuth =
      originalUrl.includes("/auth/google") ||
      originalUrl.includes("/auth/facebook") ||
      originalUrl.includes("/auth/github");
    const wantsHtml = acceptHeader.includes("text/html");

    const redirectToSuspendedPage = () => {
      const params = new URLSearchParams();

      // Standardized error code for suspended accounts
      params.set("error", "ACCOUNT_SUSPENDED");

      if (until) {
        const isoUntil = new Date(until).toISOString();
        params.set("suspendedUntil", isoUntil);
      }

      if (reason) {
        // URLSearchParams safely encodes spaces and special characters
        params.set("reason", reason);
      }

      if (!until) {
        params.set("permanent", "true");
      }

      const qs = params.toString();
      const target = qs
        ? `${host}/auth/suspended?${qs}`
        : `${host}/auth/suspended`;

      return res.redirect(target);
    };

    if (until === null) {
      // Permanent suspension
      if (isSocialAuth || wantsHtml) {
        return redirectToSuspendedPage();
      }
      return res.status(403).json({
        error: "Your account is permanently suspended",
        code: "ACCOUNT_SUSPENDED",
        suspendedUntil: null,
        reason,
      });
    }

    if (new Date(until) > now) {
      // Active temporary suspension
      const isoUntil = new Date(until).toISOString();
      if (isSocialAuth || wantsHtml) {
        return redirectToSuspendedPage();
      }
      return res.status(403).json({
        error: "Your account is suspended",
        code: "ACCOUNT_SUSPENDED",
        suspendedUntil: isoUntil,
        reason,
      });
    }

    next();
  } catch (err) {
    console.error("checkUserSuspension:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { checkSuspension, stopSuspendUser };
