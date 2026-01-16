require('dotenv').config()

const host = process.env.NODE_ENV === "production"
  ? "https://www.techexpo.site"
  : "http://localhost:3000";


module.exports = host
