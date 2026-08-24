import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.POST_TEST_URL
  || "http://127.0.0.1:8081/post.html?slug=machine-learning&theme=sketch";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseUrl}&legacy-math-test=1`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-legacy-math-repaired="true"] .katex');

  const result = await page.locator('[data-legacy-math-repaired="true"]').evaluate((paragraph) => ({
    visibleText: paragraph.innerText || "",
    formulas: Array.from(paragraph.querySelectorAll('.katex annotation[encoding="application/x-tex"]'))
      .map((node) => node.textContent || ""),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));

  assert.equal(result.formulas.length, 2, "legacy paragraph should contain two rendered formulas");
  assert.match(result.formulas[0], /f_\{\\vec\{w\},b\}/, "linear function formula was not restored");
  assert.match(result.formulas[1], /J\(\\theta\).*\\frac\{1\}\{2m\}/, "cost formula was not restored");
  assert.match(result.formulas[1], /x\^\{\(i\)\}.*y\^\{\(i\)\}/, "legacy superscripts were not restored");
  assert.doesNotMatch(result.visibleText, /\\(?:vec|frac|sum|theta)|\$/, "raw TeX remains visible");
  assert.ok(result.documentWidth <= result.viewportWidth, "rendered formulas caused horizontal overflow");
  console.log("legacy mixed math checks passed");
} finally {
  await browser.close();
}
