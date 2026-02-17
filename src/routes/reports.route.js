const express = require("express");
const {
  fetchReportsAndSuggestions,
  makeReport,
  makeSuggestion,
  filter,
  getReportsOfUser,
} = require("../controllers/report.controller");
const { AuthReport } = require("../middlewares/report.midleware");
const { authenticate } = require("../middlewares/auth.middleware.js");
const { authorizeRoles } = require("../middlewares/role.middleware");
const router = express.Router();

const multer = require("multer");

const upload = multer({ dest: "uploads/screenshot" });

router.get(
  "/report/fetch-reports",
  // authenticate,
  // authorizeRoles("admin"),
  fetchReportsAndSuggestions,
);

router.post(
  "/report/make-report",
  upload.single("screenshot"),
  AuthReport,
  makeReport,
);
router.post("/report/filter", authenticate, authorizeRoles("admin"), filter);
router.post("/report/make-suggestion", AuthReport, makeSuggestion);

module.exports = router;
