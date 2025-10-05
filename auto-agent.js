#!/usr/bin/env node
/**
 * Cloudflare Automation Agent (CFAA) — Daily Log Rotation + HTTP Error Tracking
 * Watches → git commit/push → CF deploy → logs everything (errors + codes)
 */

import { execSync } from "child_process";
import chokidar from "chokidar";
import fs from "fs";
import axios from "axios";

const PROJECT = "translator-eta"; // CF Pages project
const DEPLOY_DIR = "./public";
const TEST_URL = "https://translator-eta.pages.dev/api/gemini"; // future use

let isDeploying = false;

// 🧾 Dynamic daily log file
function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return `./logs/cfaa-${date}.log`;
}

// 🪵 Write message to log + console
function logToFile(msg) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${msg}\n`;
  const file = getLogFile();
  fs.mkdirSync("./logs", { recursive: true });
  fs.appendFileSync(file, entry, "utf8");
  console.log(msg);
}

// 🧰 Run system commands safely
function run(cmd, label) {
  logToFile(`\n⚙️  ${label}...\n> ${cmd}`);
  try {
    const output = execSync(cmd, { encoding: "utf8" });
    logToFile(output.trim());
    logToFile(`✅ ${label} done.`);
    return true;
  } catch (e) {
    logToFile(`❌ ${label} failed.`);
    if (e.status) logToFile(`Exit Code: ${e.status}`);
    if (e.stdout) logToFile(`STDOUT:\n${e.stdout}`);
    if (e.stderr) logToFile(`STDERR:\n${e.stderr}`);
    return false;
  }
}

// 🌐 Optional: test API once live and log all HTTP errors
async function testApp() {
  logToFile("🧪 Testing production endpoint...");
  try {
    const res = await axios.post(TEST_URL, { text: "Hello", target: "vi" }, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
      validateStatus: () => true,
    });

    const code = res.status;
    if (code >= 200 && code < 300) {
      logToFile(`✅ API test passed (HTTP ${code})`);
    } else if (code >= 400 && code < 600) {
      logToFile(`⚠️  API returned HTTP ${code}: ${JSON.stringify(res.data).slice(0,300)}`);
    }
    return code >= 200 && code < 300;
  } catch (err) {
    const code = err.response?.status || "Unknown";
    logToFile(`❌ API test error (HTTP ${code}): ${err.message}`);
    return false;
  }
}

// 🚀 Main deploy cycle
async function deployCycle(reason = "change detected") {
  if (isDeploying) return;
  isDeploying = true;

  logToFile(`\n🚀 Starting deploy cycle (${reason})`);

  const commitOk = run(`git add . && git commit -m "🤖 Auto update" || echo "no changes"`, "Git Commit");
  const pushOk = commitOk && run(`git push`, "Git Push");
  const deployOk = pushOk && run(`npx wrangler pages deploy ${DEPLOY_DIR} --project-name=${PROJECT}`, "Cloudflare Deploy");

  if (deployOk) {
    logToFile("🎉 Deployment successful.");
    // optional test (enable when API ready)
    // await testApp();
  } else {
    logToFile("⚠️  Deployment failed — check log for details.");
  }

  isDeploying = false;
}

// 👀 Watch for changes
function startWatcher() {
  logToFile("👀 CFAA watching: functions/**/*.js, public/**/*, wrangler.toml");
  chokidar
    .watch(["functions/**/*.js", "public/**/*", "wrangler.toml"], { ignoreInitial: true })
    .on("all", (_event, path) => {
      logToFile(`📂 Change detected: ${path}`);
      deployCycle();
    });
}

// 🟢 Start first deploy + watcher
deployCycle("initial start");
startWatcher();

