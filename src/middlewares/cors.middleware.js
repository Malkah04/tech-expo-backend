const cors = require("cors");
require("dotenv").config();

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? "https://tech-expo-frontend-nrpg.vercel.app/"
    : "http://localhost:3000";

module.exports = cors({
  origin: allowedOrigins,
  credentials: true,
});
