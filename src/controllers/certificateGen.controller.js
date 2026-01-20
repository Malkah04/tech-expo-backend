const Certificate = require("../models/certificate.model");
const CertificateTemplate = require("../models/certificateTemplate.model");
const PDFDocument = require("pdfkit");
const generateAndUploadCertificate = require("../utils/generateCertificate.js");
const User = require("../models/user.model.js");
const { pgClient } = require("../config/db.config.pg");

// done
const createCertificateTemplate = async (req, res) => {
  const { templateName, background, fields, previewImage } = req.body;
  if (!templateName || !background || !fields) {
    return res.status(404).json({ error: "There are missing fields!" });
  }
  try {
    await pgClient.query(
      `
      insert into certificationTemplete (templete_name , background ,fields ,preview_url)
      values ($1 ,$2 ,$3 ,$4) 
      returning *`,
      [templateName, background, fields, previewImage],
    );
    await res
      .status(201)
      .json({ message: `Template ${templateName} was saved successfully!` });
  } catch (error) {
    console.error("Error creating certificate template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// done
const getCertificateTemplates = async (req, res) => {
  try {
    const templateRes = await pgClient.query(`
      select * from certificationTemplete`);

    const templates = templateRes.rows;
    res.status(200).json(templates);
  } catch (error) {
    console.error("Error fetching certificate templates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// done
const deleteCertificateTemplate = async (req, res) => {
  const { id } = req.params;
  try {
    const templateRes = await pgClient.query(
      `
      delete from certificationTemplete where id=$1 returning *`,
      [id],
    );
    const deletedTemplate = templateRes.rows[0];

    if (!deletedTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(201).json({ message: "Template deleted successfully!" });
  } catch (error) {
    console.error("Error deleting certificate template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// done
const createCertificate = async (req, res) => {
  const { type, templateId, email, role } = req.body;

  if (!type || !templateId) {
    return res
      .status(400)
      .json({ error: "Missing required fields: type and template" });
  }

  try {
    const templeteRes = await pgClient.query(
      `
      select * from certificationTemplete where id =$1`,
      [templateId],
    );
    const template = templeteRes.rows[0];
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (type === "single") {
      if (!email) {
        return res.status(400).json({
          error: "Email is required for single certificate generation",
        });
      }
      const userRes = await pgClient.query(
        `select * from users where email=$1`,
        [email],
      );
      const user = userRes.rows[0];

      if (!user) {
        return res
          .status(404)
          .json({ error: `User with email ${email} not found` });
      }

      const url = await generateAndUploadCertificate({ template, user });
      return res.status(201).json({
        message: `Certificate generated for ${email}`,
        certificateUrl: url,
      });
    }
    if (type === "role-based") {
      if (
        !role ||
        ![
          "user",
          "admin",
          "ambassador",
          "technomaze-user",
          "technomaze users",
        ].includes(role)
      ) {
        return res.status(400).json({
          error:
            "Invalid or missing role (allowed: user, admin, ambassador, technomaze-user, technomaze users)",
        });
      }

      let users = [];
      if (role === "technomaze users") {
        const userRes = await pgClient.query(
          `select * from users where registered_to_technomaze = true`,
        );
        users = userRes.rows;
      } else {
        const userRes = await pgClient.query(
          `select * from users where role = $1`,
          [role],
        );
        users = userRes.rows;
      }

      if (!users.length) {
        return res
          .status(404)
          .json({ error: `No users found with role ${role}` });
      }

      const generatedCertificates = [];

      for (const user of users) {
        try {
          const url = await generateAndUploadCertificate({ template, user });

          const certificateRes = await pgClient.query(
            `
            select * from certificates where certificate_url =$1`,
            [url],
          );

          const certificate = certificateRes.rows;

          generatedCertificates.push({
            email: user.email,
            certificateUrl: url,
          });
        } catch (err) {
          console.error(`Failed for user ${user.email}:`, err);
        }
      }

      return res.status(201).json({
        message: `Certificates generated for role: ${role}`,
        generatedCertificates,
      });
    }

    return res
      .status(400)
      .json({ error: "Invalid type. Must be 'single' or 'role-based'" });
  } catch (error) {
    console.error("Error creating certificates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// done
const getCertificates = async (req, res) => {
  try {
    const certificateRes = await pgClient.query(
      `select c.* ,u.username ,u.email ,u.role ,u.registered_to_technomaze
      from certificates c 
      join users u
      on c.user_id =u.id`,
    );
    const certificates = certificateRes.rows;
    res.status(200).json(certificates);
  } catch (error) {
    console.error("Error fetching certificates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//done
const deleteCertificate = async (req, res) => {
  const { id } = req.params;
  try {
    if (id === "all") {
      await pgClient.query(`TRUNCATE TABLE certificates`);
      return res
        .status(200)
        .json({ message: "All certificates deleted successfully" });
    }
    const deleteRes = await pgClient.query(
      `
      delete from certificates where id =$1 `,
      [id],
    );
    const deleteCertificate = this.deleteCertificate.rows[0];
    if (!deleteCertificate || deleteCertificate.length === 0) {
      return res.status(404).json({ error: "Certificate not found" });
    }
    res.status(201).json({ message: "Certificate deleted successfully!" });
  } catch (error) {
    console.error("Error deleting certificate:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

function sleep(ms) {
  return new Promise((resolve) => {
    console.log("Waiting 5 seconds before next email");
    setTimeout(resolve, ms);
  });
}

// done
const sendEmails = async (req, res) => {
  const certificates = req.body;

  if (!certificates || !Array.isArray(certificates)) {
    return res.status(400).json({
      error: "Missing or invalid certificates array in request body",
    });
  }

  const results = [];
  const sendMail = require("../utils/email");
  const { loadTemplate } = require("../utils/template");

  for (const certData of certificates) {
    const { credential_id, email } = certData;

    if (!credential_id || !email) {
      results.push({
        email: email || "unknown",
        success: false,
        message: "Missing credentialId or email",
      });
      continue;
    }

    try {
      const certificateRes = await pgClient.query(
        `select * from certificates where credential_id=$1`,
        [credential_id],
      );
      const certificate = certificateRes.rows[0];
      if (!certificate) {
        results.push({
          email,
          success: false,
          message: "Certificate not found",
        });
        continue;
      }

      const userRes = await pgClient.query(
        "select * from users where email = $1",
        [email],
      );
      const user = userRes.rows[0];
      if (!user) {
        results.push({
          email,
          success: false,
          message: "User not found",
        });
        continue;
      }

      const variables = {
        firstName: user.firstName || "Participant",
        lastName: user.lastName || "",
        certificateUrl: certificate.certificate_url || "#",
        issueDate: certificate.issued_at
          ? new Date(certificate.issued_at).toLocaleDateString()
          : new Date().toLocaleDateString(),
        credienitalId: certificate.credential_id,
        email: user.email,
      };

      const personalizedHtml = loadTemplate(
        "technomazeCertificate.html",
        variables,
      );

      const subject = `🎓 Your TechnoMaze V2 Certificate is Ready!`;
      await sendMail(email, subject, personalizedHtml);

      results.push({
        email,
        success: true,
        message: "Certificate email sent successfully",
      });

      await sleep(5000);
    } catch (error) {
      console.error(`Error processing certificate for ${email}:`, error);
      results.push({
        email,
        success: false,
        message: "Error sending email: " + error.message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  res.status(200).json({
    message: `Email sending completed. ${successCount} successful, ${failureCount} failed.`,
    results,
    summary: {
      total: results.length,
      successful: successCount,
      failed: failureCount,
    },
  });
};

const validateCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const certificateRes = await pgClient.query(
      `
    select * from certificates where credential_id =$1 `,
      [id],
    );
    const certificate = certificateRes.rows[0];
    if (!certificate) {
      return res
        .status(404)
        .json({ valid: false, message: "No certificate found" });
    }

    const userRes = await pgClient.query("select * from users where id = $1", [
      certificate.user_id,
    ]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({
        valid: false,
        message: "No user found that owns this certificate.",
      });
    }

    const userFullName = `${user.first_name} ${user.last_name}`;
    return res.status(201).json({
      valid: true,
      certificateUrl: certificate.certificate_url,
      authorFullName: userFullName,
    });
  } catch (err) {
    console.error("Validate certificate error:", error);
    return res
      .status(500)
      .json({ valid: false, message: "Internal server error" });
  }
};

module.exports = {
  createCertificateTemplate,
  getCertificateTemplates,
  createCertificate,
  getCertificates,
  deleteCertificateTemplate,
  deleteCertificate,
  sendEmails,
  validateCertificate,
};
