import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.KATEX_LOCAL_TEST_URL || "http://127.0.0.1:8791";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:8791\/).*/, (route) => route.abort());
  await page.goto(`${baseUrl}/post.html?slug=machine-learning&test=katex-local`, {
    waitUntil: "domcontentloaded"
  });
  await page.locator("#post-content .katex").first().waitFor();
  await page.waitForTimeout(350);

  const result = await page.locator("#post-content").evaluate((root) => {
    const blocks = [...root.querySelectorAll("p")];
    const explanation = blocks.find((node) => node.textContent.includes("global minimum"));
    const formula = explanation?.nextElementSibling;
    const mathml = formula?.querySelector(".katex-mathml");
    const mathmlStyle = mathml ? getComputedStyle(mathml) : null;
    return {
      formulaCount: formula?.querySelectorAll(":scope > .katex").length || 0,
      formulaText: formula?.textContent || "",
      mathmlPosition: mathmlStyle?.position || "",
      mathmlClip: mathmlStyle?.clip || "",
      katexReady: typeof window.katex?.render === "function",
      autoRenderReady: typeof window.renderMathInElement === "function",
      remoteKatexAssets: document.querySelectorAll('[href*="cdn.jsdelivr.net/npm/katex"], [src*="cdn.jsdelivr.net/npm/katex"]').length,
      localKatexAssets: document.querySelectorAll('[href*="assets/katex"], [src*="assets/katex"]').length,
      localFontLoads: performance.getEntriesByType("resource").filter((entry) => /\/assets\/katex\/fonts\//.test(entry.name)).length
    };
  });

  assert.equal(result.formulaCount, 2);
  assert.equal(result.mathmlPosition, "absolute");
  assert.match(result.mathmlClip, /rect\(1px/);
  assert.equal(result.katexReady, true);
  assert.equal(result.autoRenderReady, true);
  assert.equal(result.remoteKatexAssets, 0);
  assert.ok(result.localKatexAssets >= 3);
  assert.ok(result.localFontLoads > 0);
  const formulaBlock = page.locator("#post-content p")
    .filter({ hasText: "global minimum" })
    .first()
    .locator("xpath=following-sibling::p[1]");
  await formulaBlock.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/katex-local-regression.png", fullPage: false });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
