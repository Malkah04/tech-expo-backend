const isProduction = process.env.NODE_ENV === "production";
const { pgClient } = require("../config/db.config.pg");
const z = require("zod");

// Validation schemas for admin notes
const noteSchema = z.object({
  email: z.string().min(3, "Email is required").email("Invalid email address"),
  note: z
    .string()
    .min(3, "Note must be at least 3 characters")
    .max(2000, "Note is too long"),
});

const emailOnlySchema = z.object({
  email: z.string().min(3, "Email is required").email("Invalid email address"),
});

const noteIdSchema = z.object({
  noteId: z
    .number({
      invalid_type_error: "noteId must be a number",
    })
    .int()
    .positive("noteId must be positive"),
});

// create table admin_note (user_id , note)

const addAdminNote = async (req, res) => {
  try {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    let { email, note } = parsed.data;
    email = email.toLowerCase();

    const findUserRes = await pgClient.query(
      `select * from users where email = $1`,
      [email],
    );
    const findUser = findUserRes.rows[0];
    if (!findUser) {
      return res.status(404).json({ error: "No user found" });
    }

    await pgClient.query(
      `insert into admin_note (user_id, note) values ($1, $2)`,
      [findUser.id, note],
    );

    return res.status(200).json({ message: "Note added successfully" });
  } catch (err) {
    console.error("addAdminNote error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const fetchNoteForUser = async (req, res) => {
  try {
    const parsed = emailOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    let { email } = parsed.data;
    email = email.toLowerCase();

    const findUserRes = await pgClient.query(
      `select * from users where email = $1`,
      [email],
    );
    const findUser = findUserRes.rows[0];
    if (!findUser) {
      return res.status(404).json({ error: "No user found" });
    }

    const noteRes = await pgClient.query(
      `select * from admin_note where user_id = $1 order by id desc limit 1`,
      [findUser.id],
    );
    return res.status(200).json(noteRes.rows[0] || null);
  } catch (err) {
    console.error("fetchNoteForUser error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const deleteNoteForUserbyId = async (req, res) => {
  try {
    const parsed = noteIdSchema.safeParse({
      noteId:
        typeof req.body?.noteId === "string"
          ? Number(req.body.noteId)
          : req.body?.noteId,
    });
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { noteId } = parsed.data;

    const deleteRes = await pgClient.query(
      `delete from admin_note where id = $1`,
      [noteId],
    );

    if (deleteRes.rowCount === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    return res.status(200).json({ message: "Note deleted successfully" });
  } catch (err) {
    console.error("deleteNoteForUserbyId error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

module.exports = {
  fetchNoteForUser,
  addAdminNote,
  deleteNoteForUserbyId,
};
