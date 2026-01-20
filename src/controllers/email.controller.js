const EmailTemplate = require("../models/emails.model");
const { loadCustomTemplate } = require("../utils/customTemplate");
const User = require("../models/user.model");
const sendMail = require("../utils/email");
const { pgClient } = require("../config/db.config.pg");

function sleep(ms) {
  return new Promise((resolve) => {
    console.log("Waiting 5 seconds before next email");
    setTimeout(resolve, ms);
  });
}
// done
async function getAllTemplates(req, res) {
  try {
    const templateRes = await pgClient.query(`select * from emailTempletes`);
    const templates = templateRes.rows;
    res.status(200).json(templates);
  } catch (error) {
    console.error("Error fetching email templates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

//done

async function getTemplateById(req, res) {
  const { id } = req.params;
  try {
    const templateRes = await pgClient.query(
      `select * from emailTempletes where id = $1`,
      [id],
    );
    const template = templateRes.row[0];
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(200).json(template);
  } catch (error) {
    console.error("Error fetching email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// done
async function createTemplate(req, res) {
  const { name, html, subject, previewUrl, identity, description } = req.body;
  try {
    const emailTempRes = await pgClient.query(
      `
      insert into emailTempletes (name ,html ,subject ,preview_url ,identity ,description) values ($1 ,$2 ,$3 ,$4 ,$5 ,$6) returning *`,
      [name, html, subject, previewUrl, identity, description],
    );

    const newTemplate = emailTempRes.rows[0];

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Error creating email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
// done
async function updateTemplate(req, res) {
  const { id } = req.params;
  const { name, subject, html, previewUrl } = req.body;
  try {
    const updateTempleteRes = await pgClient.query(
      `
      update emailTempletes set (name ,html ,subject ,preview_url) values ($1 ,$2 ,$3 ,$4) where id =$4 returning *`,
      [name, html, subject, previewUrl, id],
    );
    const updatedTemplate = updateTempleteRes.rows[0];

    if (!updatedTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(200).json(updatedTemplate);
  } catch (error) {
    console.error("Error updating email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
// done
async function deleteTemplate(req, res) {
  const { id } = req.params;
  try {
    const deleteTempRes = await pgClient.query(
      `
  delete from emailTempletes where id =$1 returning *`,
      [id],
    );
    const deletedTemplate = deleteTempRes.rows[0];
    if (!deletedTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(200).json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error("Error deleting email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function sendEmail(req, res) {
  const { recipientType, specificEmails, roleBasedRecipients, template } =
    req.body;

  if (!recipientType || !template) {
    return res.status(401).json({ error: "Missing fields are required" });
  }

  const existTempleteRes = await pgClient.query(
    `
    select * from emailTempletes where identity =$1`,
    [template],
  );

  const existingTemplate = existTempleteRes.rows[0];

  if (!existingTemplate) {
    return res.status(401).json({ error: "This template does not exist" });
  }

  const templateId = existingTemplate.id;
  const subject = existingTemplate.subject;

  async function sendToList(emails, results) {
    for (const email of emails) {
      const userRes = await pgClient.query(
        `select * from users where email =$1`,
        [email],
      );
      const userExists = userRes.rows[0];
      const variables = userExists
        ? {
            firstName: userExists.first_name,
            username: userExists.username,
            email,
            phone: userExists.phone,
          }
        : {
            firstName: "Guest",
            username: "N/A",
            email,
            phone: "N/A",
          };

      try {
        const html = await loadCustomTemplate(templateId, variables);
        await sendMail(email, subject, html);

        results.push({
          email,
          success: true,
          message: userExists
            ? "Email sent successfully"
            : "Email sent (unregistered user)",
        });

        await sleep(5000);
      } catch (err) {
        console.error(err);
        results.push({
          email,
          success: false,
          message: "Error sending email",
        });
      }
    }
  }

  try {
    if (recipientType === "specific") {
      const results = [];
      if (!Array.isArray(specificEmails)) {
        return res
          .status(400)
          .json({ error: "specificEmails must be an array" });
      }

      await sendToList(specificEmails, results);

      return res.status(200).json({
        message: `${existingTemplate.name} email process completed`,
        results,
      });
    }

    if (recipientType === "role") {
      if (!roleBasedRecipients) {
        return res.status(401).json({ error: "No roles provided" });
      }

      const results = [];
      const sentEmails = new Set();

      const userRes = await pgClient.query(`select email , id from users`);
      const users = userRes.rows;
      const unverifiedUserRes = await pgClient.query(`
        select email ,id from users where is_verified =false and role !='admin' `);
      const unverifiedUsers = unverifiedUserRes.rows;

      const verifiedUserRes = await pgClient.query(`
        select email ,id from users where is_verified =true`);
      const verifiedUsers = verifiedUserRes.rows;

      const technomazeRegisteredUsersRes = await pgClient.query(`
        select email ,id from users where registered_to_technomaze =true`);
      const technomazeRegisteredUsers = technomazeRegisteredUsersRes.rows;

      const technomazeUnregisteredUsersRes = await pgClient.query(`
        select email ,id from users where registered_to_technomaze =false`);
      const technomazeUnregisteredUsers = technomazeUnregisteredUsersRes.rows;

      const adminRes = await pgClient.query(
        `select email , id from users where role ='admin'`,
      );
      const admins = adminRes.rows;

      const ambassadorsRes = await pgClient.query(
        `select email , id from users where role ='ambassador'`,
      );
      const ambassadors = ambassadorsRes.rows;

      const allUserEXAdminRes = await pgClient.query(
        `select email ,id from users where role != 'admin'`,
      );
      const allUsersExceptAdmins = allUserEXAdminRes.rows;

      const roles = Array.isArray(roleBasedRecipients)
        ? roleBasedRecipients
        : [roleBasedRecipients];

      for (const role of roles) {
        let emailList = [];

        switch (role) {
          case "all":
            emailList = users.map((e) => e.email);
            break;
          case "unverified":
            emailList = unverifiedUsers.map((e) => e.email);
            break;
          case "verified":
            emailList = verifiedUsers.map((e) => e.email);
            break;
          case "technomaz":
            emailList = technomazeRegisteredUsers.map((e) => e.email);
            break;
          case "nottechnomaze":
            emailList = technomazeUnregisteredUsers.map((e) => e.email);
            break;
          case "admins":
            emailList = admins.map((e) => e.email);
            break;
          case "ambassadors":
            emailList = ambassadors.map((e) => e.email);
            break;
          case "allExcpetAdmins":
            emailList = allUsersExceptAdmins.map((e) => e.email);
            break;
          default:
            console.warn(`⚠️ Unknown role: ${role}`);
            continue;
        }

        const uniqueEmails = emailList.filter(
          (email) => !sentEmails.has(email),
        );

        await sendToList(uniqueEmails, results);

        uniqueEmails.forEach((email) => sentEmails.add(email));
      }

      return res.status(200).json({
        message: `${existingTemplate.name} email process completed`,
        results,
      });
    }

    return res.status(400).json({ error: "Unsupported recipient type" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal error, failed to send emails." });
  }
}

module.exports = {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendEmail,
};
