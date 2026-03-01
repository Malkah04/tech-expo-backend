const Registration = require("../models/technomaze-form.model");
const User = require("../models/user.model");
const { pgClient } = require("../config/db.config.pg");

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
      id: userId,
      first_name,
      last_name,
      email,
      phone,
      registered_to_technomaze,
    } = req.user;
    console.log(email);
    const fullName = `${first_name} ${last_name}`;

    if (registered_to_technomaze) {
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

    const existingRes = await pgClient.query(
      `select * from registrations where email =$1 and registration_type =$2 `,
      [email, registrationType],
    );
    const existingRegistration = existingRes.rows[0];

    if (existingRegistration) {
      return res
        .status(400)
        .json({ error: "A registration already exists for this type" });
    }

    let newRegistration;
    let values;

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

      await pgClient.query(
        `
        insert into registrations (registration_type,team_copoun,full_name ,email,phone,grade,institution,payment_method,payment_phone,payment_screenshot_url) values ($1 ,$2 ,$3 ,$4 ,$5 ,$6 ,$7 ,$8 ,$9 ,$10)`,
        [
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
        ],
      );
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

        const existingfriendRes = await pgClient.query(
          `
          select * from friends where email =$1`,
          [f.email],
        );

        const existingFriendRegistration = existingfriendRes.rows[0];

        if (existingFriendRegistration) {
          return res.status(200).json({
            error: `Friend #${i + 1} (${f.fullName}) has already registered`,
          });
        }
      }

      const regRes = await pgClient.query(
        `
        insert into registrations 
        (registration_type, team_copoun, payment_screenshots_urls)
        values ($1 ,$2 ,$3) returning *`,
        [registrationType, teamCopoun, paymentScreenshotsUrls],
      );
      const registrationed = regRes.rows[0];
      console.log(regRes.rows[0]);

      for (const f of friends) {
        await pgClient.query(
          `
          INSERT INTO friends
          (registration_id, full_name, email, phone, payment_method, payment_phone)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [
            registrationed.id,
            f.fullName,
            f.email,
            f.phone,
            f.paymentMethod,
            f.paymentPhone,
          ],
        );
      }
    }

    await pgClient.query(
      `update users set registered_to_technomaze = true where id = $1 returning *`,
      [userId],
    );

    return res.status(201).json({ message: "Registration saved successfully" });
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const fetchRegistrations = async (req, res) => {
  try {
    const registerationRes = await pgClient.query(
      `select * from registrations`,
    );
    const registrations = registerationRes.rows;
    if (!registrations.length) {
      return res.status(200).json({ message: "no registrations", data: [] });
    }
    res.json(registrations);
  } catch (err) {
    console.error("Fetch Registrations Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    const registerationRes = await pgClient.query(
      `delete from registrations where id =$1 returning *`,
      [id],
    );
    const registration = registerationRes.rows[0];

    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }
    if (registration.email) {
      const userRes = await pgClient.query(`select * from users where email=$1`, [
        registration.email,
      ]);
      const user = userRes.rows[0];
      if (user) {
        await pgClient.query(
          `update users set registered_to_technomaze = $1 where email = $2`,
          [false, registration.email],
        );
      }
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
    const registrationRes = await pgClient.query(
      `update registrations set
      email = $1,
      full_name = $2,
      grade = $3,
      payment_method = $4,
      payment_phone = $5,
      phone = $6,
      institution = $7,
      team_copoun = $8
      where id = $9 returning *`,
      [
        payload.email,
        payload.fullName,
        payload.grade,
        payload.paymentMethod,
        payload.paymentPhone,
        payload.phone,
        payload.school,
        payload.teamCopoun,
        id,
      ],
    );
    const registration = registrationRes.rows[0];
    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }
    res.status(200).json({ message: "Registration updated successfully" });
  } catch (e) {
    console.error("Update Registration Error:", e);
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
      paymentScreenshotsUrls,
    } = req.body;

    if (!["individual", "friends"].includes(registrationType)) {
      return res.status(400).json({ error: "Invalid registrationType" });
    }

    let newRegistration;

    if (registrationType === "individual") {
      if (
        !fullName ||
        !email ||
        !phone ||
        !grade ||
        !school ||
        !paymentMethod ||
        !paymentPhone ||
        !paymentScreenshotUrl
      ) {
        return res.status(400).json({
          error: "Missing required fields for individual registration",
        });
      }

      const existRes = await pgClient.query(
        `select * from registrations where email =$1 and registration_type =$2`,
        [email, registrationType],
      );
      const existing = existRes.rows[0];

      if (existing) {
        return res
          .status(400)
          .json({ error: "Registration already exists for this individual" });
      }

      const insertRes = await pgClient.query(
        `
        insert into registrations (registration_type,team_copoun,full_name ,email,phone,grade,institution,payment_method,payment_phone,payment_screenshot_url) values ($1 ,$2 ,$3 ,$4 ,$5 ,$6 ,$7 ,$8 ,$9 ,$10) returning *`,
        [
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
        ],
      );
      newRegistration = insertRes.rows[0];
      return res.status(201).json({
        message: "Individual registration created successfully",
        data: newRegistration,
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
          !f.grade ||
          !f.institution ||
          !f.paymentMethod ||
          !f.paymentPhone
        ) {
          return res
            .status(400)
            .json({ error: `Friend #${i + 1} has missing fields` });
        }
        const existingFriendRes = await pgClient.query(
          `select * from friends where email = $1`,
          [f.email],
        );

        if (existingFriendRes.rows.length) {
          return res.status(400).json({
            error: `Friend #${i + 1} (${f.fullName}) has already registered`,
          });
        }
      }
      const regRes = await pgClient.query(
        `INSERT INTO registrations
          (registration_type, team_copoun, payment_screenshots_urls)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [registrationType, teamCopoun, paymentScreenshotsUrls],
      );

      const registrationId = regRes.rows[0].id;

      for (const f of friends) {
        await pgClient.query(
          `INSERT INTO friends
            (registration_id, full_name, email, phone, grade, institution, payment_method, payment_phone)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            registrationId,
            f.fullName,
            f.email,
            f.phone,
            f.grade,
            f.institution,
            f.paymentMethod,
            f.paymentPhone,
          ],
        );
      }
      newRegistration = { registrationId, friends };
    }

    res.status(201).json({
      message: "Registration created successfully",
      data: newRegistration,
    });
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
