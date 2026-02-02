const nodemailer = require("nodemailer");

// const transporter = nodemailer.createTransport({
//   host: "smtp.office365.com",
//   secure: false,
//   port: 587,
//   auth: {
//     user: "info@techexpo.site",
//     pass: "qvrrvggxddjlsmsm",
//   },
//   connectionTimeout: 50000,
//   greetingTimeout: 50000,
//   socketTimeout: 50000,
//   // requireTLS: true,
//   tls: {
//     ciphers: 'SSLv3',
//     rejectUnauthorized: false 
//   }

// });

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
  connectionTimeout: 50000,
  greetingTimeout: 50000,
  socketTimeout: 50000,
  requireTLS: true,

});

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
