const mongoose = require("mongoose");

const EmailTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    html: {
      type: String,
      required: true,
    },
    previewUrl: {
      type: String,
      default: null, 
    },
    variables: {
      type: Array,
      default: null
    },
    identity: {
      type: String,
      required: true
    },

  },
  { timestamps: true } 
);

module.exports = mongoose.model("EmailTemplate", EmailTemplateSchema);
