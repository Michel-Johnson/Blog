import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.SPINE_TEST_BASE || "http://127.0.0.1:8082";
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/index.html?home=1&theme=sketch&spine-fit=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  if (!await page.locator(".modeled-cabinet-stage canvas").count()) {
    throw new Error(`3D shelf did not mount: ${JSON.stringify({
      errors: errors.slice(0, 8),
      theme: await page.locator("html").getAttribute("data-site-theme"),
      listCount: await page.locator("#all-posts-list").count(),
      sectionCount: await page.locator(".modeled-cabinet-section").count()
    })}`);
  }
  await page.waitForFunction(() => document.querySelector(".modeled-cabinet-stage")?.dataset.latinSpineComplete);
  const stage = await page.locator(".modeled-cabinet-stage").evaluate((node) => ({
    latinComplete: node.dataset.latinSpineComplete,
    maxLines: node.dataset.latinSpineMaxLines,
    canvasWidth: node.querySelector("canvas")?.width || 0,
    canvasHeight: node.querySelector("canvas")?.height || 0
  }));
  assert.equal(stage.latinComplete, "true", "Latin spine titles were truncated");
  assert.ok(Number(stage.maxLines) <= 3, "Latin spine titles exceeded three bands");
  assert.ok(stage.canvasWidth > 0 && stage.canvasHeight > 0, "3D shelf did not render");
  await page.locator(".modeled-cabinet-section").screenshot({ path: "/tmp/spine-fit-cabinet.png" });
  console.log(JSON.stringify({ ok: true, stage }, null, 2));
} finally {
  await browser.close();
}
