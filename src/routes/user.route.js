const express = require("express");
const {
  deleteAcc,
  suspendUser,
  unSuspendUser,
  changeEmail,
} = require("../controllers/user.controller");

const {
  authenticate,
  csrfCheck,
} = require("../middlewares/auth.middleware.js");

const router = express.Router();
const { authorizeRoles } = require("../middlewares/role.middleware.js");
const {
  addAdminNote,
  fetchNoteForUser,
  deleteNoteForUserbyId,
} = require("../controllers/admin-notes.controller.js");
const {
  checkSuspension,
} = require("../middlewares/chechsuspend.middleware.js");

router.use(checkSuspension);

router.post(
  "/add-admin-note",
  authenticate,
  authorizeRoles("admin"),
  addAdminNote,
);

router.put("/user/delete-my-account", authenticate, deleteAcc);
router.put(
  "/user/suspend-user",
  authenticate,
  authorizeRoles("admin"),
  suspendUser,
);
router.put(
  "/user/unsuspend-user",
  authenticate,
  authorizeRoles("admin"),
  unSuspendUser,
);
router.put("/user/change-email", authenticate, changeEmail);
router.post(
  "/user/add-note",
  authenticate,
  authorizeRoles("admin"),
  addAdminNote,
);
router.get(
  "/user/get-note",
  authenticate,
  authorizeRoles("admin"),
  fetchNoteForUser,
);

router.delete(
  "/user/delete-note",
  authenticate,
  authorizeRoles("admin"),
  deleteNoteForUserbyId,
);
module.exports = router;
