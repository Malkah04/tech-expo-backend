const app = require("./app");
const connectDB = require("./config/db.config");
const displayStartup = require("./utils/startup");

const { connectPG } = require("./config/db.config.pg");
const port = process.env.PORT || 3030;
async function startServer() {
  try {
    let dbStatus = {};

    // const mongoStatus = await connectDB();
    // dbStatus.mongo = mongoStatus;
    // console.log("✅ MongoDB connected");

    if (process.env.DB_PROVIDER === "supabase") {
      const pgStatus = await connectPG();
      dbStatus.postgres = pgStatus;
      console.log("✅ Supabase connected");
    }

    app.listen(port, async () => {
      console.log(`🚀 Server is running on http://localhost:${port}`);
      await displayStartup(app, dbStatus);
    });
  } catch (err) {
    console.error("❌ Failed to start the server:", err);
    process.exit(1);
  }
}

startServer();
