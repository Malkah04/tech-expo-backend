const mongoose = require("mongoose");
const { required } = require("zod/mini");
const crypto = require("crypto");

const arrayLimit = (val) => val.length <= 10;

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      minlength: [2, "First name must be at least 2 characters"],
      maxlength: [50, "First name can't exceed 50 characters"],
      set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      minlength: [2, "Last name must be at least 2 characters"],
      maxlength: [50, "Last name can't exceed 50 characters"],
      set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
    },
    username: {
      type: String,
      required: [
        function () {
          return !this.providers || this.providers.length === 0;
        },
        "Username is required",
      ],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username can't exceed 30 characters"],
      index: true,
      sparse: true,
    },
    email: {
      type: String,
      sparse: true,
      required: [
        function () {
          return !this.providers || this.providers.length === 0;
        },
        ,
        "Email is required",
      ],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Invalid email address"],
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"],
    },
    password: {
      type: String,
      required: [
        function () {
          return !this.providers || this.providers.length === 0;
        },
        "Password is required",
      ],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    birthDate: {
      type: Date,
      required: [
        function () {
          return !this.providers || this.providers.length === 0;
        },
        "Birth date is required",
      ],
      validate: {
        validator(value) {
          const age =
            (Date.now() - value.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          return age >= 10 && age <= 100;
        },
        message: "Age must be between 10 and 100",
      },
    },
    grade: {
      type: String,
      trim: true,
      maxlength: 20,
      required: [
        function () {
          return !this.providers || this.providers.length === 0;
        },
        "Grade is required",
      ],
    },
    school: {
      type: String,
      trim: true,
      maxlength: 100,
      required: function () {
        return !this.providers || this.providers.length === 0;
      },
    },
    interests: {
      type: [String],
      default: [],
      validate: {
        validator: arrayLimit,
        message: "Interests limit exceeded (max 10)",
      },
    },
    agreeToTerms: {
      type: Boolean,
      required: function () {
        return !this.providers || this.providers.length === 0;
      },
      validate: {
        validator: (v) => v === true,
        message: "User must agree to terms",
      },
    },
    subscribeNewsletter: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    verificationToken: { type: String, select: false },
    verificationExpires: { type: Date, select: false },
    forgotPasswordToken: { type: String, select: false },
    forgotPasswordExpires: { type: Date, select: false },
    validateBeforeLogin: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "highboard", "intern"],
      default: "user",
    },
    position: {
      type: String,
      enum: [
        "HR",
        "PR",
        "Web Development",
        "Marketing",
        "Management",
        "Graphic design",
        "Video editing",
        "Content writing",
        "Ambassador",
        "Media",
        "Project Management",
        "Reels maker",
        "None",
      ],
      default: "None",
    },
    certificates: {
      type: Array,
    },
    lastEmailSent: {
      type: Date,
      default: Date.now,
    },
    registeredToTechnomaze: {
      type: Boolean,
      default: false,
    },
    providers: {
      type: [
        {
          provider: {
            type: String,
            enum: ["facebook", "google", "github"],
            required: true,
          },
          providerId: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.methods.getVerificationToken = function () {
  const token = crypto.randomBytes(20).toString("hex");

  this.verificationToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  this.verificationTokenExpire = new Date(Date.now() + 30 * 60 * 1000);

  return token;
};

userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  return resetToken;
};

module.exports = mongoose.model("User", userSchema);
