import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.ASSISTANT_IME_TEST_URL
  || "http://127.0.0.1:8081/admin.html?ime-enter-test=1";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("[data-assistant-launcher]").evaluate((node) => node.click());
  await page.waitForSelector("[data-assistant-input]", { state: "attached" });
  await page.evaluate(() => {
    window.__assistantSubmitCount = 0;
    document.querySelector("[data-assistant-form]").requestSubmit = () => {
      window.__assistantSubmitCount += 1;
    };
  });

  const input = page.locator("[data-assistant-input]");
  await input.focus();

  await input.evaluate((node) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "密" }));
    node.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true
    }));
  });
  assert.equal(await page.evaluate(() => window.__assistantSubmitCount), 0,
    "Enter during composition must only confirm the IME candidate");

  await input.evaluate((node) => {
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "密集" }));
    node.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    }));
  });
  assert.equal(await page.evaluate(() => window.__assistantSubmitCount), 0,
    "the trailing Enter immediately after compositionend must not submit");

  await page.waitForTimeout(180);
  await input.evaluate((node) => {
    node.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
  });
  assert.equal(await page.evaluate(() => window.__assistantSubmitCount), 0,
    "Shift+Enter must remain available for a newline");

  await input.evaluate((node) => {
    node.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    }));
  });
  assert.equal(await page.evaluate(() => window.__assistantSubmitCount), 1,
    "ordinary Enter outside IME composition must submit exactly once");

  console.log("assistant IME Enter guard checks passed");
} finally {
  await browser.close();
}
