import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.MATH_VERIFY_BASE || "http://127.0.0.1:8081";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Users/bytedance/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
const slug = process.env.MATH_VERIFY_SLUG || "machine-learning";
const url = `${base}/post.html?slug=${encodeURIComponent(slug)}&theme=sketch&b=machine-learning-math-v67-20260811`;

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#post-content .katex");

const result = await page.evaluate(() => {
  const formulas = Array.from(document.querySelectorAll("#post-content span.katex"))
    .filter((node) => !node.parentElement?.closest("span.katex"))
    .map((node) => ({
      source: node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || "",
      width: Math.round(node.getBoundingClientRect().width),
      text: node.textContent?.replace(/\s+/g, " ").trim() || ""
    }));
  const malformed = formulas.filter(({ source }) => (
    /[xy]\{\(i\)\}|the\s*cost\s*function|…/.test(source)
  ));
  const assignment = formulas.find(({ source }) => /w\s*=\s*(?:\\mathrm\{tmp\}|tmp)_w/.test(source));
  const firstMalformed = Array.from(document.querySelectorAll("#post-content span.katex"))
    .filter((node) => !node.parentElement?.closest("span.katex"))
    .find((node) => /[xy]\{\(i\)\}|the\s*cost\s*function|…/.test(
      node.querySelector('annotation[encoding="application/x-tex"]')?.textContent || ""
    ));
  return {
    title: document.title,
    runtime: {
      katex: typeof window.katex,
      autoRender: typeof window.renderMathInElement
    },
    count: formulas.length,
    errors: document.querySelectorAll("#post-content .katex-error").length,
    malformed,
    assignment,
    firstMalformedDom: firstMalformed ? {
      outer: firstMalformed.outerHTML.slice(0, 1800),
      parent: firstMalformed.parentElement?.outerHTML.slice(0, 2200) || "",
      container: document.querySelector("#post-content")?.dataset || {}
    } : null,
    emptySources: formulas.filter(({ source }) => !source).length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1
  };
});

await page.screenshot({ path: "/tmp/machine-learning-math.png", fullPage: true });
const ok = result.count >= 36
  && result.errors === 0
  && result.malformed.length === 0
  && result.emptySources === 0
  && Boolean(result.assignment)
  && /\\mathrm\{tmp\}_w/.test(result.assignment.source)
  && !result.overflow;

const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobileErrors = [];
mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
await mobilePage.goto(url, { waitUntil: "networkidle" });
await mobilePage.waitForSelector("#post-content .katex");
const mobile = await mobilePage.evaluate(() => ({
  count: document.querySelectorAll("#post-content span.katex").length,
  errors: document.querySelectorAll("#post-content .katex-error").length,
  overflow: document.documentElement.scrollWidth > innerWidth + 1
}));
await mobilePage.screenshot({ path: "/tmp/machine-learning-math-mobile.png", fullPage: true });

const fullyOk = ok
  && pageErrors.length === 0
  && consoleErrors.length === 0
  && mobileErrors.length === 0
  && mobile.count >= 36
  && mobile.errors === 0
  && !mobile.overflow;

console.log(JSON.stringify({ ok: fullyOk, url, pageErrors, consoleErrors, result, mobileErrors, mobile }, null, 2));
await browser.close();
if (!fullyOk) process.exitCode = 1;
