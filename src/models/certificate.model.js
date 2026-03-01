const mongoose = require("mongoose");
const crypto = require("crypto");

const CertificateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    credentialId: {
      type: String,
      unique: true,
      required: true,
    },
    certificateURL: {
      type: String,
      unique: true,
      required: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    title: {
      type: String,
      default: "None"
    }
  },
  { timestamps: true }
);

CertificateSchema.statics.generateID = async function () {
  return crypto.randomBytes(3).toString("hex");
};

CertificateSchema.pre("save", async function (next) {
  if (!this.credentialId) {
    this.credentialId = await this.constructor.generateID();
  }
  next();
});

module.exports = mongoose.model("Certificate", CertificateSchema);
