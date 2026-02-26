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
async function insertImage(file, from = "reports-screenshot") {
  const fileName = `screenshot-${Date.now()}-${file.originalname}`;

  const { error } = await supabase.storage
    .from(from)
    .upload(fileName, fs.readFileSync(file.path), {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  fs.unlinkSync(file.path);

  const { data } = supabase.storage.from(from).getPublicUrl(fileName);

  return data.publicUrl;
}

//report -> level , specific issue ,category , description ,screenshot
const makeReport = async (req, res) => {
  const { description, category, priority, specific_issue } = req.body;
  const userId = req.reportUser.id;
  const screenshot = req.file;
  try {
    if (!category || !description || !priority) {
      return res.status(400).json({ error: "missing required input" });
    }
    let publicURL = "";

    if (screenshot) {
      publicURL = await insertImage(screenshot);
    }

    await pgClient.query(
      `insert into reports_and_suggestions (user_id ,screenshot_url , description,priority,category,specific_issue ,status ,type ,ticket_id) values ($1,$2,$3,$4 ,$5 ,'in Progress','Report', 'TCK-' || nextval('ticket_seq'))`,
      [userId, publicURL, description,priority, category, specific_issue],
    );

    return res.status(200).json({ message: "Report sent successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

// suggestion -> category , title , description ,screen shot

const makeSuggestion = async (req, res) => {
  const { category, title, description, screenshot } = req.body;

  const userId = req.reportUser.id;
  try {
    if (!category || !description || !title) {
      return res.status(400).json({ error: "missing required input" });
    }
    let publicURL = "";

    if (screenshot) {
      publicURL = insertImage(screenshot);
    }

    await pgClient.query(
      `insert into reports_and_suggestions (user_id ,screenshot_url ,category,title ,description ,status ,type ,ticket_id) values ($1,$2,$3,$4 ,$5,'in Progress','Suggestion' ,'TCK-' || nextval('ticket_seq'))`,
      [userId, publicURL, category, title, description],
    );

    return res.status(200).json({ message: "suggestion sent successfully" });
  } catch (err) {
    console.error("makeSuggestion error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const fetchReportsAndSuggestions = async (req, res) => {
  try {
    const reportRes = await pgClient.query(
      ` select r.*, u.email from reports_and_suggestions r join users u on r.user_id = u.id`,
    );

    const reports = reportRes.rows;
    return res.status(200).json(reports);
  } catch (err) {
    console.error("fetchReportsAndSuggestions error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const filter = async (req, res) => {
  const { type, status, priority, search } = req.query;

  try {
    let query = `
      SELECT r.*, u.email
      FROM reports_and_suggestions r
      JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const values = [];
    let index = 1;

    if (type && type !== "all") {
      query += ` AND r.type = $${index++}`;
      values.push(type);
    }

    if (status && status !== "all") {
      query += ` AND r.status = $${index++}`;
      values.push(status);
    }

    if (priority && priority !== "all") {
      query += ` AND r.priority = $${index++}`;
      values.push(priority);
    }

    if (search && search.trim() !== "") {
      query += `
          AND (
            similarity(r.title, $${index}) > 0.3
            OR similarity(r.description, $${index}) > 0.3
            OR similarity(r.specific_issue, $${index}) > 0.3
            OR similarity(u.email, $${index}) > 0.3
          )
        `;
      values.push(search);
      index++;
      query += ` ORDER BY GREATEST(
        similarity(r.title, $${index - 1}),
        similarity(r.description, $${index - 1}),
        similarity(r.specific_issue, $${index - 1}),
        similarity(u.email, $${index - 1})
      ) DESC`;
    }

    const result = await pgClient.query(query, values);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Filter/Search error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getReportsOfUser = async (req, res) => {
  const { id } = req.query;
  try {
    const result = await pgClient.query(
      `
      SELECT r.*, u.*
      FROM reports_and_suggestions r
      JOIN users u ON r.user_id = u.id
      WHERE r.user_id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({ error: "no reports for this user" });
    }

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Filter/Search error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// bgfopbjpf

module.exports = {
  fetchReportsAndSuggestions,
  makeReport,
  makeSuggestion,
  filter,
  getReportsOfUser,
};
