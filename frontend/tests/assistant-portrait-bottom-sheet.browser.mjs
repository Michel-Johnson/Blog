import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_PORTRAIT_TEST_BASE || "file:///Users/bytedance/ui";
const post = {
  slug: "assistant-portrait-fixture",
  title: "Portrait assistant fixture",
  category: "Tests",
  date: "2026/08/14",
  excerpt: "The portrait assistant stays inside the viewport.",
  contentFormat: "html",
  markdown: "<article><h2>Portrait test</h2><p>Bottom sheet geometry.</p></article>",
  authored: true,
  status: "published"
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${base}/post.html?slug=${post.slug}&qa=portrait-assistant`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-assistant-launcher]").click();
  await page.locator("[data-assistant-panel]").waitFor({ state: "visible" });

  const geometry = await page.evaluate(() => {
    const panel = document.querySelector("[data-assistant-panel]");
    const rect = panel.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      transform: getComputedStyle(panel).transform,
      documentWidth: document.documentElement.scrollWidth
    };
  });

  assert.equal(geometry.left, 0, `portrait sheet starts at x=${geometry.left}`);
  assert.equal(geometry.right, geometry.viewport.width, "portrait sheet does not span the viewport");
  assert.equal(geometry.bottom, geometry.viewport.height, "portrait sheet is not anchored to the bottom");
  assert.equal(geometry.transform, "none", `portrait sheet retained transform ${geometry.transform}`);
  assert.ok(geometry.top >= 0, `portrait sheet starts above the viewport at y=${geometry.top}`);
  assert.ok(geometry.documentWidth <= geometry.viewport.width, "portrait assistant causes horizontal overflow");

  await page.screenshot({ path: "/tmp/assistant-portrait-bottom-sheet.png", fullPage: false });
  console.log(JSON.stringify({ ok: true, geometry }, null, 2));
} finally {
  await browser.close();
}
