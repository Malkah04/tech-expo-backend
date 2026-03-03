const express = require("express");
const {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendEmailHandler,
} = require("../controllers/email.controller.js");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { authorizeRoles } = require("../middlewares/role.middleware.js");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: "Too many requests from this IP, please try again later",
});

router.get("/email/templates", getAllTemplates);
router.get("/email/templates/:id", getTemplateById);
router.post("/email/create-template", createTemplate);
router.put("/email/templates/:id", updateTemplate);
router.delete("/email/templates/:id", deleteTemplate);
router.post("/email/send", limiter, sendEmailHandler);

module.exports = router;
