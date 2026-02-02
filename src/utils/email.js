const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   host: "smtp.office365.com",
//   port: 587,
//   secure: false,
//   auth: {
//     user: "info@techexpo.site",
//     pass: "qvrrvggxddjlsmsm",
//   },

// });

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
});

const sendMail = async (to, subject, text) => {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Tech Expo", email: "info@techexpo.site" },
      to: [{ email: to }],
      subject,
      htmlContent: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo API error: ${await response.text()}`);
  }
};

// const sendMail = async (to, subject, text) => {
//   try {
//     const mailOptions = {
//       from: "Tech Expo <info@techexpo.site>" || process.env.SMTP_USER,
//       to,
//       subject,
//       html: text,
//     };

//     await transporter.sendMail(mailOptions);
//     console.log(`Email sent to ${to}`);
//   } catch (error) {
//     console.error("Error sending email:", error);
//     throw error;
//   }
// };

module.exports = sendMail;
