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
const { pgClient } = require("../config/db.config.pg");

function generateVerificationToken() {
  const token = crypto.randomBytes(20).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  return { token, hashedToken, expires };
}

function getResetPasswordToken() {
  const resetToken = crypto.randomBytes(20).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  return { resetToken, hashedToken, expires };
}

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
    const checkQuery = `select * from users where email=$1 or username =$2`;
    const checkValue = [normalizedEmail, normalizedUsername];

    const checkRes = await pgClient.query(checkQuery, checkValue);
    if (checkRes.rows.some((u) => u.email === normalizedEmail))
      return res.status(400).json({ error: "Email already in use" });
    if (checkRes.rows.some((u) => username === normalizedUsername))
      return res.status(400).json({ error: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const { token, hashedToken, expires } = generateVerificationToken();

    const insertQuery = `
    insert into users(
      first_name,
      last_name,
      username,
      email,
      password,
      phone,
      birth_date,
      grade,
      school,
      interests,
      agree_to_terms,
      subscribe_newsletter,
      validate_before_login,
      verification_token,
      verification_expires,
      last_email_sent
    ) 
    values ($1 ,$2 ,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    returning *`;

    const insertValues = [
      firstName,
      lastName,
      normalizedUsername,
      normalizedEmail,
      hashedPassword,
      phone,
      birthDate,
      grade,
      school,
      JSON.stringify(interests || []),
      true,
      subscribeNewsletter || false,
      false,
      hashedToken,
      expires,
      new Date(),
    ];

    const result = await pgClient.query(insertQuery, insertValues);
    const newUser = result.rows[0];

    const validationUrl = `${host}/verify?token=${token}`;
    await sendMail(
      newUser.email,
      "Verify your email",
      loadTemplate("verification.html", {
        firstName: newUser.first_name,
        email: newUser.email,
        validationUrl,
      }),
    );

    const session = await initializeSession(newUser.id, false);
    const expiresInMs = session.expires_at.getTime() - Date.now();

    res.cookie("sessionToken", session.session_token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrf_token, {
      httpOnly: false,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.status(201).json({
      message: "User registered successfully, please verify your email.",
      csrfToken: session.csrfToken,
      validationBeforeLogin: newUser.validate_before_login,
      email: newUser.email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const emailCheck = async (req, res) => {
  const { email } = req.body;

  const result = await pgClient.query("select * from users where email = $1 ", [
    email,
  ]);
  const exist = result.rows[0];

  if (exist) {
    return res.status(200).json({ error: "Email already in use" });
  } else {
    return res.status(200).json({ error: "" });
  }
};

const usernameCheck = async (req, res) => {
  const { username } = req.body;

  const result = await pgClient.query(
    "select * from users where username = $1  ",
    [username],
  );
  const exist = result.rows[0];

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
    const result = await pgClient("select * from users where email = $1 ", [
      email,
    ]);
    const emailDoc = result.rows[0];
    const providerRes = await pgClient(
      "select * from users where providers @> $1 limit 1 ",
      [JSON.stringify([{ providerId }])],
    );

    const providerDoc = providerRes.rows[0];

    if (!emailDoc && !providerDoc) {
      return res.status(400).json({
        message: "User not found for this provider or email",
      });
    }

    if (emailDoc) {
      const hasProvider = emailDoc.providers.some(
        (p) => p.providerId === providerId && p.provider === provider,
      );

      if (!hasProvider && providerDoc) {
        const providerData = providerDoc.providers.find(
          (p) => p.providerId === providerId,
        );

        if (providerData) {
          emailDoc.providers.push(providerData);
        }
      }

      await pgClient.query("update users set providers =$1 where id=$2", [
        JSON.stringify(emailDoc.providers),
        emailDoc.id,
      ]);

      await pgClient.query(
        "update users set is_verified = false WHERE id = $1",
        [emailDoc.id],
      );

      if (providerDoc && providerDoc.id !== emailDoc.id) {
        await pgClient.query("delete from users where id :$1", [
          providerDoc.id,
        ]);
      }

      return res.status(200).json({
        message: "Email added and account merged successfully",
      });
    }

    await pgClient.query(
      "update users set email = $1, is_verified = false where id = $2",
      [email, providerDoc.id],
    );

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
    const column = isEmail ? "email" : "username";

    const identifierLower = identifier.toLowerCase();

    const result = await pgClient.query(
      `SELECT * FROM users WHERE ${column} = $1 LIMIT 1`,
      [identifierLower],
    );

    const user = result.rows[0];

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

    const session = await initializeSession(user.id, rememberMe);
    const expiresInMs = session.expires_at.getTime() - Date.now();

    res.cookie("sessionToken", session.session_token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.cookie("csrfToken", session.csrf_token, {
      httpOnly: false,
      secure: true,
      sameSite: "none",
      maxAge: expiresInMs,
    });

    res.status(200).json({
      message: "Login successful",
      csrfToken: session.csrf_token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const verifyEmail = async (req, res) => {
  let { token } = req.query;
  const rtoken = decodeURIComponent(token).trim();

  const hashedToken = crypto.createHash("sha256").update(rtoken).digest("hex");

  try {
    const result = await pgClient.query(
      "select * from users where verification_token =$1 and verification_expires >= NOW() ",
      [hashedToken],
    );
    const user = result.rows[0];

    if (!user) {
      console.log(hashedToken);

      return res.status(400).json({ error: "Invalid or expired token" });
    }

    if (user.is_verified) {
      return res.status(200).json({ message: "Email already verified" });
    }

    await pgClient.query(
      `
      update users set 
      is_verified = true ,
      validate_before_login =true , 
      verification_token =NULL ,
      verification_expires =NULL 
      where id =$1 
      `,
      [user.id],
    );

    await pgClient.query(
      `UPDATE sessions SET status='expired' WHERE user_id=$1`,
      [user.id],
    );

    const session = await initializeSession(user.id, true);
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

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Email verification error:", error);
  }
};

const resendEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pgClient.query(
      "select * from users where email = $1 ",
      [email],
    );
    const user = result.rows[0];

    if (!user || user.is_verified) {
      return res.status(200).json({
        message: "User already verified!",
      });
    }
    if (user.last_email_sent && Date.now() - user.last_email_sent < 60 * 1000) {
      return res
        .status(429)
        .json({ error: "Please wait before requesting again" });
    }

    const { token, hashedToken, expires } = generateVerificationToken();

    const ress = await pgClient.query(
      `
      update users set verification_token =$1 , verification_expires =$2 ,last_email_sent =$3
      where id = $4
      `,
      [hashedToken, expires, new Date(), user.id],
    );

    const validationUrl = `${host}/verify?token=${token}`;
    await sendMail(
      user.email,
      "Verify your email",
      loadTemplate("verification.html", {
        firstName: user.first_name,
        email: user.email,
        validationUrl,
      }),
      validationUrl,
    );

    const session = await initializeSession(user.id, true);
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
    const result = await pgClient.query(
      "select * from users where email = $1 ",
      [email],
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(200).json({ error: "User not found" });
    }

    const { resetToken, hashedToken, expires } = getResetPasswordToken();

    await pgClient.query(
      `
      update users set reset_password_expires =$1 , reset_password_token =$2 , validateBeforeSave =false where id =$3`,
      [expires, hashedToken, user.id],
    );

    const resetUrl = `${host}/reset-password/${resetToken}`;

    try {
      await sendMail(
        user.email,
        "Password Reset Request",
        loadTemplate("reset-password.html", {
          firstName: user.first_name,
          resetUrl,
          email: user.email,
        }),
      );

      res.status(200).json({ message: "Email sent" });
    } catch (err) {
      await pgClient.query(
        `
      update users set reset_password_token =NULL, reset_password_expires =NULL , validateBeforeSave =false where id =$1`,
        [user.id],
      );

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
    const now = new Date();

    const userQ = await pgClient.query(
      `
      select * from users where reset_password_token =$1 ,reset_password_expires >$2 `,
      [hashedToken, now],
    );

    const user = userQ.rows[0];

    if (!user) {
      return res.status(200).json({ error: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pgClient.query(
      `
      update users set password =$1 ,reset_password_token =NULL,reset_password_expires=NULL where id =$2`,
      [hashedPassword, user.id],
    );

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const userq = await pgClient.query(
      `SELECT id, first_name, last_name, email, username, phone, birth_date, grade, school, interests, is_verified 
      FROM users
      WHERE id = $1`,
      [req.user.id],
    );
    const user = userq.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const fetchUsers = async (req, res) => {
  try {
    const userq = await pgClient.query(`
      select * from users`);
    const users = userq.rows;
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
    const userq = await pgClient.query(
      `
      select * from users where id =$1`,
      [userId],
    );
    const user = userq.rows[0];
    if (!user) {
      return res.status(200).json({ error: "User not found" });
    }

    await pgClient.query(
      `
      update users set role =$1`,
      [newRole],
    );

    res.status(200).json({ message: "User role updated successfully" });
  } catch (error) {
    console.error("Change role error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateUserProfile = async (req, res) => {
  const { id } = req.user;
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update." });
    }

    const setQuery = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");

    const result = await pgClient.query(
      `UPDATE users 
       SET ${setQuery} 
       WHERE id = $${fields.length + 1} 
       RETURNING id, first_name, last_name, email, username, phone, birth_date, grade, school, interests, is_verified`,
      [...values, id],
    );

    const updatedUser = result.rows[0];

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({
      message: "Profile updated successfully.",
      user: updatedUser,
    });
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

    const userRes = await pgClient.query(
      `
      select * from users where id =$1`,
      [id],
    );

    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User was not found" });
    }

    const certificatesForUserRes = await pgClient.query(
      `
      select * from certificates where user_id =$1`,
      [id],
    );

    const certificatesForUser = certificatesForUserRes.rows;

    if (!certificatesForUser) {
      return res
        .status(200)
        .json({ message: "You don't own any certificates." });
    }

    return res.status(200).json({
      message: "Certificates fetched successfully",
      certificatesForUser,
    });
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
