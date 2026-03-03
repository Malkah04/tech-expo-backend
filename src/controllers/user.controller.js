const User = require("../models/user.model");
const bcrypt = require("bcrypt");
const {
  initializeSession,
  expireAllTokensForUser,
} = require("../utils/session");
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
const { json } = require("body-parser");
const multer = require("multer");

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
    interests: z.array(z.string()).optional(),
    agreeToTerms: z.literal(true),
    subscribeNewsletter: z.boolean().optional(),
    country: z.string(),
    city: z.string(),
    country_code: z.string(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    console.log("Err");

    return res.status(400).json({ error: parsed.error.flatten() });
  }
  console.log("paresed", parsed);

  const {
    firstName,
    lastName,
    username,
    email,
    password,
    phone,
    birthDate,
    interests,
    subscribeNewsletter,
    country_code,
    country,
    city,
  } = parsed.data;
  // recover by default true

  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username.toLowerCase();
  let notRecoverd = false;

  try {
    const checkQuery = `select * from users where email=$1 or username =$2`;
    const checkValue = [normalizedEmail, normalizedUsername];

    const checkRes = await pgClient.query(checkQuery, checkValue);
    const user = checkRes.rows;
    console.log("her", user);

    const activeEmail = user.find(
      (u) => u.email === normalizedEmail && u.is_deleted === false,
    );

    if (activeEmail)
      return res.status(400).json({ error: "Email already taken" });

    const deletedEmail = user.find(
      (u) => u.email === normalizedEmail && u.is_deleted === true,
    );

    if (deletedEmail && countTimeForRecovery(deletedEmail.deleted_at) > 0) {
      return res.status(200).json({
        message: `You delete your Account , but you can recover it within  ${countTimeForRecovery(deletedEmail.deleted_at)} days `,
        // pop mesage say want to recover? if yes go to login if no contain register
        popMessage: true,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("herre", hashedPassword);

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
      interests,
      agree_to_terms,
      subscribe_newsletter,
      validate_before_login,
      verification_token,
      verification_expires,
      last_email_sent,
      country,
      country_code,
      city,
      is_deleted,
      deleted_at
    ) 
    values ($1 ,$2 ,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 ,$17,false ,NULL)
    returning *`;

    const insertValues = [
      firstName,
      lastName,
      normalizedUsername,
      normalizedEmail,
      hashedPassword,
      phone,
      birthDate,
      JSON.stringify(interests || ["web"]),
      true,
      subscribeNewsletter || false,
      false,
      hashedToken,
      expires,
      new Date(),
      country,
      country_code,
      city,
    ];

    const result = await pgClient.query(insertQuery, insertValues);
    const newUser = result.rows[0];
    console.log("new user", newUser);

    const validationUrl = `${host}/verify?token=${token}`;
    try {
      const otpCode = generateOTP();
      console.log("Generated OTP:", otpCode);

      await pgClient.query(
        `insert into emails (email, verification_code, sent, sent_at) values($1, $2, $3, $4)`,
        [newUser.email, otpCode, true, new Date()],
      );

      console.log("send email");
      sendMail(
        newUser.email,
        "Verify your email",
        loadTemplate("verification.html", {
          firstName: newUser.first_name,
          email: newUser.email,
          otpCode,
        }),
      );
    } catch (err) {
      console.error("OTP generation or email insert failed:", err);
    }

    const session = await initializeSession(newUser.id, false, "full");
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
      csrfToken: session.csrf_token,
      validationBeforeLogin: newUser.validate_before_login,
      email: newUser.email,
      verificationToken: token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const emailCheck = async (req, res) => {
  // recover by defult true , but if user dont want to recover ? handled in else cond and go to register
  const { email, recover } = req.body;

  const result = await pgClient.query("select * from users where email = $1 ", [
    email,
  ]);
  const exist = result.rows[0];
  if (recover === true) {
    if (exist && exist.is_deleted === true) {
      if (countTimeForRecovery(exist.deleted_at) > 0) {
        return res.status(200).json({
          error: `Your Account is Deleted ,but you can recover it within ${countTimeForRecovery(exist.deleted_at)} days`,
          // pop mesage say want to recover? if yes go to login if no contain and make recover =false
          popMessage: true,
        });
      }
    }
    if (exist) {
      return res.status(200).json({ message: "Email already in use" });
    }
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
    const result = await pgClient.query(
      "select * from users where email = $1 ",
      [email],
    );
    const emailDoc = result.rows[0];
    const providerRes = await pgClient.query(
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
        await pgClient.query("delete from users where id = $1", [
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
  const { identifier, password, rememberMe } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    const isEmail = /\S+@\S+\.\S+/.test(identifier);
    const column = isEmail ? "email" : "username";
    const identifierLower = identifier.toLowerCase();

    const userRes = await pgClient.query(
      `select * from users where ${column} = $1 limit 1`,
      [identifierLower],
    );
    const user = userRes.rows[0];

    if (!user) {
      // Deliberately generic to avoid leaking which part is wrong.
      return res
        .status(401)
        .json({ error: "Invalid email, username or password" });
    }

    const hasSessionRes = await pgClient.query(
      `select * from sessions where user_id = $1 and status = 'valid' limit 1`,
      [user.id],
    );
    const existingSession = hasSessionRes.rows[0] || null;
    if (existingSession) {
      return res.status(200).json({
        message: "You are already logged in",
      });
    }

    if (!user.password || typeof user.password !== "string") {
      return res.status(401).json({
        error:
          "This account currently uses social login (e.g., Google or GitHub). Please sign in with your social provider or reset your password to create one.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ error: "Invalid email, username or password" });
    }

    // Check user-level suspension fields first
    if (user.status === "suspend") {
      const until = user.suspended_until || null;
      const reason = user.suspension_reason || null;

      const now = new Date();
      if (!until || new Date(until) > now) {
        try {
          const { logActivityAsync } = require("../utils/activityLog");
          logActivityAsync(user.id, "LOGIN_BLOCKED_SUSPENDED", {
            reason,
            suspendUntil: until,
            permanent: !until,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
        } catch {}

        return res.status(403).json({
          error: !until
            ? "Your account has been suspended."
            : `Your account has been suspended until ${until}.`,
          code: "ACCOUNT_SUSPENDED",
          suspendedUntil: until,
          reason,
        });
      }

      // Suspension expired: reactivate
      await pgClient.query(
        `update users
         set status = 'active',
             suspended_until = NULL,
             suspension_reason = NULL
         where id = $1`,
        [user.id],
      );
    }

    if (user.is_deleted === true) {
      const remainingDays = countTimeForRecovery(user.deleted_at);
      if (remainingDays <= 0) {
        return res.status(200).json({
          error:
            "The recovery period for this account has expired. It cannot be restored",
        });
      }

      const restoredRes = await pgClient.query(
        `update users set is_deleted = false, deleted_at = NULL ,status='active' where id = $1 returning *`,
        [user.id],
      );

      try {
        const { logActivityAsync } = require("../utils/activityLog");
        logActivityAsync(user.id, "ACCOUNT_RECOVERED", {
          daysRemaining: remainingDays,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch {}
    }

    // Legacy suspended_user table handling kept for backward compatibility
    const suspendRes = await pgClient.query(
      `select * from suspended_user where user_id = $1`,
      [user.id],
    );

    const suspend = suspendRes.rows[0];
    if (suspend) {
      const until = suspend.suspend_until || null;
      const reason = suspend.reason || null;

      if (!until) {
        try {
          const { logActivityAsync } = require("../utils/activityLog");
          logActivityAsync(user.id, "LOGIN_BLOCKED_SUSPENDED", {
            reason,
            permanent: true,
            legacyTable: true,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
        } catch {}
        return res.status(403).json({
          error:
            "Your account has been suspended. Please contact support for more information.",
          code: "ACCOUNT_SUSPENDED",
          suspendedUntil: null,
          reason,
        });
      }

      if (new Date(until) > new Date()) {
        try {
          const { logActivityAsync } = require("../utils/activityLog");
          logActivityAsync(user.id, "LOGIN_BLOCKED_SUSPENDED", {
            reason,
            suspendUntil: until,
            permanent: false,
            legacyTable: true,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
        } catch {}
        return res.status(403).json({
          error: `Your account has been suspended until ${until}. Please contact support for more information.`,
          code: "ACCOUNT_SUSPENDED",
          suspendedUntil: until,
          reason,
        });
      }

      await pgClient.query(`delete from suspended_user where user_id = $1`, [
        user.id,
      ]);

      await pgClient.query(`update users SET status = 'active' where id = $1`, [
        user.id,
      ]);
    }

    const session = await initializeSession(user.id, rememberMe, "full");
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

    if (user.role === "admin") {
      try {
        const { logActivityAsync } = require("../utils/activityLog");
        logActivityAsync(user.id, "ADMIN_LOGIN", {
          method: "password",
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch {}
    }

    return res.status(200).json({
      message:
        user.is_deleted === true
          ? "Account restored and login successful"
          : "Login successful",
      csrfToken: session.csrf_token,
    });
  } catch (err) {
    console.error("Login error:", err.message, err.stack);
    return res.status(500).json({
      error:
        err.message && err.message.includes("Illegal arguments")
          ? "Invalid credentials. If you signed up with Google, please use Google to log in."
          : "Internal server error",
    });
  }
};

const verifyEmail = async (req, res) => {
  let { token } = req.query;
  let { otp } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Invalid or expired token" });
  }
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

    const otpRes = await pgClient.query(
      `select * from emails where verification_code =$1 and email =$2`,
      [otp, user.email],
    );
    if (otpRes.rowCount === 0) {
      return res.status(200).json({ error: "Invalid OTP" });
    }
    if (otpRes.rows[0].verified) {
      return res.status(200).json({ message: "Email already verified" });
    }

    await pgClient.query(
      `update emails set verified= true where email=$1 and verification_code=$2 `,
      [user.email, otp],
    );
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

    const session = await initializeSession(user.id, true, "full");
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
    return res.status(500).json({ error: "Internal server error" });
  }
};

const resendEmail = async (req, res) => {
  const { email, otp } = req.body;

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
    if (
      user.last_email_sent &&
      Date.now() - user.last_email_sent.getTime() < 60 * 1000
    ) {
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
    const otpCode = generateOTP();
    const HasOtp = await pgClient.query(`select * from emails where email=$1`, [
      email,
    ]);
    const hasotp = HasOtp.rows[0];
    if (hasotp) {
      await pgClient.query(
        `update emails set verification_code =$1 where email =$2 `,
        [otpCode, email],
      );
    }
    await pgClient.query(
      `insert into emails (email , verification_code ,send ,send_at) values($1,$2,$3,$4)`,
      [newUser.email, otpCode, true, new Date()],
    );
    sendMail(
      newUser.email,
      "Verify your email",
      loadTemplate("verification.html", {
        firstName: newUser.first_name,
        email: newUser.email,
        otpCode,
      }),
    );

    const session = await initializeSession(user.id, true, "full");
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
      update users set reset_password_expires =$1 , reset_password_token =$2 , validate_before_login =false where id =$3`,
      [expires, hashedToken, user.id],
    );

    const resetUrl = `${host}/reset-password/${resetToken}`;

    try {
      sendMail(
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
      update users set reset_password_token =NULL, reset_password_expires =NULL , validate_before_login =false where id =$1`,
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
      select * from users where reset_password_token =$1 and reset_password_expires >$2 `,
      [hashedToken, now],
    );

    const user = userQ.rows[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pgClient.query(
      `
      update users set password =$1 ,reset_password_token =NULL,reset_password_expires=NULL where id =$2`,
      [hashedPassword, user.id],
    );

    try {
      const { logActivityAsync } = require("../utils/activityLog");
      logActivityAsync(user.id, "PASSWORD_RESET", {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch {}

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const userq = await pgClient.query(
      `SELECT id, first_name, last_name, email, username, phone, birth_date, country ,country_code ,city, interests, is_verified 
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
    return res.status(400).json({ error: "Missing userId or newRole" });
  }

  try {
    const userq = await pgClient.query(
      `
      select * from users where id =$1`,
      [userId],
    );
    const user = userq.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await pgClient.query(
      `
      update users set role =$1 where id=$2`,
      [newRole, userId],
    );

    try {
      const { logActivityAsync } = require("../utils/activityLog");
      logActivityAsync(userId, "ADMIN_CHANGE_ROLE", {
        fromRole: user.role,
        toRole: newRole,
        adminId: req.user?.id || null,
        adminEmail: req.user?.email || null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch {}

    res.status(200).json({ message: "User role updated successfully" });
  } catch (error) {
    console.error("Change role error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateUserProfile = async (req, res) => {
  const { id } = req.user;
  try {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const interestsJson = JSON.stringify(req.body.interests || []);

    const query = `
      UPDATE users
      SET first_name = $1,
      last_name = $2,
      phone = $3,
      country = $4,
      city = $5,
      country_code = $6,
      grade = $7,
      school = $8,
      interests = $9::json
      WHERE id = $10
      RETURNING *;
`;

    const values = [
      req.body.firstName,
      req.body.lastName,
      req.body.phone,
      req.body.country,
      req.body.city,
      req.body.countryCode,
      req.body.grade,
      req.body.school,
      JSON.stringify(req.body.interests),
      req.user.id,
    ];

    const result = await pgClient.query(query, values);

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

// create table suspended_user (user_id , suspend_until ,reason)

const suspendUser = async (req, res) => {
  try {
    let { email, amount, unit, reason } = req.body;
    email = email.toLowerCase();
    const userRes = await pgClient.query(
      `SELECT * FROM users WHERE email = $1 AND is_deleted = false`,
      [email],
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: "No user found" });
    }

    // Prevent admins from suspending their own account
    if (req.user && user.id === req.user.id) {
      try {
        const { logActivityAsync } = require("../utils/activityLog");
        logActivityAsync(user.id, "ADMIN_SUSPEND_SELF_DENIED", {
          adminId: req.user.id,
          adminEmail: req.user.email,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch {}
      return res
        .status(400)
        .json({ error: "You cannot suspend your own admin account" });
    }

    const checkifUserSuspended = await pgClient.query(
      `select * from suspended_user where user_id =$1 `,
      [user.id],
    );
    const check = checkifUserSuspended.rows[0];
    if (check) {
      return res.status(200).json({ error: "user already suspended" });
    }
    if (unit === "forever") {
      await pgClient.query(
        `insert into suspended_user (user_id , suspend_until ,reason) values($1 ,NULL ,$2)`,
        [user.id, reason],
      );
      await pgClient.query(
        `UPDATE users
         SET status = 'suspend',
             suspended_until = NULL,
             suspension_reason = $2
         WHERE id = $1`,
        [user.id, reason || null],
      );

      await expireAllTokensForUser(user.id);

      try {
        const { logActivityAsync } = require("../utils/activityLog");
        logActivityAsync(user.id, "ADMIN_UPDATE_USER_STATUS", {
          status: "suspend",
          suspendUntil: null,
          unit: "forever",
          reason: reason || null,
          adminId: req.user?.id || null,
          adminEmail: req.user?.email || null,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch {}

      return res.status(200).json({ message: "User suspended forever" });
    }
    await pgClient.query(
      `insert into suspended_user (user_id ,suspend_until ,reason) values ($1 , now() + ($2 || ' ' || $3)::interval ,$4 ) `,
      [user.id, amount, unit, reason],
    );
    await pgClient.query(
      `UPDATE users
       SET status = 'suspend',
           suspended_until = now() + ($2 || ' ' || $3)::interval,
           suspension_reason = $4
       WHERE id = $1`,
      [user.id, amount, unit, reason || null],
    );

    await expireAllTokensForUser(user.id);

    try {
      const { logActivityAsync } = require("../utils/activityLog");
      logActivityAsync(user.id, "ADMIN_UPDATE_USER_STATUS", {
        status: "suspend",
        amount: amount ?? null,
        unit: unit ?? null,
        reason: reason || null,
        adminId: req.user?.id || null,
        adminEmail: req.user?.email || null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch {}

    return res.status(200).json({ message: "User suspended successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const unSuspendUser = async (req, res) => {
  try {
    let { email } = req.body;
    email = email.toLowerCase();
    const findUserRes = await pgClient.query(
      `select * from users where email =$1`,
      [email],
    );
    const findUser = findUserRes.rows[0];
    if (!findUser) {
      return res.status(404).json({ error: "No user found" });
    }
    const suspendUserRes = await pgClient.query(
      `select * from suspended_user where user_id=$1`,
      [findUser.id],
    );
    const suspendUser = suspendUserRes.rows[0];
    if (!suspendUser) {
      return res.status(404).json({ error: "User not suspended" });
    }
    await pgClient.query(`delete from suspended_user where user_id=$1 `, [
      findUser.id,
    ]);
    await pgClient.query(`UPDATE users SET status = 'active' WHERE id = $1`, [
      findUser.id,
    ]);

    try {
      const { logActivityAsync } = require("../utils/activityLog");
      logActivityAsync(findUser.id, "ADMIN_UPDATE_USER_STATUS", {
        status: "active",
        adminId: req.user?.id || null,
        adminEmail: req.user?.email || null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch {}

    return res.status(200).json({ message: "User unsuspended successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const deleteAcc = async (req, res) => {
  try {
    const userRes = await pgClient.query(
      `update users
       set is_deleted = $1,
           deleted_at = NOW(),
           status = 'suspend',
           providers = '[]'::jsonb
       where id = $2
       returning *`,
      [true, req.user.id],
    );

    const deletedUser = userRes.rows[0];
    if (!deletedUser) {
      return res.status(404).json({ message: "user not exist" });
    }

    await expireAllTokensForUser(deletedUser.id);

    try {
      const { logActivityAsync } = require("../utils/activityLog");
      logActivityAsync(deletedUser.id, "ACCOUNT_SOFT_DELETE", {
        reason: "user_self_delete",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch {}

    return res.status(200).json({ message: "user deleted successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

// event_log (user_id , old_value , new_value , field)

const changeEmail = async (req, res) => {
  const { oldEmail, newEmail } = req.body;
  try {
    if (!oldEmail || !newEmail) {
      return res
        .status(400)
        .json({ error: "oldEmail and newEmail are required" });
    }
    const userQuery = await pgClient.query(
      `select * from users where email =$1 and id =$2`,
      [oldEmail, req.user.id],
    );
    const user = userQuery.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not Found" });
    }

    const existingEmailRes = await pgClient.query(
      `select id from users where email = $1 and id != $2 limit 1`,
      [newEmail.trim().toLowerCase(), req.user.id],
    );
    if (existingEmailRes.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "New email is already in use by another account" });
    }

    const existEventLog = await pgClient.query(
      `select * from event_log where user_id = $1 and field =$2`,
      [req.user.id, "email"],
    );

    const exist = existEventLog.rows[0];

    if (exist) {
      await pgClient.query(
        `delete from event_log where user_id = $1 and field =$2 `,
        [req.user.id, "email"],
      );
    }

    await pgClient.query(`update users set email =$1 where id=$2`, [
      newEmail.trim().toLowerCase(),
      user.id,
    ]);

    await pgClient.query(
      `insert into event_log (user_id , old_value ,new_value ,field) values ($1,$2,$3,$4)`,
      [user.id, oldEmail, newEmail, "email"],
    );
    return res.status(200).json({ message: "Email updated successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

function countTimeForRecovery(deletedAt) {
  if (!deletedAt) return 0;

  const RECOVERY_DAYS = 14;
  const RECOVERY_MS = RECOVERY_DAYS * 24 * 60 * 60 * 1000;

  const deletedTime = new Date(deletedAt).getTime();
  const now = Date.now();

  const remainingMs = RECOVERY_MS - (now - deletedTime);

  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

const completeData = async (req, res) => {
  const { id } = req.user;
  const { phone, city, country, country_code, interests, birthdate, username } =
    req.body;

  try {
    if (
      !phone ||
      !city ||
      !country ||
      !country_code ||
      !birthdate ||
      !username ||
      !interests
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const interestsArray = Array.isArray(interests)
      ? interests
      : interests
        ? [interests]
        : [];
    if (interestsArray.length === 0) {
      return res
        .status(400)
        .json({ error: "Please select at least one interest" });
    }

    const userRes = await pgClient.query(
      `update users set phone =$1 ,city=$2 ,country=$3 ,country_code=$4 ,interests=$5 ,birth_date =$6 ,username=$7 where id=$8 returning *`,
      [
        String(phone).trim(),
        String(city).trim(),
        String(country).trim(),
        String(country_code).trim(),
        JSON.stringify(interestsArray),
        String(birthdate).trim(),
        String(username).trim(),
        id,
      ],
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    await pgClient.query(
      `update sessions set session_type = $1 where user_id =$2`,
      ["full", user.id],
    );
    res.status(200).json({
      message: "User data completed successfully.",
      user: user,
    });
  } catch (err) {
    console.error("completeData error:", err.message, err.stack);
    if (
      err.message &&
      err.message.includes("value too long for type character varying")
    ) {
      return res.status(400).json({
        error:
          "Phone number or another field is too long. Please use a shorter phone number (digits only, with country code, e.g. +201234567890).",
      });
    }
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
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
  deleteAcc,
  suspendUser,
  unSuspendUser,
  changeEmail,
  countTimeForRecovery,
  completeData,
};
