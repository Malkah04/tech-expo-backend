const { pgClient } = require("../config/db.config.pg");

function clampInt(value, fallback, { min, max }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const listActivityLogsAdmin = async (req, res) => {
  try {
    const userId = req.query?.userId ? String(req.query.userId) : null;
    const action = req.query?.action ? String(req.query.action) : null;
    const q = req.query?.q ? String(req.query.q).trim() : null; // email contains

    const limit = clampInt(req.query?.limit, 50, { min: 1, max: 200 });
    const offset = clampInt(req.query?.offset, 0, { min: 0, max: 10000 });

    const result = await pgClient.query(
      `
      select
        al.id,
        al.user_id,
        u.email as user_email,
        al.action,
        al.metadata,
        al.created_at
      from activity_logs al
      left join users u
        on u.id::text = al.user_id
      where
        ($1::text is null or al.user_id = $1::text)
        and ($2::text is null or al.action = $2::text)
        and ($3::text is null or u.email ilike ('%' || $3::text || '%'))
      order by al.created_at desc
      limit $4 offset $5
      `,
      [userId, action, q, limit, offset],
    );

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      rows: result.rows || [],
      limit,
      offset,
    });
  } catch (err) {
    console.error("listActivityLogsAdmin error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const listMyActivityLogs = async (req, res) => {
  try {
    const limit = clampInt(req.query?.limit, 50, { min: 1, max: 200 });
    const offset = clampInt(req.query?.offset, 0, { min: 0, max: 10000 });

    const action = req.query?.action ? String(req.query.action) : null;

    const result = await pgClient.query(
      `
      select id, user_id, action, metadata, created_at
      from activity_logs
      where user_id = $1::text
        and ($2::text is null or action = $2::text)
      order by created_at desc
      limit $3 offset $4
      `,
      [String(req.user.id), action, limit, offset],
    );

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      rows: result.rows || [],
      limit,
      offset,
    });
  } catch (err) {
    console.error("listMyActivityLogs error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  listActivityLogsAdmin,
  listMyActivityLogs,
};

