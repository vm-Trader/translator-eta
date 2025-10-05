#!/usr/bin/env node
/**
 * Cloudflare Automation Agent (CFAA)
 * Watches → git commit/push → CF deploy → optional test → idle.
 */
import { execSync } from "child_process";
import chokidar from "chokidar";

const PROJECT = "translator-eta";   // Cloudflare Pages project name
const DEPLOY_DIR = "./public";

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

async function deployCycle(reason = "change detected") {
  if (isDeploying) return;
  isDeploying = true;

  console.log(`\n🚀 Starting deploy cycle (${reason})`);

  const commitOk = run(
    `git add . && git commit -m "🤖 Auto update" || echo "no changes"`,
    "Git Commit"
  );
  const pushOk =
    commitOk && run(`git push`, "Git Push");
  const deployOk =
    pushOk &&
    run(
      `npx wrangler pages deploy ${DEPLOY_DIR} --project-name=${PROJECT}`,
      "Cloudflare Deploy"
    );

  if (deployOk) {
    console.log("🎉 Deployment successful (skipping API test for now).");
  }

  isDeploying = false;
}

function startWatcher() {
  console.log("👀 CFAA watching: functions/**/*.js, public/**/*, wrangler.toml");
  chokidar
    .watch(["functions/**/*.js", "public/**/*", "wrangler.toml"], {
      ignoreInitial: true,
    })
    .on("all", (_event, path) => {
      console.log(`📂 Change detected: ${path}`);
      deployCycle();
    });
}

// Run one deploy at start then watch for future changes
deployCycle("initial start");
startWatcher();

