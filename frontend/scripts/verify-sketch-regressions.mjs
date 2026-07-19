import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_ROOT || "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightRoot);
const base = process.env.SKETCH_TEST_BASE || "http://127.0.0.1:8812";
const annotationHref = `#michel-note-v1:${Buffer.from(JSON.stringify({
  type: "source",
  title: "Optimization notes",
  body: "A short explanation shown only on demand.",
  label: "Read source",
  url: "https://example.com/source"
})).toString("base64url")}`;

const markdown = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

  段首两个空格，段中  连续空格。
single soft break
next line

**bold** *italic* ~~strike~~ \`inline code\` [link](https://example.com)

[gradient descent](${annotationHref})

> blockquote

- item
  - nested item
- [ ] task
- [x] done

1. first
2. second

| A | B |
| --- | --- |
| 1 | 2 |

---

\`\`\`js
const value = 1;
\`\`\`

$ /alpha + b $

$$
A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}
$$

![image](./assets/placeholder.svg)
`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`${base}/admin.html?b=regression-v58`, { waitUntil: "networkidle" });
await page.locator('input[name="password"]').fill("local-test");
await page.locator("[data-login-form] button[type=submit]").click();
await page.waitForFunction(() => window.MICHEL_WRITER_DEBUG?.version === "article-parity-v58-20260712");
await page.waitForSelector(".toastui-editor-ww-container .ProseMirror", { state: "visible" });
await page.evaluate((value) => {
  window.MICHEL_WRITER_DEBUG.setMarkdown(value);
  document.querySelector("[data-workbench]").classList.add("is-preview-open");
}, markdown);
await page.waitForTimeout(500);

const parity = await page.evaluate(() => {
  const editor = document.querySelector(".toastui-editor-ww-container .ProseMirror");
  const preview = document.querySelector("[data-preview]");
  const selectors = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "pre", "table"];
  const metric = (root, selector) => {
    const node = root.querySelector(selector);
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      fontSize: parseFloat(style.fontSize),
      lineHeight: parseFloat(style.lineHeight),
      marginTop: parseFloat(style.marginTop),
      marginBottom: parseFloat(style.marginBottom)
    };
  };
  const diffs = selectors.map((selector) => ({ selector, editor: metric(editor, selector), preview: metric(preview, selector) }));
  return {
    diffs,
    editorFont: getComputedStyle(editor).fontFamily,
    previewFont: getComputedStyle(preview).fontFamily,
    previewBreaks: preview.querySelectorAll("br").length,
    previewTasks: preview.querySelectorAll("input[type=checkbox]").length,
    previewMath: preview.querySelectorAll(".katex").length,
    preservedIndent: preview.textContent.includes("\u2060\u00a0\u00a0段首")
    ,previewText: preview.textContent.slice(0, 700),
    previewAnnotations: preview.querySelectorAll(".article-annotation").length,
    previewAnnotationTitle: preview.querySelector(".article-annotation strong")?.textContent || ""
  };
});

const failures = [];
for (const row of parity.diffs) {
  if (!row.editor || !row.preview) continue;
  for (const key of ["fontSize", "lineHeight", "marginTop", "marginBottom"]) {
    if (Math.abs(row.editor[key] - row.preview[key]) > 1) failures.push(`${row.selector}.${key}`);
  }
}
if (!parity.editorFont.includes("Michel Noto Serif SC") || !parity.previewFont.includes("Michel Noto Serif SC")) failures.push("font");
if (parity.previewBreaks < 1) failures.push("soft-breaks");
if (parity.previewTasks !== 2) failures.push("task-lists");
if (parity.previewMath < 1) failures.push("math");
if (!parity.preservedIndent) failures.push("indentation");
if (parity.previewAnnotations !== 1 || parity.previewAnnotationTitle !== "Optimization notes") failures.push("preview.annotations");

await page.screenshot({ path: "/tmp/sketch-admin-parity-v58.png", fullPage: true });
const reader = await context.newPage();
await reader.route("**/authored-posts.js*", async (route) => {
  await route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([{ slug: "parity-fixture", title: "Parity fixture", category: "Tests", date: "2026/07/12", excerpt: "fixture", markdown, authored: true, status: "published" }])};`
  });
});
await reader.goto(`${base}/post.html?slug=parity-fixture&b=regression-v58`, { waitUntil: "networkidle" });
await reader.waitForSelector("#post-content h6");
const readerParity = await reader.evaluate(() => {
  const root = document.querySelector("#post-content");
  const selectors = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "pre", "table"];
  const metric = (selector) => {
    const node = root.querySelector(selector);
    const style = getComputedStyle(node);
    return { fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), marginTop: parseFloat(style.marginTop), marginBottom: parseFloat(style.marginBottom) };
  };
  return {
    metrics: Object.fromEntries(selectors.map((selector) => [selector, metric(selector)])),
    font: getComputedStyle(root).fontFamily,
    breaks: root.querySelectorAll("br").length,
    tasks: root.querySelectorAll("input[type=checkbox]").length,
    math: root.querySelectorAll(".katex").length,
    preservedIndent: root.textContent.includes("\u2060\u00a0\u00a0段首"),
    assistant: Boolean(document.querySelector("[data-assistant-launcher]")),
    annotations: root.querySelectorAll(".article-annotation").length
  };
});
for (const row of parity.diffs) {
  if (!row.preview || !readerParity.metrics[row.selector]) continue;
  for (const key of ["fontSize", "lineHeight", "marginTop", "marginBottom"]) {
    if (Math.abs(row.preview[key] - readerParity.metrics[row.selector][key]) > 1) failures.push(`reader.${row.selector}.${key}`);
  }
}
if (!readerParity.font.includes("Michel Noto Serif SC")) failures.push("reader.font");
if (readerParity.tasks !== 2) failures.push("reader.task-lists");
if (!readerParity.preservedIndent) failures.push("reader.indentation");
if (!readerParity.assistant) failures.push("reader.assistant");
if (readerParity.annotations !== 1) failures.push("reader.annotations");
await reader.locator(".article-annotation").focus();
await reader.keyboard.press("Enter");
if (await reader.locator(".article-annotation").getAttribute("aria-expanded") !== "true") failures.push("reader.annotation-keyboard");
await reader.screenshot({ path: "/tmp/sketch-reader-parity-v58.png", fullPage: true });

await reader.setViewportSize({ width: 390, height: 844 });
await reader.keyboard.press("Escape");
await reader.locator(".article-annotation").click();
await reader.waitForTimeout(100);
const mobileAnnotation = await reader.locator(".article-annotation-popover").evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    position: getComputedStyle(node).position
  };
});
if (mobileAnnotation.position !== "fixed") failures.push("reader.annotation-mobile-position");
if (mobileAnnotation.left < 13 || mobileAnnotation.right > mobileAnnotation.viewportWidth - 13) failures.push("reader.annotation-mobile-bounds");
if (mobileAnnotation.bottom > mobileAnnotation.viewportHeight - 17) failures.push("reader.annotation-mobile-bottom");
if (await reader.locator("[data-assistant-launcher]").evaluate((node) => getComputedStyle(node).pointerEvents !== "none")) failures.push("reader.annotation-mobile-assistant-overlap");
await reader.screenshot({ path: "/tmp/sketch-reader-annotation-mobile-v58.png" });

const responsive = [];
for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3440, height: 1440 }]) {
  await reader.setViewportSize(viewport);
  await reader.waitForTimeout(100);
  const result = await reader.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageWidth: document.querySelector(".post-page").getBoundingClientRect().width,
    contentWidth: document.querySelector(".post-content").getBoundingClientRect().width,
    assistantVisible: getComputedStyle(document.querySelector("[data-assistant-launcher]")).display !== "none"
  }));
  responsive.push(result);
  if (result.scrollWidth > result.viewport + 1) failures.push(`overflow-${viewport.width}`);
  if (result.contentWidth > 701) failures.push(`content-width-${viewport.width}`);
  if (viewport.width >= 1700 && result.pageWidth > 1421) failures.push(`stage-width-${viewport.width}`);
}

const publishPage = await context.newPage();
await publishPage.route("**/api/admin/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/api/admin/session") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, csrfToken: "test" }) });
  if (url.pathname === "/api/admin/posts" && request.method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, posts: [] }) });
  if (url.pathname === "/api/admin/posts" && request.method() === "POST") {
    const payload = request.postDataJSON();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, slug: "published-test", status: payload.status, url: "./post.html?slug=published-test" }) });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
});
await publishPage.goto(`${base}/admin.html?b=publish-cleanup-v58`, { waitUntil: "networkidle" });
await publishPage.waitForFunction(() => window.MICHEL_WRITER_DEBUG?.version === "article-parity-v58-20260712");
await publishPage.locator("[data-post-title]").fill("Published test");
await publishPage.evaluate(() => window.MICHEL_WRITER_DEBUG.setMarkdown("Published body"));
await publishPage.locator("[data-publish]").click();
await publishPage.waitForFunction(() => document.querySelector("[data-save-status]")?.textContent.includes("removed from drafts"));
const publishCleanup = await publishPage.evaluate(() => ({
  draftItems: document.querySelectorAll("[data-draft-list] .draft-item:not([aria-disabled=true])").length,
  active: localStorage.getItem("michel-sketch-admin-draft:active"),
  mainDraft: localStorage.getItem("michel-sketch-admin-draft")
}));
if (publishCleanup.draftItems !== 0 || publishCleanup.active || publishCleanup.mainDraft) failures.push("published-draft-cleanup");

console.log(JSON.stringify({ ok: failures.length === 0, failures, parity, readerParity, responsive, publishCleanup }, null, 2));
await browser.close();
if (failures.length) process.exitCode = 1;
