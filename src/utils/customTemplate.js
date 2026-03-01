const EmailTemplate = require("../models/emails.model");

/**
 * @param {String} templateId
 * @param {Object} variables
 * @returns {Promise<String>}
 */

async function loadCustomTemplate(templateId, variables) {
  const templateDoc = await EmailTemplate.findById(templateId);
  if (!templateDoc) {
    throw new Error("Template not found");
  }
  let template = templateDoc.html;
  let templateSubject = templateDoc.subject;
  for (const key in variables) {
    const regex = new RegExp(`{{${key}}}`, "g");
    template = template.replace(regex, variables[key]);
    templateSubject = templateSubject.replace(regex, variables[key]);
  }
  return template;
}

module.exports = { loadCustomTemplate };
