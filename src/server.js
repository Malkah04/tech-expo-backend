const app = require("./app");
const connectDB = require("./config/db.config");
const displayStartup = require("./utils/startup");

const port = process.env.PORT || 3030;

async function startServer() {
  try {
    app.listen(port, async () => {
      console.log(`🚀 Server is running on http://localhost:${port}`);

      const dbStatus = await connectDB();
      await displayStartup(app, dbStatus);
    });
  } catch (err) {
    console.error("❌ Failed to start the server:", err);
    process.exit(1);
  }
}

startServer();
