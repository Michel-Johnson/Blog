import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_ROOT
  || "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightRoot);
const base = process.env.SKETCH_TEST_BASE || "http://127.0.0.1:8813";
const html = `<article class="pp-article"><style>.pp-article{color:#123}</style><h1>Pipeline</h1><img src="./uploads/demo.png" alt="demo"></article>`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.route("**/api/admin/session", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({ csrfToken: "test" })
}));
await page.route("**/api/admin/draft-events**", (route) => route.fulfill({
  contentType: "text/event-stream",
  body: "event: ready\ndata: {\"ok\":true}\n\n"
}));
await page.route("**/api/admin/draft-leases/**", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({ ok: true, lease: { acquired: true, draftId: "html-draft-id" } })
}));
await page.route("**/api/admin/posts/html-demo", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({
    post: {
      draftId: "html-draft-id",
      slug: "html-demo",
      title: "HTML demo",
      category: "Tests",
      date: "2026-08-11",
      status: "draft",
      contentFormat: "html",
      markdown: html
    }
  })
}));
await page.route("**/api/admin/posts/missing", (route) => route.fulfill({
  status: 500,
  contentType: "application/json",
  body: JSON.stringify({ error: "Requested draft failed to load" })
}));
await page.route("**/api/admin/drafts", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({ drafts: [] })
}));

await page.goto(`${base}/admin.html?edit=html-demo&b=html-draft-regression`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.classList.contains("is-html-source-editor"));
await page.waitForSelector("[data-html-visual-editor]", { state: "visible" });
await page.waitForFunction(() => document.querySelector("[data-html-visual-editor]")?.contentDocument?.body?.querySelector("article.pp-article"));

const state = await page.evaluate(() => ({
  source: document.querySelector("[data-markdown]").value,
  visualVisible: Boolean(document.querySelector("[data-html-visual-editor]").offsetWidth),
  richVisible: Boolean(document.querySelector("[data-rich-editor]").offsetWidth),
  renderedHeading: document.querySelector("[data-html-visual-editor]").contentDocument.querySelector("h1")?.textContent,
  editable: document.querySelector("[data-html-visual-editor]").contentDocument.body.isContentEditable,
  status: document.querySelector("[data-save-status]").textContent
}));

assert.equal(state.source, html, "raw HTML must load losslessly");
assert.equal(state.visualVisible, true, "HTML visual editor must be visible");
assert.equal(state.richVisible, false, "Markdown rich editor must be hidden for HTML posts");
assert.equal(state.renderedHeading, "Pipeline", "HTML must render as elements instead of source text");
assert.equal(state.editable, true, "rendered HTML must be directly editable");
assert.match(state.status, /Editing: html-demo/);
await page.evaluate(() => {
  const body = document.querySelector("[data-html-visual-editor]").contentDocument.body;
  body.querySelector("h1").textContent = "Pipeline edited";
  body.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " edited" }));
});
await page.waitForTimeout(50);
const cachedHtml = await page.evaluate(() => JSON.parse(localStorage.getItem("michel-sketch-admin-draft")));
assert.equal(cachedHtml.contentFormat, "html", "HTML format must survive local save");
assert.match(cachedHtml.markdown, /<h1>Pipeline edited<\/h1>/, "visual edits must sync back to HTML source");
await page.evaluate(() => {
  const iframe = document.querySelector("[data-html-visual-editor]");
  const body = iframe.contentDocument.body;
  for (let index = 0; index < 60; index += 1) {
    const paragraph = iframe.contentDocument.createElement("p");
    paragraph.textContent = `Long HTML paragraph ${index + 1}: the editor must expand with the article instead of creating a nested scrollbar.`;
    body.append(paragraph);
  }
  body.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertParagraph" }));
});
await page.waitForFunction(() => {
  const iframe = document.querySelector("[data-html-visual-editor]");
  const doc = iframe?.contentDocument;
  return iframe && doc && iframe.offsetHeight >= doc.body.scrollHeight - 2;
});
const scrollState = await page.evaluate(() => {
  const iframe = document.querySelector("[data-html-visual-editor]");
  const doc = iframe.contentDocument;
  return {
    iframeHeight: iframe.offsetHeight,
    innerScrollHeight: doc.documentElement.scrollHeight,
    innerClientHeight: doc.documentElement.clientHeight,
    outerScrollHeight: document.documentElement.scrollHeight,
    outerClientHeight: document.documentElement.clientHeight
  };
});
assert.ok(scrollState.iframeHeight > 1500, "long HTML must expand the iframe height");
assert.ok(scrollState.innerScrollHeight <= scrollState.innerClientHeight + 2, "HTML editor must not keep an internal vertical scroll range");
assert.ok(scrollState.outerScrollHeight > scrollState.outerClientHeight, "the outer editing page must own long-article scrolling");
await page.screenshot({ path: "/tmp/admin-html-draft-source.png", fullPage: true });

await page.evaluate(() => {
  const stale = JSON.stringify({
    draftId: "stale-draft",
    title: "Learning Resources",
    slug: "learning-resources",
    contentFormat: "markdown",
    markdown: "stale cached article",
    savedAt: new Date().toISOString()
  });
  localStorage.setItem("michel-sketch-admin-draft", stale);
  localStorage.setItem("michel-sketch-admin-draft:active", "stale-draft");
  localStorage.setItem("michel-sketch-admin-draft:item:stale-draft", stale);
});
await page.goto(`${base}/admin.html?edit=missing&b=html-draft-regression`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("[data-save-status]")?.textContent.includes("Requested draft failed"));
const failedLoad = await page.evaluate(() => ({
  title: document.querySelector("[data-post-title]").value,
  source: document.querySelector("[data-markdown]").value,
  status: document.querySelector("[data-save-status]").textContent
}));
assert.equal(failedLoad.title, "", "failed explicit load must not restore a different cached title");
assert.equal(failedLoad.source, "", "failed explicit load must not restore cached article content");
assert.match(failedLoad.status, /Requested draft failed to load/);

await page.screenshot({ path: "/tmp/admin-html-draft-failed-load.png", fullPage: true });
await browser.close();
console.log(JSON.stringify({ ok: true, htmlLoad: state, scrollState, failedLoad }, null, 2));
