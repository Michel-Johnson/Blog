import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_DOCK_TEST_BASE || "https://micheljohnson.top";
const post = {
  slug: "assistant-html-dock-fixture",
  title: "HTML dock resize fixture",
  category: "Tests",
  date: "2026/08/13",
  excerpt: "Verify that the left Ask AI split remains adjustable.",
  contentFormat: "html",
  markdown: `<article class="pp-article"><style>
    .pp-article{font-size:14.5px;line-height:1.75}
    .pp-article h2{font-size:25px}
  </style><h2>Adjustable reading split</h2><p>The HTML article must move with the divider without being covered.</p></article>`,
  authored: true,
  status: "published"
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${base}/post.html?slug=${post.slug}&qa=assistant-dock-resize`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-html-post"));
  await page.locator("[data-assistant-launcher]").click();
  await page.waitForFunction(() => document.body.classList.contains("is-assistant-docked-left"));

  const panel = page.locator("[data-assistant-panel]");
  const handle = page.locator('[data-assistant-resize-handle][data-resize-edge="e"]');
  const initialPanel = await panel.boundingBox();
  const initialArticle = await page.locator(".post-page").boundingBox();
  assert.ok(initialPanel && initialArticle);
  assert.equal(Math.round(initialPanel.x), 0);
  assert.equal(await handle.evaluate((node) => getComputedStyle(node).display), "block");
  await page.screenshot({ path: "/tmp/assistant-html-dock-before.png" });

  const handleBox = await handle.boundingBox();
  assert.ok(handleBox);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 120, handleBox.y + handleBox.height / 2, { steps: 8 });
  await page.mouse.up();

  const adjustedPanel = await panel.boundingBox();
  const adjustedArticle = await page.locator(".post-page").boundingBox();
  assert.ok(adjustedPanel && adjustedArticle);
  assert.ok(adjustedPanel.width >= initialPanel.width + 110, "divider drag did not widen Ask AI");
  assert.ok(adjustedArticle.x >= initialArticle.x + 110, "article did not follow the adjusted divider");
  const storedRatio = await page.evaluate(() => Number(localStorage.getItem("michel.readerAssistantDockRatio.v1")));
  assert.ok(storedRatio > .4, "adjusted split ratio was not persisted");
  await page.screenshot({ path: "/tmp/assistant-html-dock-after.png" });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-html-post"));
  await page.locator("[data-assistant-launcher]").click();
  await page.waitForFunction(() => document.body.classList.contains("is-assistant-docked-left"));
  const restoredPanel = await page.locator("[data-assistant-panel]").boundingBox();
  assert.ok(restoredPanel);
  assert.ok(Math.abs(restoredPanel.width - adjustedPanel.width) <= 2, "saved divider ratio was not restored");

  console.log(JSON.stringify({
    ok: true,
    initialPanelWidth: Math.round(initialPanel.width),
    adjustedPanelWidth: Math.round(adjustedPanel.width),
    initialArticleLeft: Math.round(initialArticle.x),
    adjustedArticleLeft: Math.round(adjustedArticle.x),
    storedRatio,
    restoredPanelWidth: Math.round(restoredPanel.width)
  }, null, 2));
} finally {
  await browser.close();
}
