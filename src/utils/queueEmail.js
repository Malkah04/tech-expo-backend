const nodemailer = require("nodemailer");
const sendMail = require("./email");

const SEND_DELAY_MS = 15000; // 15 seconds between sends
const MAX_RETRIES = 3;

let emailQueue = [];
let isSending = false;

function queueEmail(emailOptions) {
  emailQueue.push({ options: emailOptions, retries: 0 });
  if (!isSending) processQueue();
}   

async function processQueue() {
  isSending = true;
    
  while (emailQueue.length > 0) {
    const email = emailQueue.shift();
    try {
      console.log(`📧 Sending to: ${email.options.to}`);
      await sendMail({ to: email.options.to, subject: email.options.subject, html: email.options.html });
      console.log(`✅ Sent to: ${email.options.to}`);
    } catch (err) {
      console.error(`❌ Failed to send to ${email.options.email}: ${err}`);

      if (email.retries < MAX_RETRIES) {
        email.retries++;
        console.log(`🔄 Retrying in ${SEND_DELAY_MS / 1000}s (${email.retries}/${MAX_RETRIES})...`);
        await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
        emailQueue.push(email);
        continue;
      }
    }

    if (emailQueue.length > 0) {
      console.log(`⏳ Waiting ${SEND_DELAY_MS / 1000} seconds before next send...`);
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }
  }

  isSending = false;
}

module.exports = queueEmail;
