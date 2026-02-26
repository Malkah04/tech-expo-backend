const { pgClient } = require("../config/db.config.pg");
const { v4: uuidv4 } = require("uuid");

function normalizeMetadata(metadata) {
  if (metadata == null) return {};
  if (typeof metadata === "object") return metadata;
  return { value: metadata };
}

async function logActivity(userId, action, metadata = {}) {
  if (!action) return;

  try {
    const id = uuidv4();
    const safeUserId = userId != null ? String(userId) : null;
    const meta = normalizeMetadata(metadata);

    await pgClient.query(
      `
      insert into activity_logs (id, user_id, action, metadata)
      values ($1, $2, $3, $4::jsonb)
      `,
      [id, safeUserId, String(action), JSON.stringify(meta)],
    );
  } catch (err) {
    // Never fail the main user request because logs couldn't be written.
    console.warn("[activity_logs] write failed", {
      action,
      userId,
      error: err?.message || String(err),
    });
  }
}

function logActivityAsync(userId, action, metadata = {}) {
  // Fire-and-forget without unhandled rejections.
  Promise.resolve().then(() => logActivity(userId, action, metadata));
}

module.exports = { logActivity, logActivityAsync };

