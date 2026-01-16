const User = require("../models/user.model");
const bcrypt = require("bcrypt");
const { initializeSession } = require("../utils/session");
const isProduction = process.env.NODE_ENV === "production";
const z = require("zod");
const sendMail = require("../utils/email");
const { loadTemplate } = require("../utils/template");
const crypto = require("crypto");
const host = require("../utils/host");
const Certificate = require("../models/certificate.model");
const mongoose = require("mongoose");
const Session = require("../models/session.model");

const registerUser = async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    username: z.string().min(3),
    email: z.email(),
    phone: z.string(),
    password: z.string().min(8),
    birthDate: z.string(),
    grade: z.string(),
    school: z.string(),
    interests: z.array(z.string()).optional(),
    agreeToTerms: z.literal(true),
    subscribeNewsletter: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    firstName,
    lastName,
    username,
    email,
    password,
    phone,
    birthDate,
    grade,
    school,
    interests,
    subscribeNewsletter,
  } = parsed.data;

  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username.toLowerCase();

  try {
    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      User.findOne({ username: normalizedUsername }),
    ]);

    if (existingEmail)
      return res.status(400).json({ error: "Email already in use" });
    if (existingUsername)
      return res.status(400).json({ error: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      birthDate,
      grade,
      school,
      interests,
      agreeToTerms: true,
      subscribeNewsletter,
      validateBeforeLogin: false,
      lastEmailSent: Date.now(),
    });

    const verificationToken = newUser.getVerificationToken();
    newUser.verificationToken = verificationToken;
    newUser.verificationExpires = Date.now() + 30 * 60 * 1000;

    await newUser.save();

    const validationUrl = `${host}/verify?token=${verificationToken}`;
    await sendMail(
      newUser.email,
      "Verify your email",
      loadTemplate("verification.html", {
        firstName: newUser.firstName,
        email: newUser.email,
        validationUrl,
      })
    );

    const session = await initializeSession(newUser._id, false);
    const expiresInMs = session.expiresAt.getTime() - Date.now();

    res.cookie("sessionToken", session.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.status(201).json({
      message: "User registered successfully, please verify your email.",
      csrfToken: session.csrfToken,
      validationBeforeLogin: newUser.validateBeforeLogin,
      email: newUser.email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const emailCheck = async (req, res) => {
  const { email } = req.body;

  const exist = await User.findOne({ email });
  if (exist) {
    return res.status(200).json({ error: "Email already in use" });
  } else {
    return res.status(200).json({ error: "" });
  }
};

const usernameCheck = async (req, res) => {
  const { username } = req.body;

  const exist = await User.findOne({ username });
  if (exist) {
    return res.status(200).json({ error: "Username already in use" });
  } else {
    return res.status(200).json({ error: "" });
  }
};

const addEmail = async (req, res) => {
  const { email, provider, providerId } = req.body;

  if (!email || !provider || !providerId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const emailDoc = await User.findOne({ email });
    const providerDoc = await User.findOne({
      "providers.providerId": providerId,
    });

    if (!emailDoc && !providerDoc) {
      return res.status(400).json({
        message: "User not found for this provider or email",
      });
    }

    if (emailDoc) {
      const hasProvider = emailDoc.providers.some(
        (p) => p.providerId === providerId && p.provider === provider
      );

      if (!hasProvider && providerDoc) {
        const providerData = providerDoc.providers.find(
          (p) => p.providerId === providerId
        );

        if (providerData) {
          emailDoc.providers.push(providerData);
        }
      }

      emailDoc.isVerified = false;
      await emailDoc.save();

      if (
        providerDoc &&
        providerDoc._id.toString() !== emailDoc._id.toString()
      ) {
        await User.findByIdAndDelete(providerDoc._id);
      }

      return res.status(200).json({
        message: "Email added and account merged successfully",
      });
    }

    providerDoc.email = email;
    providerDoc.isVerified = false;
    await providerDoc.save();

    return res.status(200).json({
      message: "Email added to provider account successfully",
    });
  } catch (err) {
    console.error("addEmail error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
  const host = req.get("host");
  console.log(host);

  const { identifier, password, rememberMe } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    const isEmail = /\S+@\S+\.\S+/.test(identifier);

    const user = await User.findOne({
      [isEmail ? "email" : "username"]: identifier.toLowerCase(),
    }).select("+password");

    if (!user || !user.password) {
      return res
        .status(200)
        .json({ error: "Invalid email, username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(200)
        .json({ error: "Invalid email, username or password" });
    }

    const session = await initializeSession(user._id, rememberMe);
    const expiresInMs = session.expiresAt.getTime() - Date.now();

    res.cookie("sessionToken", session.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.status(200).json({
      message: "Login successful",
      csrfToken: session.csrfToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const verifyEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const user = await User.findOne({
      verificationToken: token,
      verificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    user.validateBeforeLogin = true;
    await user.save();

    await Session.deleteMany({ userId: user._id });
    const session = await initializeSession(user._id, true);
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

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Email verification error:", error);
  }
};

const resendEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user || user.isVerified) {
      return res.status(200).json({
        message: "User already verified!",
      });
    }
    if (user.lastEmailSent && Date.now() - user.lastEmailSent < 60) {
      return res
        .status(429)
        .json({ error: "Please wait before requesting again" });
    }

    const verificationToken = user.getVerificationToken();
    user.verificationToken = verificationToken;
    user.verificationExpires = Date.now() + 30 * 60 * 1000;
    user.lastEmailSent = Date.now();

    const validationUrl = `${host}/verify?token=${verificationToken}`;
    await sendMail(
      user.email,
      "Verify your email",
      loadTemplate("verification.html", {
        firstName: user.firstName,
        email: user.email,
        validationUrl,
      }),
      validationUrl
    );

    await user.save();
    res.status(200).json({
      message: "Email Verification sent",
    });
  } catch (error) {
    console.error("Email resend error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({ error: "User not found" });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${host}/reset-password/${resetToken}`;

    try {
      await sendMail(
        user.email,
        "Password Reset Request",
        loadTemplate("reset-password.html", {
          firstName: user.firstName,
          resetUrl,
          email: user.email,
        })
      );

      res.status(200).json({ message: "Email sent" });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("Error sending email:", err);
      return res.status(500).json({ error: "Email could not be sent" });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(200).json({ error: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.status(200).json(user);
};

const fetchUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    console.error("Fetch Users Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const changeRole = async (req, res) => {
  const { userId, newRole } = req.body;

  if (!userId || !newRole) {
    return res.status(200).json({ error: "Missing userId or newRole" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({ error: "User not found" });
    }

    user.role = newRole;
    await user.save();

    res.status(200).json({ message: "User role updated successfully" });
  } catch (error) {
    console.error("Change role error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateUserProfile = async (req, res) => {
  const { id } = req.user;
  try {
    const user = await User.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.status(200).json({ message: "Profile updated successfully." });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      status: "error",
      code: "INTERNAL_SERVER_ERROR",
      message: "An internal server error occurred.",
    });
  }
};

const getUserCertificates = async (req, res) => {
  try {
    const { id } = req.user;

    const user = await User.findById(id).select("certificates");
    if (!user) {
      return res.status(404).json({ message: "User was not found" });
    }

    if (!user.certificates || user.certificates.length === 0) {
      return res
        .status(200)
        .json({ message: "You don't own any certificates." });
    }

    const certificates = await Certificate.find({
      _id: { $in: user.certificates },
    });

    return res
      .status(200)
      .json({ message: "Certificates fetched successfully", certificates });
  } catch (error) {
    console.error("Error fetching user certificates:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
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
};
