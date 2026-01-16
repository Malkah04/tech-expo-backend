const mongoose = require("mongoose");
const crypto = require("crypto");

const CertificateTemplateSchema = new mongoose.Schema(
  {
    templateName: {
      type: String,
      required: true,
    },
    background: {
      type: String,
      required: true,
    },
    fields: {
      type: Array,
      required: true,
    },
    previewUrl: {
      type: String,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CertificateTemplate", CertificateTemplateSchema);
