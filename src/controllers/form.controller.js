const Registration = require("../models/technomaze-form.model");
const User = require("../models/user.model"); // Import your User model

const createRegistration = async (req, res) => {
  try {
    const {
      registrationType,
      grade,
      institution,
      paymentMethod,
      paymentPhone,
      paymentScreenshotUrl,
      friends,
      paymentScreenshotsUrls,
      teamCopoun,
    } = req.body;

    const {
      _id: userId,
      fullName,
      email,
      phone,
      registeredToTechnomaze,
    } = req.user;

    if (registeredToTechnomaze) {
      if (registrationType === "individual") {
        return res
          .status(400)
          .json({ error: "You have already registered as an individual" });
      }
      if (registrationType === "friends") {
        return res
          .status(400)
          .json({ error: `${fullName} has already registered before` });
      }
    }

    const existingRegistration = await Registration.findOne({
      email,
      registrationType,
    });
    if (existingRegistration) {
      return res
        .status(400)
        .json({ error: "A registration already exists for this type" });
    }

    let newRegistration;

    if (registrationType === "individual") {
      if (
        !grade ||
        !institution ||
        !paymentMethod ||
        !paymentPhone ||
        !paymentScreenshotUrl
      ) {
        return res.status(200).json({
          error: "Missing required fields for individual registration",
        });
      }

      newRegistration = new Registration({
        registrationType,
        teamCopoun,
        fullName,
        email,
        phone,
        grade,
        institution,
        paymentMethod,
        paymentPhone,
        paymentScreenshotUrl,
      });
    }

    if (registrationType === "friends") {
      if (
        !Array.isArray(friends) ||
        friends.length === 0 ||
        friends.length > 5
      ) {
        return res
          .status(400)
          .json({ error: "Provide 1–5 friends with complete info" });
      }

      for (let i = 0; i < friends.length; i++) {
        const f = friends[i];
        if (
          !f.fullName ||
          !f.email ||
          !f.phone ||
          !f.paymentMethod ||
          !f.paymentPhone
        ) {
          return res
            .status(400)
            .json({ error: `Friend #${i + 1} has missing fields` });
        }

        const existingFriendRegistration = await Registration.findOne({
          "friends.email": f.email,
        });
        if (existingFriendRegistration) {
          return res.status(200).json({
            error: `Friend #${i + 1} (${f.fullName}) has already registered`,
          });
        }
      }

      newRegistration = new Registration({
        registrationType,
        teamCopoun,
        friends,
        paymentScreenshotsUrls,
      });
    }


    await newRegistration.save();


    await User.findByIdAndUpdate(userId, { registeredToTechnomaze: true });

    return res.status(201).json({ message: "Registration saved successfully" });
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const fetchRegistrations = async (req, res) => {
  try {
    const registrations = await Registration.find();
    res.json(registrations);
  } catch (err) {
    console.error("Fetch Registrations Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const registration = await Registration.findByIdAndDelete(id);

    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }
    const user = await User.findOne({ email: registration.email });

    if (user) {
      user.registeredToTechnomaze = false;
      await user.save();
    }
    res.json({ message: "Registration deleted successfully" });
  } catch (err) {
    console.error("Delete Registration Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateRegisteration = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      email,
      fullName,
      grade,
      paymentMethod,
      paymentPhone,
      phone,
      school,
      teamCopoun,
    } = req.body;
    const payload = {
      email,
      fullName,
      grade,
      paymentMethod,
      paymentPhone,
      phone,
      school,
      teamCopoun,
    };
    const registration = await Registration.findByIdAndUpdate(id, payload);
    if (!registration) {
      return res.status(200).json({ error: "Registration not found" });
    }
    res.status(200).json({ message: "Registration updated successfully" });
  } catch (e) {
    console.error("Update Registration Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const manualCreateRegistration = async (req, res) => {
  try {
    const {
      registrationType,
      teamCopoun,
      fullName,
      email,
      phone,
      grade,
      school,
      paymentMethod,
      paymentPhone,
      paymentScreenshotUrl,
      friends,
      paymentScreenshotsUrls
    } = req.body;

    if (!["individual", "friends"].includes(registrationType)) {
      return res.status(400).json({ error: "Invalid registrationType" });
    }

    let newRegistration;

    if (registrationType === "individual") {
      if (!fullName || !email || !phone || !grade || !school || !paymentMethod || !paymentPhone || !paymentScreenshotUrl) {
        return res.status(400).json({ error: "Missing required fields for individual registration" });
      }

      const existing = await Registration.findOne({ email, registrationType });
      if (existing) {
        return res.status(400).json({ error: "Registration already exists for this individual" });
      }

      newRegistration = new Registration({
        registrationType,
        teamCopoun,
        fullName,
        email,
        phone,
        grade,
        institution: school,
        paymentMethod,
        paymentPhone,
        paymentScreenshotUrl
      });
    }

    if (registrationType === "friends") {
      if (!Array.isArray(friends) || friends.length === 0 || friends.length > 5) {
        return res.status(400).json({ error: "Provide 1–5 friends with complete info" });
      }

      for (let i = 0; i < friends.length; i++) {
        const f = friends[i];
        if (!f.fullName || !f.email || !f.phone || !f.grade || !f.institution || !f.paymentMethod || !f.paymentPhone) {
          return res.status(400).json({ error: `Friend #${i + 1} has missing fields` });
        }

        const existingFriend = await Registration.findOne({ "friends.email": f.email });
        if (existingFriend) {
          return res.status(400).json({ error: `Friend #${i + 1} (${f.fullName}) has already registered` });
        }
      }

      newRegistration = new Registration({
        registrationType,
        teamCopoun,
        friends,
        paymentScreenshotsUrls
      });
    }

    await newRegistration.save();

    res.status(201).json({ message: "Registration created successfully", data: newRegistration });
  } catch (err) {
    console.error("Manual Registration Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { manualCreateRegistration };


module.exports = {
  createRegistration,
  fetchRegistrations,
  deleteRegistration,
  updateRegisteration,
  manualCreateRegistration,
};
