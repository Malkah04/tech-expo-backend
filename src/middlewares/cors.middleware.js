const cors = require("cors");
require("dotenv").config();

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === "production";
const prodOrigins = parseOrigins(process.env.CLIENT_ORIGIN);
const devOrigins = parseOrigins(process.env.LOCAL_ORIGIN);

const allowedOrigins = isProd
  ? prodOrigins.length
    ? prodOrigins
    : ["https://www.techexpo.site"]
  : devOrigins.length
    ? devOrigins
    : ["http://localhost:3000"];

module.exports = cors({
  origin(origin, callback) {
    // Allow non-browser clients (no Origin header) like health checks/curl.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`), false);
  },
  credentials: true,
});
