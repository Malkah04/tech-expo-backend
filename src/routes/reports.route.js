const express = require("express");
const {
  fetchReports,
  fetchReportsByTopic,
  makeReport,
} = require("../controllers/report.controller");
const { AuthReport } = require("../middlewares/report.midleware");
const { authenticate } = require("../middlewares/auth.middleware.js");
const { authorizeRoles } = require("../middlewares/role.middleware");
const router = express.Router();

router.get(
  "/report/fetch-reports",
  authenticate,
  authorizeRoles("admin"),
  fetchReports,
);
router.get(
  "/report/filter-by-topic",
  authenticate,
  authorizeRoles("admin"),
  fetchReportsByTopic,
);
router.post("/report/add-report", AuthReport, makeReport);

module.exports = router;
