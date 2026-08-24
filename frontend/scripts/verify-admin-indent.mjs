import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.route("**/api/admin/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/api/admin/session") {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, csrfToken: "indent-test" }) });
  }
  if (url.pathname === "/api/admin/posts" && request.method() === "GET") {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, posts: [] }) });
  }
  if (url.pathname === "/api/admin/posts" && request.method() === "POST") {
    const body = request.postDataJSON();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, slug: body.slug || "indent-test", markdown: body.markdown, excerpt: body.excerpt || "" })
    });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
});

await page.goto(`${base}/admin.html?b=indent-persistence-v6-20260810`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("[data-workbench]").waitFor({ state: "visible" });
await page.locator("[data-post-title]").fill("Indent persistence test");

const editor = page.locator(".toastui-editor-ww-container .ProseMirror");
await editor.waitFor({ state: "visible" });
await editor.click();
await page.keyboard.type("    段首缩进会被保存。", { delay: 20 });
await page.waitForTimeout(1800);

const beforeReload = await page.locator("[data-markdown]").inputValue();
if (!beforeReload.startsWith("&#8288;&nbsp;&nbsp;&nbsp;&nbsp;段首缩进")) {
  throw new Error(`Indent was not encoded before save: ${JSON.stringify(beforeReload)}`);
}

await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("[data-workbench]").waitFor({ state: "visible" });
await editor.waitFor({ state: "visible" });
const restored = await editor.locator("p").first().evaluate((node) => ({
  text: node.textContent,
  codePoints: Array.from(node.textContent.slice(0, 8), (character) => character.codePointAt(0)),
  left: node.getBoundingClientRect().left,
  textLeft: (() => {
    const range = document.createRange();
    const firstContentOffset = Array.from(node.firstChild.data).findIndex((character) => !/[\u2060\u00a0 ]/.test(character));
    range.setStart(node.firstChild, Math.max(0, firstContentOffset));
    range.setEnd(node.firstChild, Math.min(node.firstChild.length, Math.max(0, firstContentOffset) + 1));
    return range.getBoundingClientRect().left;
  })()
}));

if (!restored.text.includes("段首缩进会被保存。")) throw new Error(`Restored paragraph is missing: ${JSON.stringify(restored)}`);
if (restored.textLeft <= restored.left + 20) throw new Error(`Restored indent is not visible: ${JSON.stringify(restored)}`);

await page.screenshot({ path: "/tmp/admin-indent-persistence.png", fullPage: false });
console.log(JSON.stringify({ beforeReload, restored }, null, 2));
await browser.close();
