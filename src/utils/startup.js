const chalk = require("chalk");
const figlet = require("figlet");
const axios = require("axios");
const listEndpoints = require("express-list-endpoints");

async function checkRoutes(app, baseUrl = "http://localhost:3030") {
  const routes = listEndpoints(app);
  console.log(chalk.bold("\n🔍 Checking route status:\n"));

  for (const route of routes) {
    const path = route.path;
    const methods = route.methods.join(", ");
    if (path.includes(":")) {
      console.log(
        ` ${chalk.cyan(methods.padEnd(10))} ${chalk.white(
          path.padEnd(35)
        )} ${chalk.gray("⏭ skipped (dynamic route)")}`
      );
      continue;
    }
    if (path.includes("/auth")) {
      console.log(
        ` ${chalk.cyan(methods.padEnd(10))} ${chalk.white(
          path.padEnd(35)
        )} ${chalk.gray("🔒 auth required")}`
      );
      continue;
    }

    if (!methods.includes("GET")) {
      console.log(
        ` ${chalk.cyan(methods.padEnd(10))} ${chalk.white(
          path.padEnd(35)
        )} ${chalk.gray("⏭ non-GET route")}`
      );
      continue;
    }

    try {
      console.log("Testing route:", baseUrl + path);
      const res = await axios.get(baseUrl + path);
      const status =
        res.status === 200
          ? chalk.green("✅ OK")
          : chalk.yellow(`⚠️ ${res.status}`);
      console.log(
        ` ${chalk.cyan(methods.padEnd(10))} ${chalk.white(
          path.padEnd(30)
        )} ${status}`
      );
    } catch (err) {
      const status = err.response?.status || "ERR";
      console.log(
        ` ${chalk.cyan(methods.padEnd(10))} ${chalk.white(
          path.padEnd(30)
        )} ${chalk.red(`❌ ${status}`)}`
      );

      console.error(
        chalk.redBright(`\n🚨 Error accessing ${methods} ${baseUrl + path}`),
        chalk.yellow(err.message)
      );

      if (err.response?.data) {
        console.error(chalk.gray(`Response data:`), err.response.data);
      } else if (err.request) {
        console.error(chalk.gray(`No response received for:`), baseUrl + path);
      } else {
        console.error(chalk.gray(`Error details:`), err.toString());
      }

      console.log();
    }
  }
}

function printHeader() {
  console.clear();
  console.log(
    chalk.blueBright(
      figlet.textSync("Tech Expo API", { horizontalLayout: "default" })
    )
  );
  console.log(chalk.gray("=".repeat(60)));
}

async function displayStartup(app, dbStatus) {
  printHeader();
  await checkRoutes(app);

  console.log(chalk.gray("\n" + "=".repeat(60)));
  console.log(
    `🗄️  Database Status: ${
      dbStatus ? chalk.green("Connected") : chalk.red("Disconnected")
    }`
  );
  console.log(chalk.gray("=".repeat(60)) + "\n");
}

module.exports = displayStartup;
