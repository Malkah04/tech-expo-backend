const mongoose = require("mongoose");
require("dotenv").config();

async function connectDB() {
  const localhost = "mongodb://localhost:27017/";
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: false,
    });
    console.log("✅ MongoDB connected");
    return true;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw err;
  }
}

module.exports = connectDB;
