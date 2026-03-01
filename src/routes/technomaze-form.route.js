const express = require("express");
const { createRegistration, fetchRegistrations, deleteRegistration, updateRegisteration, manualCreateRegistration } = require("../controllers/form.controller.js");
const Registration = require("../models/technomaze-form.model.js");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware.js");
const { authorizeRoles } = require("../middlewares/role.middleware.js");

router.post("/register-form", authenticate, createRegistration);
router.get("/registrations", fetchRegistrations);
router.delete("/registrations/:id" , authenticate, authorizeRoles("admin"), deleteRegistration);
router.patch("/registrations/:id", authenticate, authorizeRoles("admin") ,updateRegisteration);
router.post("/register-form-manual", authenticate, authorizeRoles("admin") , manualCreateRegistration);

module.exports = router;
