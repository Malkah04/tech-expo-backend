const PDFDocument = require("pdfkit");
const uploadToCloudinary = require("./upload");
const axios = require("axios");
const crypto = require("crypto");
const Certificate = require("../models/certificate.model");
const path = require("path");
const { pgClient } = require("../config/db.config.pg");
const supabase = require("../config/supabase");

const generateID = async function () {
  return crypto.randomBytes(3).toString("hex");
};

function resolveFont(fontFamily) {
  const builtInFonts = [
    "Helvetica",
    "Courier",
    "Times-Roman",
    "Symbol",
    "ZapfDingbats",
  ];
  if (!fontFamily) return "Helvetica";

  const lower = fontFamily.toLowerCase();
  if (lower.includes("arial") || lower.includes("sans-serif"))
    return "Helvetica";
  if (lower.includes("times")) return "Times-Roman";
  if (lower.includes("courier")) return "Courier";
  if (lower.includes("symbol")) return "Symbol";
  if (lower.includes("zapf")) return "ZapfDingbats";
  if (lower.includes("gtproeliumsharp")) return "GTProeliumSharp";
  if (lower.includes("bahnschrift")) return "Bahnschrift";

  return builtInFonts.includes(fontFamily) ? fontFamily : "Helvetica";
}

function hashTemplate(template) {
  const str = JSON.stringify({
    background: template.background,
    layout: template.layout,
    fields: template.fields,
  });
  return crypto.createHash("md5").update(str).digest("hex");
}

async function generateAndUploadCertificate({ template, user }) {
  try {
    const newCredentialId = await generateID();
    const certificateRes = await pgClient.query(
      `
      insert into certificates (user_id ,credential_id ,title) 
      values ($1 ,$2 ,$3) returning *`,
      [user.id, newCredentialId, template.templateName],
    );

    const certificate = certificateRes.rows[0];

    const response = await axios.get(template.background, {
      responseType: "arraybuffer",
    });
    const bgBuffer = Buffer.from(response.data, "binary");

    const doc = new PDFDocument({
      size: "A4",
      layout: template.layout || "landscape",
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    const pdfBufferPromise = new Promise((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // Background
    doc.image(bgBuffer, 0, 0, {
      width: doc.page.width,
      height: doc.page.height,
    });

    // Register custom fonts once
    doc.registerFont(
      "GTProeliumSharp",
      path.join(__dirname, "../fonts/GTProeliumSharp.ttf"),
    );
    doc.registerFont(
      "Bahnschrift",
      path.join(__dirname, "../fonts/Bahnschrift.ttf"),
    );

    // Render fields
    for (const field of template.fields) {
      let text = "";
      switch (field.type) {
        case "name":
          text = user.fullName || "";
          break;
        case "role":
          text = user.role || "";
          break;
        case "credentialId":
          text = certificate.credential_id || "";
          break;
        case "date":
          text = certificate.issued_at
            ? new Date(certificate.issued_at).toLocaleDateString()
            : new Date().toLocaleDateString();
          break;
        default:
          text = field.text || "";
      }

      if (!text) continue;

      // Convert percentages → PDF coordinates
      const x = field.x * doc.page.width;
      const y = field.y * doc.page.height;
      const width = field.width * doc.page.width;
      const height = field.height * doc.page.height;

      doc
        .font(resolveFont(field.fontFamily))
        .fontSize((field.fontSize || 0.02) * doc.page.width)
        .fillColor(field.color || "#000000")
        .text(text, x, y, {
          width,
          height,
          align: field.textAlign,
          ellipsis: true,
        });
    }

    doc.end();
    const buffer = await pdfBufferPromise;

    const { data, error } = await supabase.storage
      .from("certificate-templates-images")
      .upload(`certificates/${certificate.credential_id}.pdf`, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (error) throw error;

    const { publicUrl } = supabase.storage
      .from("certificate-templates-images")
      .getPublicUrl(`certificates/${certificate.credential_id}.pdf`);

    await pgClient.query(
      `UPDATE certificates SET certificate_url = $1 WHERE id = $2`,
      [publicUrl, certificate.id],
    );

    return publicUrl;
  } catch (err) {
    console.error("Error generating certificate:", err);
    throw err;
  }
}

module.exports = generateAndUploadCertificate;
