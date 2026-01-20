const express = require("express");
const passport = require("../config/passport.config.js");
const {
  registerUser,
  loginUser,
  verifyEmail,
  emailCheck,
  usernameCheck,
  resendEmail,
  forgotPassword,
  resetPassword,
  getMe,
  fetchUsers,
  changeRole,
  updateUserProfile,
  getUserCertificates,
  addEmail,
} = require("../controllers/user.controller.js");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  authenticate,
  csrfCheck,
} = require("../middlewares/auth.middleware.js");
const { authorizeRoles } = require("../middlewares/role.middleware.js");
const User = require("../models/user.model.js");
const { initializeSession } = require("../utils/session.js");
const { pgClient } = require("../config/db.config.pg.js");
const host =
  process.env.NODE_ENV === "development"
    ? process.env.LOCAL_ORIGIN
    : process.env.CLIENT_ORIGIN;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many login attempts",
      message:
        "You’ve tried to log in too many times. Please wait 15 minutes and try again.",
      retryAfterMinutes: 15,
    });
  },
  skipSuccessfulRequests: true,
});

router.post("/auth/register", registerUser);
router.post("/auth/login", loginLimiter, loginUser);
router.post("/auth/emailAvailability", emailCheck);
router.post("/auth/usernameAvailability", usernameCheck);
router.post("/auth/resendEmail", resendEmail);
router.get("/auth/verify", verifyEmail);
router.post("/auth/forgot-password", forgotPassword);
router.put("/auth/reset-password/:token", resetPassword);
router.get("/auth/users", authenticate, fetchUsers);
router.get("/auth/me", authenticate, getMe);
router.post("/auth/add-email", authenticate, addEmail);
router.put(
  "/auth/change-role",
  authenticate,
  authorizeRoles("admin"),
  changeRole,
);
router.get("/auth", authenticate, async (req, res) => {
  try {
    const userRes = await pgClient.query(`select * from users where id =$1`, [
      req.user.id,
    ]);
    const u = userRes.rows[0];
    // const u = await User.findById(req.user._id);
    if (!u) {
      return res.status(404).json({ error: "User not found" });
    }

    const certRes = await pgClient.query(
      "select credential_id, certificate_url, title, issued_at from certificates where user_id = $1",
      [u.id],
    );

    const certificates = certRes.rows;

    const profile = {
      userId: u.id,
      fullName:
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        u.username ||
        "",
      email: u.email || "",
      phone: u.phone || "",
      grade: u.grade || "",
      institution: u.school || "",
      registeredToTechnomaze: u.registered_to_technomaze || false,
      role: u.role || "user",
      isVerified: u.is_verified || false,
      username: u.username || "",
      certificates: certificates || [],
      providers: u.providers || [],
    };

    res.set("Cache-Control", "no-store");
    return res.status(200).json(profile);
  } catch (error) {
    console.error(error);
    return res
      .status(401)
      .json({ error: "There was an error authenticating your session" });
  }
});
router.post("/auth/logout", authenticate, async (req, res) => {
  try {
    await pgClient.query(
      `
      update sessions set status ='expired' where id =$1`,
      [req.authSession.id],
    );
    // req.session.status = "expired";
    // await req.session.save();
    res.clearCookie("sessionToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });
    res.clearCookie("csrfToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });
    return res.status(200).json({ message: "Logged out" });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/numbers", async (req, res) => {
  const numberRes = await pgClient.query(
    `select * from users where registered_to_technomaze = 'true' and role != 'admin'`,
  );
  // const numbers = await User.find({
  //   registeredToTechnomaze: true,
  //   role: { $ne: "admin" },
  // });
  const numbers = numberRes.rows.map(
    (u) => `${u.phone} ${u.first_name} ${u.last_name}`,
  );
  res.json(numbers);
  // res.json(numbers.map((e) => e.phone + " " + e.fullName));
});

router.patch("/auth/edit", authenticate, updateUserProfile);
router.get("/auth/userCertificates", authenticate, getUserCertificates);

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    const session = await initializeSession(req.user.id, false);
    const expiresInMs = session.expires_at.getTime() - Date.now();

    res.cookie("sessionToken", session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrf_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });
    res.redirect(`${host}/dashboard`);
  },
);

router.get(
  "/auth/facebook",
  passport.authenticate("facebook", { scope: ["email"] }),
);

router.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  async (req, res) => {
    const session = await initializeSession(req.user.id, false);
    const expiresInMs = session.expires_at.getTime() - Date.now();

    res.cookie("sessionToken", session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrf_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    if (req.user.needsEmail) {
      return res.redirect(`${host}/add-email`);
    }

    return res.redirect(`${host}/dashboard`);
  },
);

router.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email"] }),
);

router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  async (req, res) => {
    const session = await initializeSession(req.user.id, false);
    const expiresInMs = session.expires_at.getTime() - Date.now();

    res.cookie("sessionToken", session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrf_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });
    res.redirect(`${host}/dashboard`);
  },
);

module.exports = router;
