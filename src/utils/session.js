const Session = require("../models/session.model.js");
const { pgClient } = require("../config/db.config.pg.js");
const crypto = require("crypto");

async function generateToken() {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(32, (err, buffer) => {
      if (err) {
        return reject(err);
      }
      resolve(buffer.toString("hex"));
    });
  });
}

const expireAllTokensForUser = async (userId) => {
  const query = `
    UPDATE sessions
    SET status = 'expired'
    WHERE user_id = $1;
  `;
  await pgClient.query(query, [userId]);
};

const initializeSession = async (userId, rememberMe) => {
  try {
    const sessionToken = await generateToken();
    const csrfToken = await generateToken();

    const durationMs = rememberMe
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    console.log("Session duration (ms):", durationMs);

    const expiresAt = new Date(Date.now() + durationMs);

    const insertQuery = `
        insert into sessions(
        user_id,
        session_token,
        csrf_token,
        expires_at
        ) values ($1 ,$2 ,$3 ,$4)
         returning *`;

    const insertValues = [userId, sessionToken, csrfToken, expiresAt];
    const result = await pgClient.query(insertQuery, insertValues);

    return result.rows[0];
  } catch (error) {
    console.error("Error initializing session:", error);
    throw error;
  }
};

module.exports = { initializeSession, expireAllTokensForUser };
