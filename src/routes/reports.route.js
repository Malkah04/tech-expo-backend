const express = require("express");
const {
  fetchReportsAndSuggestions,
  makeReport,
  makeSuggestion,
  filter,
  getReportsOfUser,
  getMyTickets,
  getMyTicketById,
  updateTicket,
} = require("../controllers/report.controller");
const { AuthReport } = require("../middlewares/report.midleware");
const { authenticate } = require("../middlewares/auth.middleware.js");
const { authorizeRoles } = require("../middlewares/role.middleware");
const router = express.Router();

const multer = require("multer");

const upload = multer({ dest: "uploads/screenshot" });

router.get(
  "/report/fetch-reports",
  authenticate,
  authorizeRoles("admin"),
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

router.get(
  "/report/report-byuser",
  authenticate,
  authorizeRoles("admin"),
  getReportsOfUser,
);

// User-facing: list own tickets
router.get("/report/my", authenticate, getMyTickets);

// User-facing: specific ticket, scoped to user_id
router.get("/report/my/:ticketId", authenticate, getMyTicketById);

// Admin: update ticket status / details
router.put(
  "/report/:ticketId",
  authenticate,
  authorizeRoles("admin"),
  updateTicket,
);

module.exports = router;
