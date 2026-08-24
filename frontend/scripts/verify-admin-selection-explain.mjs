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
  const path = new URL(request.url()).pathname;
  if (path === "/api/admin/session") {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, csrfToken: "selection-test" }) });
  }
  if (path === "/api/admin/posts" && request.method() === "GET") {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, posts: [] }) });
  }
  if (path === "/api/admin/explain-selection") {
    const body = request.postDataJSON();
    if (body.selectedText !== "latency_timer") throw new Error(`Unexpected selected text: ${body.selectedText}`);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        explanation: {
          type: "definition",
          title: "Latency timer",
          body: "用于控制串口数据等待与聚合时延的计时参数。",
          label: "Reference",
          url: "https://example.com/latency",
          origin: "glm"
        }
      })
    });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
});

await page.goto(`${base}/admin.html?b=selection-explain-test`, { waitUntil: "domcontentloaded" });
await page.locator("[data-workbench]").waitFor({ state: "visible" });
const editor = page.locator(".toastui-editor-ww-container .ProseMirror");
await editor.waitFor({ state: "visible" });
await editor.fill("USB latency_timer controls buffering behavior.");

async function selectTerm() {
  await editor.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.data.indexOf("latency_timer");
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + "latency_timer".length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error("Term not found in editor");
  });
  await page.locator(".editor-selection-actions").waitFor({ state: "visible" });
}

await selectTerm();
const labels = await page.locator(".editor-selection-actions button").allTextContents();
if (JSON.stringify(labels) !== JSON.stringify(["问 AI", "AI 搜索并简释"])) {
  throw new Error(`Unexpected selection actions: ${JSON.stringify(labels)}`);
}
if (await page.locator(".selection-ai-action").count()) throw new Error("Legacy Ask AI action is still visible in editor mode");

await page.getByRole("button", { name: "AI 搜索并简释" }).click();
await page.locator("[data-annotation-dialog]").waitFor({ state: "visible" });
if (await page.locator('[data-annotation-form] [name="body"]').inputValue() !== "用于控制串口数据等待与聚合时延的计时参数。") {
  throw new Error("Generated explanation did not populate the editor");
}
await page.locator('[data-annotation-form] [name="body"]').fill("控制串口数据等待时延的计时参数，可在此继续编辑。");
await page.getByRole("button", { name: "Apply" }).click();
await page.waitForTimeout(250);
let markdown = await page.locator("[data-markdown]").inputValue();
if (!markdown.includes("#michel-note-v1:") || !markdown.includes("latency_timer")) {
  throw new Error(`Annotation was not saved to Markdown: ${markdown}`);
}

const annotation = editor.locator('a[href*="#michel-note-v1:"]').first();
await annotation.click();
await page.locator("[data-annotation-dialog]").waitFor({ state: "visible" });
if (await page.locator('[data-annotation-form] [name="body"]').inputValue() !== "控制串口数据等待时延的计时参数，可在此继续编辑。") {
  throw new Error("Saved explanation did not reopen for preview/edit");
}
await page.locator('[data-annotation-form] [name="title"]').fill("串口延时参数");
await page.getByRole("button", { name: "Apply" }).click();
await page.waitForTimeout(200);
markdown = await page.locator("[data-markdown]").inputValue();
if (!markdown.includes("latency_timer")) throw new Error("Edited annotation disappeared");

await editor.locator('a[href*="#michel-note-v1:"]').first().click();
await page.getByRole("button", { name: "Remove" }).click();
await page.waitForTimeout(200);
markdown = await page.locator("[data-markdown]").inputValue();
if (markdown.includes("#michel-note-v1:")) throw new Error(`Annotation was not removed: ${markdown}`);
if (!/latency\\?_timer/.test(markdown)) throw new Error(`Removing explanation also removed selected text: ${JSON.stringify(markdown)}`);

await selectTerm();
await page.getByRole("button", { name: "问 AI" }).click();
await page.locator("[data-assistant-panel]").waitFor({ state: "visible" });
const selectedPreview = await page.locator("[data-assistant-messages]").innerText();
if (!selectedPreview.includes("latency_timer")) throw new Error("Ask AI did not receive the selected text");

await page.screenshot({ path: "/tmp/admin-selection-explain.png", fullPage: false });
console.log(JSON.stringify({ actions: labels, saved: true, edited: true, removed: true, askAi: true }));
await browser.close();
