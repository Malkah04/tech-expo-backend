const { Client } = require("pg");
require("dotenv").config();

const pgClient = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

async function connectPG() {
  await pgClient.connect();
  console.log("Connected to Supabase!");
}

module.exports = { pgClient, connectPG };
