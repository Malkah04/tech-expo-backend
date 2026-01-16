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
router.patch(
  "/auth/change-role",
  authenticate,
  authorizeRoles("admin"),
  changeRole
);
router.get("/auth", authenticate, async (req, res) => {
  try {
    const u = await User.findById(req.user._id);

    const profile = {
      userId: u._id,
      fullName:
        u.fullName ||
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.username ||
        "",
      email: u.email || "",
      phone: u.phone || "",
      grade: u.grade || "",
      institution: u.school || "",
      registeredToTechnomaze: u.registeredToTechnomaze || false,
      role: u.role || "user",
      isVerified: u.isVerified || false,
      username: u.username || "",
      certificates: u.certificates || [],
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
    req.session.status = "expired";
    await req.session.save();
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
  const numbers = await User.find({
    registeredToTechnomaze: true,
    role: { $ne: "admin" },
  });
  res.json(numbers.map((e) => e.phone + " " + e.fullName));
});

router.patch("/auth/edit", authenticate, updateUserProfile);
router.get("/auth/userCertificates", authenticate, getUserCertificates);

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    const session = await initializeSession(req.user._id, false);
    const expiresInMs = session.expiresAt.getTime() - Date.now();

    res.cookie("sessionToken", session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });
    res.redirect(`${host}/dashboard`);
  }
);

router.get(
  "/auth/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  async (req, res) => {
    const session = await initializeSession(req.user._id, false);
    const expiresInMs = session.expiresAt.getTime() - Date.now();

    res.cookie("sessionToken", session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.redirect(`${host}/dashboard`);
  }
);

router.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  async (req, res) => {
    const session = await initializeSession(req.user._id, false);
    const expiresInMs = session.expiresAt.getTime() - Date.now();

    res.cookie("sessionToken", session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: expiresInMs,
    });
    res.redirect(`${host}/dashboard`);
  }
);

module.exports = router;
