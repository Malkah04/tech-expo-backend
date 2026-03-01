const express = require("express");
const router = express.Router();
const { ALLOWED_PROVIDERS } = require("../config/providers.config");

/**
 * GET /api/config/providers
 * Public endpoint to fetch the list of allowed OAuth providers.
 * Keeps frontend and backend in sync without requiring updates in both places.
 */
router.get("/config/providers", (req, res) => {
  try {
    const providers = ALLOWED_PROVIDERS.map((id) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1), // "google" -> "Google", "github" -> "Github"
    }));
    res.status(200).json({ providers });
  } catch (error) {
    console.error("Error fetching config/providers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
