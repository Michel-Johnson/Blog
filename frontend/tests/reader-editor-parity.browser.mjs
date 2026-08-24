import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.READER_EDITOR_TEST_BASE || "http://127.0.0.1:8082";
const post = {
  slug: "reader-editor-parity",
  title: "Reader editor parity",
  category: "Notes",
  date: "2026/08/12",
  excerpt: "Reader and editor should match.",
  contentFormat: "markdown",
  markdown: "第一段用于核对正文的字体、宽度与行距。\n第二段用于核对段落间距。\n第三段用于核对排版宽度。",
  authored: true,
  status: "published"
};

function authoredScript() {
  return `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`;
}

async function metrics(page, selector) {
  const nodes = page.locator(selector);
  const count = await nodes.count();
  let target = nodes.first();
  for (let index = 0; index < count; index += 1) {
    if (await nodes.nth(index).locator("p").count()) {
      target = nodes.nth(index);
      break;
    }
  }
  return target.evaluate((node) => {
    const style = getComputedStyle(node);
    const paragraph = node.querySelector("p") || (node.matches("p") ? node : node.closest("p"));
    const paragraphStyle = paragraph ? getComputedStyle(paragraph) : null;
    return {
      width: Math.round(node.getBoundingClientRect().width * 10) / 10,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      paragraphMarginTop: paragraphStyle?.marginTop || "",
      paragraphMarginBottom: paragraphStyle?.marginBottom || ""
    };
  });
}

const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({ contentType: "text/javascript", body: authoredScript() }));

  await page.goto(`${base}/post.html?slug=${post.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#post-content p");
  assert.equal(await page.locator("#post-content > p").count(), 3, "single-newline prose must render as separate paragraphs");
  const reader = await metrics(page, "#post-content");

  await page.route("**/api/admin/session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ csrfToken: "test" }) }));
  await page.route(`**/api/admin/posts/${post.slug}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ post }) }));
  await page.route("**/api/admin/posts?status=draft", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ posts: [] }) }));
  await page.goto(`${base}/admin.html?edit=${post.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rich-editor .ProseMirror p");
  const editorParagraphCounts = await page.locator(".rich-editor .ProseMirror").evaluateAll((nodes) => nodes.map((node) => node.querySelectorAll("p").length));
  assert.equal(Math.max(...editorParagraphCounts), 3, "editor must show the same paragraph structure");
  const editor = await metrics(page, ".rich-editor .ProseMirror");
  const actions = await page.evaluate(() => ({
    publishHidden: document.querySelector("[data-publish]").hidden,
    publishLabel: document.querySelector("[data-publish]").textContent.trim(),
    unpublishHidden: document.querySelector("[data-unpublish]").hidden,
    legacyNavCount: document.querySelectorAll(".reader-editor-site-nav .nav-links").length,
    actionsInTopNav: document.querySelector(".reader-editor-site-nav [data-publish]") !== null,
    legacyActionBarCount: document.querySelectorAll(".admin-chrome").length
  }));

  for (const key of ["fontFamily", "fontSize", "lineHeight", "letterSpacing", "paragraphMarginTop", "paragraphMarginBottom"]) {
    assert.equal(editor[key], reader[key], `${key} differs between reader and editor`);
  }
  assert.ok(Math.abs(editor.width - reader.width) <= 1, `content widths differ: ${editor.width} vs ${reader.width}`);
  assert.deepEqual(actions, {
    publishHidden: false,
    publishLabel: "Update",
    unpublishHidden: false,
    legacyNavCount: 0,
    actionsInTopNav: true,
    legacyActionBarCount: 0
  });
  await page.screenshot({ path: "/tmp/reader-editor-parity.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, reader, editor, actions }, null, 2));
} finally {
  await browser.close();
}
