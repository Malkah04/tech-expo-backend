const express = require("express");
const { getCertificateTemplates, createCertificateTemplate, createCertificate, getCertificates, deleteCertificateTemplate, deleteCertificate, sendEmails, validateCertificate } = require("../controllers/certificateGen.controller.js");
const router = express.Router();
const { authorizeRoles } = require("../middlewares/role.middleware.js");
const { authenticate } = require("../middlewares/auth.middleware.js")

router.get("/certificate/templates", getCertificateTemplates);
router.post("/certificate/create-template", createCertificateTemplate);
router.post("/certificate/create", createCertificate);
router.get("/certificate/certificates", getCertificates);
router.delete("/certificate/delete-template/:id", deleteCertificateTemplate);
router.delete("/certificate/certificates/:id", deleteCertificate);
router.get("/certificate/validate/:id", validateCertificate);
router.post("/certificate/send", sendEmails);



module.exports = router;