const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  //   secure: process.env.SMTP_SECURE === "true",
  port: 587,
  auth: {
    user: "info@techexpo.site",
    pass: "qvrrvggxddjlsmsm",
  },
});

// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   //   secure: process.env.SMTP_SECURE === "true",
//   port: 587,
//   auth: {
//     user: "9cf632001@smtp-brevo.com",
//     pass: "phzlztpqyoizzezd",
//   },
//   secure: false,
// });

const sendMail = async (to, subject, text) => {
  try {
    const mailOptions = {
      from: "Tech Expo <info@techexpo.site>" || process.env.SMTP_USER,
      to,
      subject,
      html: text,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = sendMail;
