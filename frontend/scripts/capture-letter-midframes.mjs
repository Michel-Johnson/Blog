import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1600 },
  deviceScaleFactor: 1,
});

await page.goto(
  "http://127.0.0.1:8081/handwriting-letter-diagnostics-v7.html?b=overlap-audit-playwright",
  { waitUntil: "domcontentloaded" },
);
await page.selectOption("#speed", ".55");
await page.click("#replay-all");
await page.waitForTimeout(380);

for (const letter of ["f", "t", "k", "y"]) {
  const card = page.locator(".card").filter({
    has: page.locator(".letter", { hasText: letter }),
  });
  await card.screenshot({ path: `/tmp/${letter}-mid-overlap.png` });
}

const heroPage = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
await heroPage.goto(
  "http://127.0.0.1:8081/index-handwriting-mask-v7.html?home=1&theme=sketch&b=overlap-audit-playwright",
  { waitUntil: "domcontentloaded" },
);
await heroPage.locator("#hero-title .hero-write-svg").waitFor({ state: "attached" });

let previousDelay = 0;
for (const delay of [1200, 4500, 8500, 12500, 24500]) {
  await heroPage.waitForTimeout(delay - previousDelay);
  await heroPage.locator("#hero-title").screenshot({
    path: `/tmp/hero-mid-${delay}.png`,
  });
  previousDelay = delay;
}

const heroMetrics = await heroPage.locator("#hero-title").evaluate((title) => {
  const svg = title.querySelector(".hero-write-svg");
  return {
    durationMs: Number(svg?.dataset.durationMs || 0),
    maskStrokes: Number(svg?.dataset.maskStrokes || 0),
    closedGlyphs: Number(svg?.dataset.closedGlyphs || 0),
    titleWidth: title.getBoundingClientRect().width,
    svgWidth: svg?.getBoundingClientRect().width || 0,
  };
});
console.log(JSON.stringify(heroMetrics));

await browser.close();
