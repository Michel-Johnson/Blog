import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_ROOT || "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightRoot);
const base = process.env.SKETCH_TEST_BASE || "http://127.0.0.1:8812";

const markdown = String.raw`# Formula regression

$tmp_w = w - \alpha \frac{\partial}{\partial w} J(w,b)$

$tmp_b = b - \alpha \frac{\partial}{\partial b} J(w,b)$

Inline: \(x_{n+1}=x_n+1\).

\[
A=\begin{bmatrix}a_{11}&a_{12}\\a_{21}&a_{22}\end{bmatrix}
\]
`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

await page.goto(`${base}/admin.html?b=math-block-map-test`, { waitUntil: "domcontentloaded" });
await page.locator('input[name="password"]').fill("local-test");
await page.locator("[data-login-form] button[type=submit]").click();
await page.waitForFunction(() => window.MICHEL_WRITER_DEBUG?.version === "math-block-map-v1-20260811");
await page.waitForSelector(".toastui-editor-ww-container .ProseMirror", { state: "visible" });
await page.evaluate((value) => window.MICHEL_WRITER_DEBUG.setMarkdown(value), markdown);
await page.waitForTimeout(700);

const result = await page.evaluate(() => {
  const editor = document.querySelector(".toastui-editor-ww-container .ProseMirror");
  const overlays = Array.from(document.querySelectorAll(".writer-math-line-overlay, .writer-math-block-overlay"));
  const formulae = Array.from(document.querySelectorAll(".writer-math-line-formula .katex, .writer-math-block-overlay .katex"));
  const raw = editor?.innerText || "";
  return {
    overlays: overlays.length,
    formulae: formulae.length,
    visibleOverlayText: overlays.map((node) => node.textContent.replace(/\s+/g, " ").trim()),
    sourceContainsPartial: raw.includes("\\partial"),
    sourceContainsFrac: raw.includes("\\frac"),
    overlayContainsPartial: overlays.some((node) => node.textContent.includes("\\partial")),
    overlayContainsFrac: overlays.some((node) => node.textContent.includes("\\frac")),
    displayFormulae: document.querySelectorAll(".writer-math-line-formula.is-display, .writer-math-block-overlay").length
    ,texSources: Array.from(document.querySelectorAll("[data-math-tex]"))
      .map((node) => node.dataset.mathTex)
    ,editorText: raw
  };
});

await page.screenshot({ path: "/tmp/editor-math-block-map.png", fullPage: true });
await browser.close();

const ok = result.formulae >= 4
  && result.overlays >= 4
  && !result.overlayContainsPartial
  && !result.overlayContainsFrac
  && result.displayFormulae >= 1
  && result.texSources.some((source) => source.includes("\\begin{bmatrix}") && source.includes("\\\\"));
console.log(JSON.stringify({ ok, ...result, screenshot: "/tmp/editor-math-block-map.png" }, null, 2));
if (!ok) process.exitCode = 1;
