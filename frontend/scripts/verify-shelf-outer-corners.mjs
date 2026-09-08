import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

const baseUrl = process.env.SHELF_VERIFY_BASE || "http://127.0.0.1:8081";
const outputPrefix = process.env.SHELF_VERIFY_OUTPUT || "/tmp/shelf-corner";

for (const target of [
  { name: "desktop", viewport: { width: 1440, height: 1200 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
]) {
  const page = await browser.newPage({ viewport: target.viewport, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/index.html?home=1&theme=sketch&b=flush-frame-corners-v34-20260804#all-posts`, {
    waitUntil: "networkidle",
  });
  await page.locator("#all-posts-list[data-layout-version='modeled-cabinet-v23-no-legacy-flash']").waitFor();
  await page.locator("#all-posts-list canvas").first().waitFor({ state: "visible" });
  await page.locator("#all-posts-list").screenshot({ path: `${outputPrefix}-${target.name}.png` });
  await page.close();
}

await browser.close();
