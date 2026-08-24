import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Usage: verify-html-reply-page.mjs <html> <png>");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(inputPath).href, { waitUntil: "load" });
await page.screenshot({ path: outputPath, fullPage: true });
console.log(JSON.stringify(await page.evaluate(() => ({
  title: document.title,
  width: document.documentElement.scrollWidth,
  height: document.documentElement.scrollHeight,
  brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
  summary: document.querySelector("[data-html-reply-summary]")?.textContent?.trim() || "",
}))));
await browser.close();
