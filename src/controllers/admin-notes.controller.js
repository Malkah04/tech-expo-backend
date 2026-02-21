const isProduction = process.env.NODE_ENV === "production";
const { pgClient } = require("../config/db.config.pg");

// create table admin_note (user_id , note)

const addAdminNote = async (req, res) => {
  let { email, note } = req.body;
  try {
    email = email.toLowerCase();
    const findUserRes = await pgClient.query(
      `select * from users where email =$1`,
      [email],
    );
    const findUser = findUserRes.rows[0];
    if (!findUser) {
      return res.status(404).json({ error: "No user found" });
    }

    const responsRes = await pgClient.query(
      `insert into admin_note (user_id ,note) values ($1,$2) `,
      [findUser.id, note],
    );

    res.status(200).json({ message: "note add successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const fetchNoteForUser = async (req, res) => {
  try {
    let { email } = req.body;
    email = email.toLowerCase();
    const findUserRes = await pgClient.query(
      `select * from users where email =$1`,
      [email],
    );
    const findUser = findUserRes.rows[0];
    if (!findUser) {
      return res.status(404).json({ error: "No user found" });
    }
    const noteRes = await pgClient.query(
      `select * from admin_note where user_id=$1`,
      [findUser.id],
    );
    return res.status(200).json(noteRes.rows[0]);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
};

const deleteNoteForUserbyId = async (req, res) => {
  try {
    const { noteId } = req.body;
    const findNoteRes = await pgClient.query(
      `delete * from admin_note where id=$1`,
      [noteId],
    );
    if (deleteRes.rowCount === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    return res.status(200).json({ message: "note deleted successfully" });
  } catch (err) {
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
