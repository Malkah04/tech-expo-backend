const isProduction = process.env.NODE_ENV === "production";
const z = require("zod");
const sendMail = require("../utils/email");
const { loadTemplate } = require("../utils/template");
const crypto = require("crypto");
const host = require("../utils/host");
const { pgClient } = require("../config/db.config.pg");
const multer = require("multer");
const supabase = require("../config/supabase");

const upload = multer({ dest: "uploads/screens" });
const fs = require("fs");

// create table reports (user_id , screenshot url , report ,topic)

// status

async function insertImage(screenshot, from = "reports-screenshot") {
  const file = screenshot;
  const fileName = `screenshot-report-for-${topic}-from${user.id}.jpg`;
  const { data, error } = await supabase.storage
    .from(from)
    .upload(fileName, fs.readFileSync(file.path), {
      contentType: file.mimetype,
      upsert: true,
    });
  if (error) return res.status(500).json({ error: error.message });
  fs.unlinkSync(file.path);
  const { publicURL } = supabase.storage.from(from).getPublicUrl(fileName);

  return publicURL;
}

const makeReport = async (req, res) => {
  const { email, screenshot, report, topic } = req.body;
  const userId = req.reportUser.id;
  try {
    if (!email || !report || !topic) {
      return res.status(400).json({ error: "missing required input" });
    }
    let publicURL = "";

    if (screenshot) {
      publicURL = insertImage(screenshot);
    }

    await pgClient.query(
      `insert into reports (user_id ,screenshot_url ,report ,topic) values ($1,$2,$3,$4)`,
      [userId, publicURL, report, topic],
    );

    return res.status(200).json({ message: "Report sent successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const fetchReports = async (req, res) => {
  try {
    const reportRes = await pgClient.query(`select * from reports`);
    const reports = reportRes.rows[0];
    return res.status(200).json(reports);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const fetchReportsByTopic = async (req, res) => {
  const { topic } = req.body;
  try {
    const reportRes = await pgClient.query(
      `select * from reports where topic=$1`,
      [topic],
    );
    const reports = reportRes.rows;
    if (reports.length === 0) {
      return res.status(200).json({ error: "no report for this topic" });
    }
    return res.status(200).json(reports);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

module.exports = {
  fetchReports,
  makeReport,
  fetchReportsByTopic,
};
