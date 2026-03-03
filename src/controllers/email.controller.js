const EmailTemplate = require("../models/emails.model");
const { loadCustomTemplate } = require("../utils/customTemplate");
const User = require("../models/user.model");
const sendMail = require("../utils/email");
const { pgClient } = require("../config/db.config.pg");

function sleep(ms) {
  return new Promise((resolve) => {
    console.log("Waiting before next email...");
    setTimeout(resolve, ms);
  });
}

async function getAllTemplates(req, res) {
  try {
    const result = await pgClient.query(`SELECT * FROM emailTempletes`);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function getTemplateById(req, res) {
  const { id } = req.params;
  try {
    const result = await pgClient.query(
      `SELECT * FROM emailTempletes WHERE id = $1`,
      [id],
    );
    const template = result.rows[0];
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.status(200).json(template);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function createTemplate(req, res) {
  const { name, html, subject, previewUrl, identity, description } = req.body;
  try {
    const result = await pgClient.query(
      `INSERT INTO emailTempletes (name, html, subject, preview_url, identity, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, html, subject, previewUrl, identity, description],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function updateTemplate(req, res) {
  const { id } = req.params;
  const { name, subject, html, previewUrl } = req.body;
  try {
    const result = await pgClient.query(
      `UPDATE emailTempletes
       SET name = $1, html = $2, subject = $3, preview_url = $4
       WHERE id = $5 RETURNING *`,
      [name, html, subject, previewUrl, id],
    );
    const updated = result.rows[0];
    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteTemplate(req, res) {
  const { id } = req.params;
  try {
    const result = await pgClient.query(
      `DELETE FROM emailTempletes WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "Template not found" });
    res.status(200).json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function getTemplateByIdentity(templateIdentity) {
  const res = await pgClient.query(
    `SELECT * FROM emailTempletes WHERE identity = $1`,
    [templateIdentity],
  );
  return res.rows[0];
}

async function getEmailList(
  recipientType,
  specificEmails,
  roleBasedRecipients,
) {
  if (recipientType === "specific") {
    if (!Array.isArray(specificEmails))
      throw new Error("specificEmails must be an array");
    return specificEmails;
  }

  if (recipientType === "role") {
    if (!roleBasedRecipients) throw new Error("No roles provided");

    const allUsersRes = await pgClient.query(
      `SELECT email, id, is_verified, role, registered_to_technomaze FROM users`,
    );
    const allUsers = allUsersRes.rows;
    const roles = Array.isArray(roleBasedRecipients)
      ? roleBasedRecipients
      : [roleBasedRecipients];
    let emailList = [];

    for (const role of roles) {
      let filtered = [];
      switch (role) {
        case "all":
          filtered = allUsers.map((u) => u.email);
          break;
        case "verified":
          filtered = allUsers.filter((u) => u.is_verified).map((u) => u.email);
          break;
        case "unverified":
          filtered = allUsers
            .filter((u) => !u.is_verified && u.role !== "admin")
            .map((u) => u.email);
          break;
        case "technomaz":
          filtered = allUsers
            .filter((u) => u.registered_to_technomaze)
            .map((u) => u.email);
          break;
        case "nottechnomaze":
          filtered = allUsers
            .filter((u) => !u.registered_to_technomaze)
            .map((u) => u.email);
          break;
        case "admins":
          filtered = allUsers
            .filter((u) => u.role === "admin")
            .map((u) => u.email);
          break;
        case "ambassadors":
          filtered = allUsers
            .filter((u) => u.role === "ambassador")
            .map((u) => u.email);
          break;
        case "allExceptAdmins":
          filtered = allUsers
            .filter((u) => u.role !== "admin")
            .map((u) => u.email);
          break;
        default:
          continue;
      }
      emailList.push(...filtered);
    }

    return [...new Set(emailList)];
  }

  throw new Error("Unsupported recipient type");
}

async function enqueueEmails(templateId, emails) {
  const insertQuery = `INSERT INTO email_jobs(template_id, recipient_email) VALUES ($1, $2)`;
  for (const email of emails) {
    await pgClient.query(insertQuery, [templateId, email]);
  }
}

async function sendEmailsDirectly(templateId, subject, emails) {
  const results = [];
  for (const email of emails) {
    try {
      const userRes = await pgClient.query(
        `SELECT * FROM users WHERE email = $1`,
        [email],
      );
      const user = userRes.rows[0];
      const variables = user
        ? {
            firstName: user.first_name,
            username: user.username,
            email,
            phone: user.phone,
          }
        : { firstName: "Guest", username: "N/A", email, phone: "N/A" };

      const html = await loadCustomTemplate(templateId, variables);
      await sendMail(email, subject, html);

      results.push({ email, success: true });
      await sleep(5000);
    } catch (err) {
      results.push({ email, success: false, error: err.message });
    }
  }
  return results;
}

async function sendEmailHandler(req, res) {
  try {
    const { recipientType, specificEmails, roleBasedRecipients, template } =
      req.body;

    if (!recipientType || !template)
      return res.status(401).json({ error: "Missing fields are required" });

    const emailTemplate = await getTemplateByIdentity(template);
    if (!emailTemplate)
      return res.status(401).json({ error: "This template does not exist" });

    const emailList = await getEmailList(
      recipientType,
      specificEmails,
      roleBasedRecipients,
    );

    if (emailList.length > 10) {
      await enqueueEmails(emailTemplate.id, emailList);
      return res.status(200).json({
        message: `Emails queued for background sending. Total: ${emailList.length}`,
      });
    }

    const results = await sendEmailsDirectly(
      emailTemplate.id,
      emailTemplate.subject,
      emailList,
    );
    return res.status(200).json({
      message: `${emailTemplate.name} email process completed`,
      results,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
module.exports = {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendEmailHandler,
};
