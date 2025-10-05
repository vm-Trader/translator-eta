#!/usr/bin/env node
/**
 * Cloudflare Automation Agent (CFAA)
 * Watches → git commit/push → CF deploy → test → retry if needed.
 */
import { execSync } from "child_process";
import chokidar from "chokidar";
import axios from "axios";

const PROJECT = "translator-eta";   // Cloudflare Pages project name
const DEPLOY_DIR = "./public";
const TEST_URL = "https://translator-eta.pages.dev/api/gemini";
const TEST_BODY = { text: "Hello", target: "vi" };

let isDeploying = false;

function run(cmd, label) {
  console.log(`\n⚙️  ${label}...\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`✅ ${label} done.`);
    return true;
  } catch (e) {
    console.error(`❌ ${label} failed: ${e.message}`);
    return false;
  }
}

async function testApp() {
  console.log("🧪 Testing production endpoint...");
  try {
    const res = await axios.post(TEST_URL, TEST_BODY, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
      validateStatus: () => true,
    });
    console.log(`🔎 Status: ${res.status}`);
    if (res.status >= 200 && res.status < 300) {
      console.log("✅ API test passed.");
      return true;
    } else {
      console.log(`❌ API test failed: ${JSON.stringify(res.data).slice(0,200)}`);
      return false;
    }
  } catch (err) {
    console.error("❌ API test error:", err.message);
    return false;
  }
}

async function deployCycle(reason = "change detected") {
  if (isDeploying) return;
  isDeploying = true;

  console.log(`\n🚀 Starting deploy cycle (${reason})`);

  const commitOk = run(`git add . && git commit -m "🤖 Auto update" || echo "no changes"`, "Git Commit");
  const pushOk = commitOk && run(`git push`, "Git Push");
  const deployOk = pushOk && run(`npx wrangler pages deploy ${DEPLOY_DIR} --project-name=${PROJECT}`, "Cloudflare Deploy");
  const testOk = deployOk && await testApp();

  if (!testOk) {
    console.log("🔁 Test failed — retrying in 30 s...");
    setTimeout(() => deployCycle("retry after failed test"), 30000);
  } else {
    console.log("🎉 Deployment successful.");
  }

  isDeploying = false;
}

function startWatcher() {
  console.log("👀 CFAA watching: functions/**/*.js, public/**/*, wrangler.toml");
  chokidar.watch(["functions/**/*.js", "public/**/*", "wrangler.toml"], {
    ignoreInitial: true,
  }).on("all", (_event, path) => {
    console.log(`📂 Change detected: ${path}`);
    deployCycle();
  });
}

// Run once on start
deployCycle("initial start");
startWatcher();

