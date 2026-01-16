const EmailTemplate = require("../models/emails.model");
const { loadCustomTemplate } = require("../utils/customTemplate");
const User = require("../models/user.model");
const sendMail = require("../utils/email");

function sleep(ms) {
  return new Promise((resolve) => {
    console.log("Waiting 5 seconds before next email");
    setTimeout(resolve, ms);
  });
}

async function getAllTemplates(req, res) {
  try {
    const templates = await EmailTemplate.find();
    res.status(200).json(templates);
  } catch (error) {
    console.error("Error fetching email templates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function getTemplateById(req, res) {
  const { id } = req.params;
  try {
    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(200).json(template);
  } catch (error) {
    console.error("Error fetching email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function createTemplate(req, res) {
  const { name, html, subject, previewUrl, identity, description } = req.body;
  try {
    const newTemplate = new EmailTemplate({
      name,
      html,
      subject,
      previewUrl,
      identity,
      description,
    });
    await newTemplate.save();
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Error creating email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function updateTemplate(req, res) {
  const { id } = req.params;
  const { name, subject, html, previewUrl } = req.body;
  try {
    const updatedTemplate = await EmailTemplate.findByIdAndUpdate(
      id,
      { name, html, subject, previewUrl },
      { new: true }
    );
    if (!updatedTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(200).json(updatedTemplate);
  } catch (error) {
    console.error("Error updating email template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteTemplate(req, res) {
  const { id } = req.params;
  try {
    const deletedTemplate = await EmailTemplate.findByIdAndDelete(id);
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

  const existingTemplate = await EmailTemplate.findOne({ identity: template });
  if (!existingTemplate) {
    return res.status(401).json({ error: "This template does not exist" });
  }

  const templateId = existingTemplate._id;
  const subject = existingTemplate.subject;

  async function sendToList(emails, results) {
    for (const email of emails) {
      const userExists = await User.findOne({ email });
      const variables = userExists
        ? {
            firstName: userExists.firstName,
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

      const users = await User.find().select("email -_id");
      const unverifiedUsers = await User.find({
        isVerified: false,
        role: { $ne: "admin" },
      }).select("email -_id");
      const verifiedUsers = await User.find({
        isVerified: true,
      }).select("email -_id");
      const technomazeRegisteredUsers = await User.find({
        registeredToTechnomaze: true,
      }).select("email -_id");
      const technomazeUnregisteredUsers = await User.find({
        registeredToTechnomaze: false,
      }).select("email -_id");
      const admins = await User.find({ role: "admin" }).select("email -_id");
      const ambassadors = await User.find({
        role: "ambassador",
      }).select("email -_id");
      const allUsersExceptAdmins = await User.find({
        role: { $ne: "admin" },
      }).select("email -_id");

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
          (email) => !sentEmails.has(email)
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
