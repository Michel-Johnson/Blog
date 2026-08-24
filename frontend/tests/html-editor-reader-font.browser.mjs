import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.HTML_FONT_TEST_BASE || "http://127.0.0.1:8082";
const post = {
  slug: "html-font-sync",
  originalSlug: "html-font-sync",
  title: "HTML font sync",
  category: "Tests",
  date: "2026/08/12",
  excerpt: "Reader and editor typography must match.",
  contentFormat: "html",
  markdown: "<article class=\"pp-article\"><style>.pp-article{font-size:18px}.pp-article h2{font-size:32px}</style><p>Body copy</p><h2>Section title</h2></article>",
  authored: true,
  status: "published"
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api/admin/session", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ csrfToken: "test-token" })
  }));
  await page.route("**/api/admin/posts/html-font-sync", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ post })
  }));
  await page.route("**/api/admin/posts?status=draft", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ posts: [] })
  }));

  await page.goto(`${base}/admin.html?edit=html-font-sync`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-html-source-editor"));
  assert.equal(await page.locator("[data-editor-details]").count(), 0, "Details button is still present");
  const editorFrame = page.frameLocator("[data-html-visual-editor]");
  await editorFrame.locator(".pp-article").waitFor();
  const editor = await editorFrame.locator("body").evaluate((body) => ({
    article: getComputedStyle(body.querySelector(".pp-article")).fontSize,
    paragraphLineHeight: getComputedStyle(body.querySelector("p")).lineHeight,
    letterSpacing: getComputedStyle(body.querySelector("p")).letterSpacing,
    contentWidth: getComputedStyle(body).width,
    h2: getComputedStyle(body.querySelector("h2")).fontSize
  }));
  await page.screenshot({ path: "/tmp/admin-without-details-button.png", fullPage: true });

  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${base}/post.html?slug=html-font-sync`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-html-post"));
  const reader = await page.evaluate(() => ({
    article: getComputedStyle(document.querySelector(".pp-article")).fontSize,
    paragraphLineHeight: getComputedStyle(document.querySelector(".pp-article p")).lineHeight,
    letterSpacing: getComputedStyle(document.querySelector(".pp-article p")).letterSpacing,
    contentWidth: getComputedStyle(document.querySelector(".post-content")).width,
    h2: getComputedStyle(document.querySelector(".pp-article h2")).fontSize
  }));

  assert.deepEqual(editor, {
    article: "16.8px",
    paragraphLineHeight: "32px",
    letterSpacing: "normal",
    contentWidth: "860px",
    h2: "25.26px"
  });
  assert.deepEqual(reader, editor);

  await page.setViewportSize({ width: 390, height: 844 });
  const compactReader = await page.evaluate(() => ({
    article: getComputedStyle(document.querySelector(".pp-article")).fontSize,
    paragraphLineHeight: getComputedStyle(document.querySelector(".pp-article p")).lineHeight,
    letterSpacing: getComputedStyle(document.querySelector(".pp-article p")).letterSpacing
  }));
  assert.deepEqual(compactReader, {
    article: "16px",
    paragraphLineHeight: "28px",
    letterSpacing: "normal"
  });
  await page.screenshot({ path: "/tmp/html-reference-type-mobile.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, editor, reader, compactReader }, null, 2));
} finally {
  await browser.close();
}
