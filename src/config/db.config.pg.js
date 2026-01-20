const { Client } = require("pg");
require("dotenv").config();
// const Registration = require("../models/technomaze-form.model");
// const Template = require("../models/certificateTemplate.model");
// const Certificate = require("../models/certificate.model");
// const Users = require("../models/user.model");
// const EmailTemplate = require("../models/emails.model");

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

// async function migrateRegistrations() {
//   const registrations = await Registration.find();

//   for (const reg of registrations) {
//     const res = await pgClient.query(
//       `INSERT INTO registrations
//         (registration_type, team_copoun, full_name, email, phone, grade, institution,
//          payment_method, payment_phone, payment_screenshot_url, payment_screenshots_urls, submitted_at)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
//       [
//         reg.registrationType,
//         reg.teamCopoun || null,
//         reg.fullName || null,
//         reg.email || null,
//         reg.phone || null,
//         reg.grade || null,
//         reg.institution || null,
//         reg.paymentMethod || null,
//         reg.paymentPhone || null,
//         reg.paymentScreenshotUrl || null,
//         reg.paymentScreenshotsUrls || [],
//         reg.submittedAt || new Date(),
//       ],
//     );
//     console.log(reg.fullName);

//     const registrationId = res.rows[0].id;

//     if (reg.friends && reg.friends.length > 0) {
//       for (const friend of reg.friends) {
//         await pgClient.query(
//           `INSERT INTO friends
//             (registration_id, full_name, email, phone, grade, institution, payment_method, payment_phone)
//            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
//           [
//             registrationId,
//             friend.fullName,
//             friend.email,
//             friend.phone,
//             friend.grade,
//             friend.institution,
//             friend.paymentMethod,
//             friend.paymentPhone,
//           ],
//         );
//       }
//     }
//   }

//   console.log("Migration completed!");
// }

// const User = require("../models/user.model");

// async function migrateUsers() {
//   try {
//     const users = await User.find();

//     for (const user of users) {
//       const res = await pgClient.query(
//         `INSERT INTO users
//         (
//           first_name,
//           last_name,
//           username,
//           email,
//           phone,
//           password,
//           birth_date,
//           grade,
//           school,
//           interests,
//           agree_to_terms,
//           subscribe_newsletter,
//           reset_password_token,
//           reset_password_expires,
//           verification_token,
//           verification_expires,
//           forgot_password_token,
//           forgot_password_expires,
//           validate_before_login,
//           is_active,
//           is_verified,
//           role,
//           position,
//           certificates,
//           last_email_sent,
//           registered_to_technomaze,
//           providers,
//           created_at,
//           updated_at
//         )
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
//         RETURNING id`,
//         [
//           user.firstName || "Unknown",
//           user.lastName || "Unknown",
//           user.username || `user_${Date.now()}`,
//           user.email || null,
//           user.phone || null,
//           user.password || null,
//           user.birthDate || null,
//           user.grade || null,
//           user.school || null,
//           JSON.stringify(user.interests || []),
//           user.agreeToTerms ?? true,
//           user.subscribeNewsletter ?? false,
//           user.resetPasswordToken || null,
//           user.resetPasswordExpires || null,
//           user.verificationToken || null,
//           user.verificationExpires || null,
//           user.forgotPasswordToken || null,
//           user.forgotPasswordExpires || null,
//           user.validateBeforeLogin ?? false,
//           user.isActive ?? true,
//           user.isVerified ?? false,
//           user.role || "user",
//           user.position || "None",
//           JSON.stringify(user.certificates || []),
//           user.lastEmailSent || new Date(),
//           user.registeredToTechnomaze ?? false,
//           JSON.stringify(user.providers || []),
//           user.createdAt || new Date(),
//           user.updatedAt || new Date(),
//         ],
//       );

//       console.log(`Migrated user: ${user.username || user.email}`);
//     }

//     console.log("✅ All users migrated successfully!");
//   } catch (err) {
//     console.error("❌ Error migrating users:", err);
//   }
// }

// async function migrateTemplates() {
//   try {
//     const templates = await Template.find();

//     for (const t of templates) {
//       const res = await pgClient.query(
//         `INSERT INTO certificationTemplete
//           (templete_name, background, fields, preview_url, created_at, updated_at)
//          VALUES ($1, $2, $3, $4, $5, $6)
//          RETURNING id`,
//         [
//           t.templateName,
//           t.background,
//           JSON.stringify(t.fields || []),
//           t.previewUrl || null,
//           t.createdAt || new Date(),
//           t.updatedAt || new Date(),
//         ],
//       );

//       console.log(`Migrated template: ${t.templateName}`);
//     }

//     console.log("✅ All templates migrated successfully!");
//   } catch (err) {
//     console.error("❌ Error migrating templates:", err);
//   }
// }

// async function migrateCertificates() {
//   try {
//     const certificates = await Certificate.find();

//     for (const cert of certificates) {
//       const userI = await Users.findById(cert.userId);
//       if (!userI) {
//         console.warn(
//           `❌ User not found in MongoDB for certificate: ${cert.credentialId}`,
//         );
//         continue;
//       }

//       const email = userI.email;

//       const findIdByEmailInSQL = await pgClient.query(
//         `select * from users where email =$1`,
//         [email],
//       );

//       if (findIdByEmailInSQL.rows.length === 0) {
//         console.warn(`❌ User not found in PostgreSQL for email: ${email}`);
//         continue;
//       }
//       const pgUserId = findIdByEmailInSQL.rows[0].id;

//       const res = await pgClient.query(
//         `INSERT INTO certificates
//           (user_id, credential_id, certificate_url, issued_at, title, created_at, updated_at)
//          VALUES ($1, $2, $3, $4, $5, $6, $7)
//          RETURNING id`,
//         [
//           pgUserId,
//           cert.credentialId,
//           cert.certificateURL,
//           cert.issuedAt || new Date(),
//           cert.title || "None",
//           cert.createdAt || new Date(),
//           cert.updatedAt || new Date(),
//         ],
//       );

//       console.log(`Migrated certificate: ${cert.credentialId}`);
//     }
//     console.log("✅ All certificates migrated successfully!");
//   } catch (err) {
//     console.error("❌ Error migrating certificates:", err);
//   }
// }

// async function migrateEmailTemplates() {
//   try {
//     const templates = await EmailTemplate.find();

//     for (const t of templates) {
//       const res = await pgClient.query(
//         `INSERT INTO emailTempletes
//           (name, description, subject, html, preview_url, variables, identity, created_at, updated_at)
//          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
//          RETURNING id`,
//         [
//           t.name,
//           t.description,
//           t.subject,
//           t.html,
//           t.previewUrl || null,
//           JSON.stringify(t.variables || []),
//           t.identity,
//           t.createdAt || new Date(),
//           t.updatedAt || new Date(),
//         ],
//       );

//       console.log(`Migrated email template: ${t.name}`);
//     }

//     console.log("✅ All email templates migrated successfully!");
//   } catch (err) {
//     console.error("❌ Error migrating email templates:", err);
//   }
// }

module.exports = { pgClient, connectPG };
