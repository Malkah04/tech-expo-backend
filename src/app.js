require("dotenv").config();
const express = require("express");
const setCors = require("./middlewares/cors.middleware");
const bodyParser = require("body-parser");
const registrationRoutes = require("./routes/technomaze-form.route.js");
const authRoutes = require("./routes/auth.route.js");
const cookies = require("cookie-parser");
const app = express();
const emailRoutes = require("./routes/email.route.js");
const certificateRoute = require("./routes/certificate.route.js");
const sendMail = require("./utils/email.js");
const User = require("./models/user.model.js");
const generateAndUploadCertificate = require("./utils/generateCertificate.js");
const expressSession = require("express-session");
const pgSession = require("connect-pg-simple")(expressSession);
const { Pool } = require("pg");
// Middleware setup
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(setCors);
app.use(cookies());

app.set("trust proxy", 1);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(
  expressSession({
    store: new pgSession({
      pool: pool,
      tableName: "sessions_store",
    }),
    secret: process.env.SESSION_SECRET || "keyboard cat",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

const passport = require("./config/passport.config");
app.use(passport.initialize());
app.use(passport.session());

// app.use(bodyParser.json());

// Auth routes
app.use("/api", authRoutes);
app.use("/api", registrationRoutes);
// // Email routes
app.use("/api", emailRoutes);
// Certifications Routes
app.use("/api", certificateRoute);

module.exports = app;
