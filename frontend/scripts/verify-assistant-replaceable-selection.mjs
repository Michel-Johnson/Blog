import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8081";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.route("**/api/assistant/chat", (route) => route.fulfill({
  status: 200,
  contentType: "text/event-stream",
  body: 'data: {"status":"generating","content":"Selection received."}\n\n'
}));

await page.goto(`${base}/post.html?slug=machine-learning&theme=sketch`, { waitUntil: "domcontentloaded" });
await page.locator("#post-content p").first().waitFor({ state: "visible" });

async function selectParagraph(index) {
  return page.locator("#post-content p").nth(index).evaluate((paragraph) => {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const node = walker.nextNode();
    if (!node) throw new Error("Paragraph has no selectable text");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(18, node.textContent.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString().trim();
  });
}

const firstText = await selectParagraph(0);
const askAction = page.locator(".selection-ai-action");
await askAction.waitFor({ state: "visible" });
await askAction.click();
await page.waitForFunction(() => document.querySelectorAll(".selection-ai-highlights").length === 1);

const secondText = await selectParagraph(1);
await page.waitForFunction((text) => {
  const quote = document.querySelector("[data-assistant-quote]");
  return document.querySelectorAll(".selection-ai-highlights").length === 1
    && quote?.textContent.includes(text.slice(0, 6));
}, secondText);

await page.locator("main").click({ position: { x: 8, y: 8 } });
await page.waitForFunction(() => document.querySelectorAll(".selection-ai-highlights").length === 0);

const thirdText = await selectParagraph(2);
await page.waitForFunction(() => document.querySelectorAll(".selection-ai-highlights").length === 1);
await page.locator("[data-assistant-input]").fill("Explain this passage");
await page.locator("[data-assistant-form]").evaluate((form) => form.requestSubmit());
await page.waitForFunction(() => document.querySelector("[data-assistant-messages]")?.textContent.includes("Selection received."));
await page.locator("main").click({ position: { x: 8, y: 8 } });

const result = await page.evaluate(() => ({
  clearButtonCount: document.querySelectorAll("[data-assistant-clear-quote]").length,
  persistentHighlightCount: document.querySelectorAll(".selection-ai-highlights").length,
  quote: document.querySelector("[data-assistant-quote]")?.textContent || ""
}));

if (result.clearButtonCount !== 0) throw new Error("Obsolete clear-selection button is still present");
if (result.persistentHighlightCount !== 1) throw new Error("Sent selection did not remain as one persistent anchor");

console.log(JSON.stringify({ firstText, secondText, thirdText, ...result }, null, 2));
await browser.close();
