const mongoose = require("mongoose");

const FriendSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  grade: { type: String, required: true },
  institution: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  paymentPhone: { type: String, required: true },
});

const RegistrationSchema = new mongoose.Schema({
  registrationType: {
    type: String,
    enum: ["individual", "friends"],
    required: true,
  },
  teamCopoun: { type: String },
  fullName: String,
  email: String,
  phone: String,
  grade: String,
  institution: String,
  paymentMethod: String,
  paymentPhone: String,
  paymentScreenshotUrl: String,

  friends: [FriendSchema],
  paymentScreenshotsUrls: [String],

  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports =
  mongoose.models.Registration ||
  mongoose.model("Registration", RegistrationSchema);
