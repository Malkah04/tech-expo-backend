const fs = require("fs");
const path = require("path");

function loadTemplate(templateName, variables) {
  const filePath = path.join(__dirname, "..", "emails", templateName);
  let template = fs.readFileSync(filePath, "utf8");

  for (const key in variables) {
    const regex = new RegExp(`{{${key}}}`, "g");
    template = template.replace(regex, variables[key]);
  }

  return template;
}

module.exports = { loadTemplate };
