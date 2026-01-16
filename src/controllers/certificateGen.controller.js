const Certificate = require("../models/certificate.model");
const CertificateTemplate = require("../models/certificateTemplate.model");
const PDFDocument = require("pdfkit");
const generateAndUploadCertificate = require("../utils/generateCertificate.js");
const User = require("../models/user.model.js");

const createCertificateTemplate = async (req, res) => {
  const { templateName, background, fields, previewImage } = req.body;
  if (!templateName || !background || !fields) {
    return res.status(404).json({ error: "There are missing fields!" });
  }
  try {
    const newTemplate = new CertificateTemplate({
      templateName,
      background,
      fields,
      previewUrl: previewImage,
    });
    await newTemplate.save();
    await res
      .status(201)
      .json({ message: `Template ${templateName} was saved successfully!` });
  } catch (error) {
    console.error("Error creating certificate template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getCertificateTemplates = async (req, res) => {
  try {
    const templates = await CertificateTemplate.find();
    res.status(200).json(templates);
  } catch (error) {
    console.error("Error fetching certificate templates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteCertificateTemplate = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedTemplate = await CertificateTemplate.findByIdAndDelete(id);
    if (!deletedTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.status(201).json({ message: "Template deleted successfully!" });
  } catch (error) {
    console.error("Error deleting certificate template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createCertificate = async (req, res) => {
  const { type, templateId, email, role } = req.body;

  if (!type || !templateId) {
    return res
      .status(400)
      .json({ error: "Missing required fields: type and template" });
  }

  try {
    const template = await CertificateTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (type === "single") {
      if (!email) {
        return res.status(400).json({
          error: "Email is required for single certificate generation",
        });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(404)
          .json({ error: `User with email ${email} not found` });
      }

      const url = await generateAndUploadCertificate({ template, user });
      const certificate = await Certificate.findOne({ certificateURL: url });

      if (certificate) {
        user.certificates = user.certificates || [];
        if (!user.certificates.includes(certificate._id)) {
          user.certificates.push(certificate._id);
          await user.save();
        }
      }

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
        users = await User.find({ registeredToTechnomaze: true });
      } else {
        users = await User.find({ role });
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

          const certificate = await Certificate.findOne({
            certificateURL: url,
          });

          if (certificate) {
            user.certificates = user.certificates || [];
            if (!user.certificates.includes(certificate._id)) {
              user.certificates.push(certificate._id);
              await user.save();
            }
          }

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

const getCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find().populate(
      "userId",
      "username email role registeredToTechnomaze"
    );
    res.status(200).json(certificates);
  } catch (error) {
    console.error("Error fetching certificates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteCertificate = async (req, res) => {
  const { id } = req.params;
  try {
    if (id === "all") {
      await Certificate.deleteMany({});
      return res
        .status(200)
        .json({ message: "All certificates deleted successfully" });
    }
    const deleteCertificate = await Certificate.findByIdAndDelete(id);
    if (!deleteCertificate) {
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

const sendEmails = async (req, res) => {
  const certificates = req.body; 
  
  if (!certificates || !Array.isArray(certificates)) {
    return res.status(400).json({ 
      error: "Missing or invalid certificates array in request body" 
    });
  }

  const results = [];
  const sendMail = require('../utils/email');
  const { loadTemplate } = require('../utils/template');

  for (const certData of certificates) {
    const { credentialId, email } = certData;
    
    if (!credentialId || !email) {
      results.push({
        email: email || 'unknown',
        success: false,
        message: "Missing credentialId or email"
      });
      continue;
    }

    try {
      const certificate = await Certificate.findOne({ credentialId });
      if (!certificate) {
        results.push({
          email,
          success: false,
          message: "Certificate not found"
        });
        continue;
      }

      const user = await User.findOne({ email });
      if (!user) {
        results.push({
          email,
          success: false,
          message: "User not found"
        });
        continue;
      }

      const variables = {
        firstName: user.firstName || 'Participant',
        lastName: user.lastName || '',
        certificateUrl: certificate.certificateURL || '#',
        issueDate: certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString() : new Date().toLocaleDateString(),
        credienitalId: certificate.credentialId, 
        email: user.email
      };

      const personalizedHtml = loadTemplate('technomazeCertificate.html', variables);

      const subject = `🎓 Your TechnoMaze V2 Certificate is Ready!`;
      await sendMail(email, subject, personalizedHtml);

      results.push({
        email,
        success: true,
        message: "Certificate email sent successfully"
      });

      await sleep(5000);

    } catch (error) {
      console.error(`Error processing certificate for ${email}:`, error);
      results.push({
        email,
        success: false,
        message: "Error sending email: " + error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  res.status(200).json({
    message: `Email sending completed. ${successCount} successful, ${failureCount} failed.`,
    results,
    summary: {
      total: results.length,
      successful: successCount,
      failed: failureCount
    }
  });
};

const validateCertificate = async (req, res) => {
  const { id } = req.params;
  const certificate = await Certificate.findOne({ credentialId: id })
  if(!certificate) {
    return res.status(404).json({ valid: false, message: "No certificate found" })
  } else {
    const user = await User.findOne({ certificates: certificate._id })
    if(!user) {
      return res.status(404).json({ valid: false, message: "No user found that owns this certificate." })
    }
    const userFullName = user.fullName
    return res.status(201).json({ valid: true, certificateUrl: certificate.certificateURL, authorFullName: userFullName })
  }
}

module.exports = {
  createCertificateTemplate,
  getCertificateTemplates,
  createCertificate,
  getCertificates,
  deleteCertificateTemplate,
  deleteCertificate,
  sendEmails,
  validateCertificate
};
