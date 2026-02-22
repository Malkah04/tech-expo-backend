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

async function insertImage(file, topic, userId, from = "reports-screenshot") {
  const fileName = `screenshot-report-for-${topic}-from-${userId}.jpg`;
  const { error } = await supabase.storage
    .from(from)
    .upload(fileName, fs.readFileSync(file.path), {
      contentType: file.mimetype,
      upsert: true,
    });
  if (error) throw new Error(error.message);
  fs.unlinkSync(file.path);
  const { publicUrl, publicURL } = supabase.storage.from(from).getPublicUrl(fileName);
  return publicURL || publicUrl || "";
}

const makeReport = async (req, res) => {
  const { email, report, topic } = req.body;
  const screenshotFile = req.file;
  const reportUser = req.reportUser;
  const userId = reportUser?.id;
  try {
    if (reportUser?.suspended) {
      return res.status(403).json({
        error: reportUser.forever
          ? "Your account is permanently suspended. You cannot submit reports."
          : "Your account is suspended. You cannot submit reports until the suspension ends.",
      });
    }
    if (!email || !report || !topic) {
      return res.status(400).json({ error: "missing required input" });
    }
    let publicURL = "";

    if (screenshotFile) {
      publicURL = await insertImage(screenshotFile, topic, userId);
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
    const reports = reportRes.rows;
    return res.status(200).json(reports);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const fetchReportsByTopic = async (req, res) => {
  const topic = req.query.topic ?? req.body?.topic;
  try {
    if (!topic) {
      return res.status(400).json({ error: "topic query parameter is required" });
    }
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
