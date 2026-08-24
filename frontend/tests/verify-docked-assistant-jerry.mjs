import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8081";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  localStorage.setItem("michel.readerAssistantDock.v1", "left");
});
await page.goto(`${base}/post.html?slug=machine-learning&theme=sketch`, {
  waitUntil: "domcontentloaded"
});
await page.locator("#post-content").waitFor({ state: "visible" });
await page.waitForFunction(() => document.querySelector("#post-content")?.textContent?.trim().length > 20);
await page.locator("[data-assistant-launcher]").click();
await page.waitForFunction(() => document.body.classList.contains("is-assistant-docked-left"));

await page.evaluate(() => {
  const root = document.querySelector("#post-content");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent.trim().length >= 12
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });
  const node = walker.nextNode();
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, Math.min(18, node.textContent.length));
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
});

await page.waitForFunction(() => (
  document.querySelector("[data-assistant-input]")?.placeholder.includes("selected passage")
));

const result = await page.evaluate(() => {
  const launcher = document.querySelector("[data-assistant-launcher]");
  const panel = document.querySelector("[data-assistant-panel]");
  const send = document.querySelector("[data-assistant-send]");
  const sendRect = send.getBoundingClientRect();
  const sendTarget = document.elementFromPoint(
    sendRect.left + sendRect.width / 2,
    sendRect.top + sendRect.height / 2
  );
  return {
    docked: document.body.classList.contains("is-assistant-docked-left"),
    selectionButtonCount: document.querySelectorAll(".selection-ai-action").length,
    selectionPreview: document.querySelector(".assistant-message.is-selection-preview")?.textContent || "",
    launcherVisible: launcher.getClientRects().length > 0,
    launcherState: launcher.dataset.petState,
    launcherRect: launcher.getBoundingClientRect().toJSON(),
    panelRect: panel.getBoundingClientRect().toJSON(),
    sendReceivesPointer: sendTarget === send || send.contains(sendTarget)
  };
});

await page.screenshot({ path: "/tmp/docked-assistant-jerry.png", fullPage: false });
await browser.close();

if (!result.docked) throw new Error("Assistant did not enter docked-left mode");
if (result.selectionButtonCount !== 0) throw new Error("Docked selection still created an Ask AI button");
if (!result.selectionPreview) throw new Error("Selected passage was not added to the docked conversation");
if (!result.launcherVisible || result.launcherState !== "rest") throw new Error("Jerry is not visible and idle while docked");
if (!result.sendReceivesPointer) throw new Error("Jerry blocks the send control");

console.log(JSON.stringify(result, null, 2));
