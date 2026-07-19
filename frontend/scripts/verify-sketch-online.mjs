import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_ROOT || "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.SKETCH_ONLINE_BASE || "https://micheljohnson.top";
const markdown = "  段首空格，段中  连续空格。\n单换行\n下一行\n\n## 标题\n\n- [x] task\n\n$ /alpha + b $";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route("**/authored-posts.js*", (route) => route.fulfill({
  contentType: "text/javascript",
  body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([{ slug: "online-v58", title: "Online verification", category: "Test", date: "2026/07/12", excerpt: "fixture", markdown, authored: true, status: "published" }])};`
}));
await page.goto(`${base}/post.html?slug=online-v58&b=article-parity-v58-online`, { waitUntil: "networkidle" });
await page.waitForSelector("#post-content h2");
await page.locator("[data-assistant-launcher]").click();
const result = await page.evaluate(async () => ({
  postScript: document.querySelector('script[src*="post.js"]')?.getAttribute("src"),
  assistantScript: document.querySelector('script[src*="assistant.js"]')?.getAttribute("src"),
  font: getComputedStyle(document.querySelector("#post-content")).fontFamily,
  fontReady: await document.fonts.load('19px "Michel Noto Serif SC"').then((items) => items.length > 0),
  breaks: document.querySelectorAll("#post-content br").length,
  math: document.querySelectorAll("#post-content .katex").length,
  tasks: document.querySelectorAll('#post-content input[type="checkbox"]').length,
  indent: document.querySelector("#post-content").textContent.includes("\u2060\u00a0\u00a0段首"),
  assistantOpen: !document.querySelector("[data-assistant-panel]").hidden,
  contentWidth: document.querySelector("#post-content").getBoundingClientRect().width,
  stageWidth: document.querySelector(".post-page").getBoundingClientRect().width,
  overflow: document.documentElement.scrollWidth > innerWidth + 1
}));
await page.screenshot({ path: "/tmp/sketch-online-v58.png", fullPage: true });
const ok = result.postScript?.includes("article-parity-v38")
  && result.assistantScript?.includes("glm52-reader-v1")
  && result.fontReady && result.breaks >= 2 && result.math >= 1 && result.tasks === 1
  && result.indent && result.assistantOpen && result.contentWidth <= 701 && result.stageWidth <= 1421 && !result.overflow;
console.log(JSON.stringify({ ok, result }, null, 2));
await browser.close();
if (!ok) process.exitCode = 1;
