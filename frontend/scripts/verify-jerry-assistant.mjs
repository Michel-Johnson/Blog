import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8081";
const cases = [
  { name: "reader-desktop", path: "/post.html?slug=machine-learning&theme=sketch", viewport: { width: 1440, height: 900 } },
  { name: "reader-mobile", path: "/post.html?slug=machine-learning&theme=sketch", viewport: { width: 390, height: 844 } },
  { name: "writer-desktop", path: "/admin.html", viewport: { width: 1440, height: 900 } }
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const results = [];

for (const item of cases) {
  const page = await browser.newPage({ viewport: item.viewport });
  if (item.name.startsWith("writer")) {
    await page.route("**/api/admin/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/admin/session") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, csrfToken: "jerry-test" })
        });
      }
      if (url.pathname === "/api/admin/posts" && request.method() === "GET") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, posts: [] })
        });
      }
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not found" })
      });
    });
  }
  await page.route("**/api/assistant/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 420));
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"status":"generating","content":"Jerry is working."}\n\n'
    });
  });
  await page.goto(`${base}${item.path}`, { waitUntil: "domcontentloaded" });
  const launcher = page.locator("[data-assistant-launcher]");
  await launcher.waitFor({ state: "visible" });
  const initial = await launcher.evaluate((node) => ({
    state: node.dataset.petState,
    source: node.querySelector("img")?.getAttribute("src"),
    rect: node.getBoundingClientRect().toJSON()
  }));
  await launcher.click();
  const panel = page.locator("[data-assistant-panel]");
  await panel.waitFor({ state: "visible" });
  const remainsVisible = await launcher.isVisible();
  await page.locator("[data-assistant-input]").fill("What is this article about?");
  await page.locator("[data-assistant-form]").evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector("[data-assistant-launcher]")?.dataset.petState === "work");
  const working = await launcher.evaluate((node) => ({
    state: node.dataset.petState,
    source: node.querySelector("img")?.getAttribute("src")
  }));
  await page.waitForFunction(() => document.querySelector("[data-assistant-launcher]")?.dataset.petState === "rest", null, { timeout: 3000 });
  const finished = await launcher.evaluate((node) => ({
    state: node.dataset.petState,
    source: node.querySelector("img")?.getAttribute("src")
  }));
  await page.screenshot({ path: `/tmp/${item.name}-jerry.png`, fullPage: false });
  results.push({ name: item.name, initial, remainsVisible, working, finished });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
