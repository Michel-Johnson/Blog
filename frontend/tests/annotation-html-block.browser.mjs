import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.ANNOTATION_HTML_BLOCK_TEST_URL || "http://127.0.0.1:8790";
const payload = Buffer.from(JSON.stringify({
  type: "definition",
  title: "Transformer",
  body: "基于注意力机制的神经网络架构。",
  origin: "glm"
}), "utf8").toString("base64url");
const href = `#michel-note-v1:${payload}`;
const fixtureMarkdown = [
  "上一段。",
  "",
  "<br>",
  `LoRA 使用 [Transformer](${href})、[FFN](${href})、[MLP](${href}) 和 [QKV](${href})。`
].join("\n");
const markdown = process.env.ANNOTATION_MARKDOWN_FILE
  ? await readFile(process.env.ANNOTATION_MARKDOWN_FILE, "utf8")
  : fixtureMarkdown;
const expectedAnnotations = (markdown.match(/#michel-note-v1:/g) || []).length;

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([{
      slug: "annotation-html-block",
      title: "Annotation HTML block",
      category: "Tests",
      date: "2026/08/11",
      excerpt: "fixture",
      markdown,
      authored: true,
      status: "published"
    }])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${baseUrl}/post.html?slug=annotation-html-block&test=1`, { waitUntil: "domcontentloaded" });
  await page.locator(".article-annotation").first().waitFor();
  const result = await page.locator("#post-content").evaluate((root) => ({
    annotations: root.querySelectorAll(".article-annotation").length,
    rawTokens: (root.textContent.match(/#michel-note-v1:/g) || []).length,
    text: root.textContent
  }));
  assert.equal(result.annotations, expectedAnnotations);
  assert.equal(result.rawTokens, 0);
  assert.match(result.text, /Transformer.*FFN.*MLP.*QKV/);
  console.log("standalone br no longer leaks annotation source tokens");
} finally {
  await browser.close();
}
