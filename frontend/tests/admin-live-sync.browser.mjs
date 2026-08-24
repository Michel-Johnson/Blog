import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dataRoot = await mkdtemp(path.join(os.tmpdir(), "michel-live-sync-"));
const port = 31_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
const password = `live-sync-${process.pid}`;
const server = spawn(process.execPath, ["admin-server.mjs"], {
  cwd: projectRoot,
  env: { ...process.env, BLOG_DATA_ROOT: dataRoot, ADMIN_PORT: String(port), ADMIN_PASSWORD: password, ZHIPU_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLogs = "";
server.stdout.on("data", (chunk) => { serverLogs += chunk; });
server.stderr.on("data", (chunk) => { serverLogs += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/admin.html`)).ok) return;
    } catch (_) {
      // Retry while the listening socket starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`server failed to start\n${serverLogs}`);
}

await waitForServer();
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const editor = await context.newPage();
  await editor.goto(`${baseUrl}/admin.html?new=1`, { waitUntil: "domcontentloaded" });
  await editor.locator("[data-login-form] input[name=password]").fill(password);
  await editor.locator("[data-login-form] button[type=submit]").click();
  await editor.locator("[data-workbench]:not([hidden])").waitFor();
  await editor.locator("[data-post-title]").fill("Live synchronized draft");
  await editor.locator("[data-post-title]").dispatchEvent("input");
  await editor.waitForTimeout(1_800);

  const drafts = await editor.evaluate(async () => fetch("/api/admin/posts?status=draft").then((response) => response.json()));
  assert.equal(drafts.posts.length, 1);
  const slug = drafts.posts[0].slug;

  const mirror = await context.newPage();
  await mirror.goto(`${baseUrl}/admin.html?edit=${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });
  await mirror.locator("[data-workbench]:not([hidden])").waitFor();
  await mirror.locator("[data-lease-takeover]:visible").waitFor();
  assert.equal(await mirror.locator("[data-post-title]").inputValue(), "Live synchronized draft");

  await editor.locator("[data-post-title]").fill("Immediate update from tab A");
  await editor.locator("[data-post-title]").dispatchEvent("input");
  await mirror.locator("[data-post-title]").evaluate((element) => new Promise((resolve, reject) => {
    const deadline = Date.now() + 2_000;
    const check = () => {
      if (element.value === "Immediate update from tab A") return resolve();
      if (Date.now() > deadline) return reject(new Error(`mirror value stayed at ${element.value}`));
      setTimeout(check, 25);
    };
    check();
  }));

  await mirror.locator("[data-lease-takeover]").click();
  await editor.locator("[data-lease-takeover]:visible").waitFor();
  await mirror.locator("[data-post-title]").fill("Tab B took over safely");
  await mirror.locator("[data-post-title]").dispatchEvent("input");
  await editor.locator("[data-post-title]").evaluate((element) => new Promise((resolve, reject) => {
    const deadline = Date.now() + 2_000;
    const check = () => {
      if (element.value === "Tab B took over safely") return resolve();
      if (Date.now() > deadline) return reject(new Error(`old editor value stayed at ${element.value}`));
      setTimeout(check, 25);
    };
    check();
  }));

  console.log("two editor pages synchronize immediately and lease takeover prevents divergent writers");
} finally {
  await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit").catch(() => {});
  await rm(dataRoot, { recursive: true, force: true });
}
