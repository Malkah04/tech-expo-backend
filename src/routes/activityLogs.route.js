const express = require("express");
const {
  authenticate,
} = require("../middlewares/auth.middleware.js");
const { authorizeRoles } = require("../middlewares/role.middleware.js");
const {
  listActivityLogsAdmin,
  listMyActivityLogs,
} = require("../controllers/activityLogs.controller.js");

const router = express.Router();

// Admin: system-wide logs (filter by userId/action/q=email)
router.get(
  "/activity-logs",
  authenticate,
  authorizeRoles("admin"),
  listActivityLogsAdmin,
);

// User: own security history
router.get("/activity-logs/me", authenticate, listMyActivityLogs);

module.exports = router;

