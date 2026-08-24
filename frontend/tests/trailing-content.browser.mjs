import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.TRAILING_CONTENT_TEST_BASE || "http://127.0.0.1:8082";
const post = {
  slug: "trailing-empty-fixture",
  title: "Trailing empty fixture",
  category: "Tests",
  date: "2026/08/12",
  excerpt: "Tail cleanup fixture.",
  contentFormat: "markdown",
  markdown: "正文最后一段。\n\n<br>\n<br>\n<br>\n",
  authored: true,
  status: "published"
};

const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${base}/post.html?slug=${post.slug}`, { waitUntil: "domcontentloaded" });
  const reader = await page.evaluate(() => {
    const root = document.querySelector("#post-content");
    return { children: root.children.length, brs: root.querySelectorAll("br").length, text: root.textContent.trim() };
  });
  assert.deepEqual(reader, { children: 1, brs: 0, text: "正文最后一段。" });

  await page.route("**/api/admin/session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ csrfToken: "test" }) }));
  await page.route(`**/api/admin/posts/${post.slug}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ post }) }));
  await page.route("**/api/admin/posts?status=draft", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ posts: [] }) }));
  await page.goto(`${base}/admin.html?edit=${post.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("[data-markdown]")?.value === "正文最后一段。");
  const editor = await page.evaluate(() => {
    const root = document.querySelector(".rich-editor .ProseMirror");
    const status = document.querySelector("[data-save-status]");
    return {
      source: document.querySelector("[data-markdown]").value,
      minHeight: getComputedStyle(root).minHeight,
      paddingBottom: getComputedStyle(root).paddingBottom,
      statusVisible: getComputedStyle(status).display !== "none"
    };
  });
  assert.equal(editor.source, "正文最后一段。");
  assert.equal(editor.minHeight, "165px");
  assert.equal(editor.paddingBottom, "48px");

  await page.goto(`${base}/admin.html?drafts=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-draft-inbox]:not([hidden])");
  const inbox = await page.evaluate(() => ({
    statusDisplay: getComputedStyle(document.querySelector("[data-save-status]")).display,
    promptPresent: document.body.textContent.includes("Choose a draft or create a new article")
  }));
  assert.equal(inbox.statusDisplay, "none");
  assert.equal(inbox.promptPresent, false);
  console.log(JSON.stringify({ ok: true, reader, editor, inbox }, null, 2));
} finally {
  await browser.close();
}
