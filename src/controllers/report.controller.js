const isProduction = process.env.NODE_ENV === "production";
const z = require("zod");
const sendMail = require("../utils/email");
const { loadTemplate } = require("../utils/template");
const crypto = require("crypto");
const host = require("../utils/host");
const { pgClient } = require("../config/db.config.pg");
const multer = require("multer");
const supabase = require("../config/supabase");
const { logActivityAsync } = require("../utils/activityLog");

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

    const result = await pgClient.query(
      `insert into reports_and_suggestions
        (user_id ,screenshot_url , description,priority,category,specific_issue ,status ,type ,ticket_id)
       values ($1,$2,$3,$4 ,$5 ,$6 ,'in Progress','Report', 'TCK-' || nextval('ticket_seq'))
       returning *`,
      [userId, publicURL, description, priority, category, specific_issue],
    );

    const ticket = result.rows[0];

    try {
      logActivityAsync(userId, "TICKET_CREATED", {
        ticketId: ticket.ticket_id,
        type: "Report",
        priority: ticket.priority,
        category: ticket.category,
        hasScreenshot: !!publicURL,
      });
    } catch {}

    return res.status(200).json({ message: "Report sent successfully", ticket });
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

    const result = await pgClient.query(
      `insert into reports_and_suggestions
        (user_id ,screenshot_url ,category,title ,description ,status ,type ,ticket_id)
       values ($1,$2,$3,$4 ,$5,'in Progress','Suggestion' ,'TCK-' || nextval('ticket_seq'))
       returning *`,
      [userId, publicURL, category, title, description],
    );

    const ticket = result.rows[0];

    try {
      logActivityAsync(userId, "TICKET_CREATED", {
        ticketId: ticket.ticket_id,
        type: "Suggestion",
        priority: ticket.priority,
        category: ticket.category,
        hasScreenshot: !!publicURL,
      });
    } catch {}

    return res.status(200).json({ message: "suggestion sent successfully", ticket });
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
      ` select
          r.*,
          u.first_name,
          u.last_name,
          u.username,
          u.email as user_email
        from reports_and_suggestions r
        join users u on r.user_id = u.id`,
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
      ORDER BY r.created_at DESC
      `,
      [id],
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

const getMyTickets = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pgClient.query(
      `
      SELECT *
      FROM reports_and_suggestions
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );
    return res.status(200).json(result.rows || []);
  } catch (err) {
    console.error("getMyTickets error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getMyTicketById = async (req, res) => {
  const userId = req.user.id;
  const { ticketId } = req.params;
  try {
    const result = await pgClient.query(
      `
      SELECT *
      FROM reports_and_suggestions
      WHERE user_id = $1 AND ticket_id = $2
      LIMIT 1
      `,
      [userId, ticketId],
    );

    const ticket = result.rows[0];
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    return res.status(200).json(ticket);
  } catch (err) {
    console.error("getMyTicketById error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const updateTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { status, replyMessage, internalNotes } = req.body || {};

  try {
    const existingRes = await pgClient.query(
      `select * from reports_and_suggestions where ticket_id = $1 limit 1`,
      [ticketId],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const nextStatus = status || existing.status;

    const updateRes = await pgClient.query(
      `
      update reports_and_suggestions
      set status = $1,
          updated_at = NOW()
      where ticket_id = $2
      returning *
      `,
      [nextStatus, ticketId],
    );

    const ticket = updateRes.rows[0];

    try {
      logActivityAsync(existing.user_id, "TICKET_STATUS_UPDATED", {
        ticketId,
        fromStatus: existing.status,
        toStatus: nextStatus,
        adminId: req.user?.id || null,
        adminEmail: req.user?.email || null,
        replyMessage: replyMessage || null,
        internalNotes: internalNotes || null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch {}

    return res.status(200).json(ticket);
  } catch (err) {
    console.error("updateTicket error:", err);
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
  getMyTickets,
  getMyTicketById,
  updateTicket,
};
