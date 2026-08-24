import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({
  viewport: { width: 1500, height: 1400 },
  deviceScaleFactor: 1,
});
await page.goto(
  "file:///Users/bytedance/ui/output/reply-019f3163-9539-7e80-97d6-76c49aa23e0b.html",
  { waitUntil: "load" },
);
await page.screenshot({
  path: "/private/tmp/html-reply-handwriting-overlap-v3.png",
  fullPage: true,
});
console.log(await page.evaluate(() => ({
  title: document.title,
  theme: document.body.dataset.htmlReplyTheme,
  width: document.documentElement.scrollWidth,
  height: document.documentElement.scrollHeight,
  brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
})));
await browser.close();
