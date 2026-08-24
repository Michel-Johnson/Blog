import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_LAYOUT_TEST_BASE || "http://127.0.0.1:8787";
const post = {
  slug: "assistant-layout-stability",
  title: "Assistant layout stability",
  category: "Notes",
  date: "2026/08/13",
  excerpt: "Opening Ask AI must not move the article.",
  contentFormat: "markdown",
  markdown: "## 一次训练怎样穿过多个 Stage\n\n第一段用于选中文字并打开助手。\n\n![Diagram](./assets/jerry-pet/idle/00.png)",
  authored: true,
  status: "published"
};

function authoredScript() {
  return `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`;
}

function roundedBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10) / 10]));
}

const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => {
    localStorage.setItem("michel.readerAssistantDock.v1", "left");
    localStorage.setItem("michel.readerAssistantFrame.v1", JSON.stringify({ left: 16, top: 80, width: 840, height: 900 }));
  });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({ contentType: "text/javascript", body: authoredScript() }));
  await page.goto(`${base}/post.html?slug=${post.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#post-content h2");
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);

  const before = await page.locator(".post-paper").boundingBox();
  const contentBefore = await page.locator("#post-content").boundingBox();
  await page.locator("[data-assistant-launcher]").click();
  await page.waitForSelector("[data-assistant-panel]:not([hidden])");
  const after = await page.locator(".post-paper").boundingBox();
  const contentAfter = await page.locator("#post-content").boundingBox();
  const state = await page.evaluate(() => ({
    dockClass: document.body.classList.contains("is-assistant-docked-left"),
    persistedDock: localStorage.getItem("michel.readerAssistantDock.v1"),
    persistedFrame: localStorage.getItem("michel.readerAssistantFrame.v1"),
    bodyPaddingLeft: getComputedStyle(document.body).paddingLeft,
    panelPosition: getComputedStyle(document.querySelector("[data-assistant-panel]")).position,
    panelLeft: document.querySelector("[data-assistant-panel]").getBoundingClientRect().left
  }));

  assert.deepEqual(roundedBox(after), roundedBox(before), "opening Ask AI moved the paper");
  assert.deepEqual(roundedBox(contentAfter), roundedBox(contentBefore), "opening Ask AI moved the article content");
  assert.equal(state.dockClass, false);
  assert.equal(state.persistedDock, null);
  assert.equal(state.persistedFrame, null);
  assert.equal(state.bodyPaddingLeft, "0px");
  assert.equal(state.panelPosition, "fixed");
  assert.ok(state.panelLeft > 800, `stale left-side frame was restored at x=${state.panelLeft}`);
  console.log(JSON.stringify({ ok: true, before: roundedBox(before), after: roundedBox(after), state }, null, 2));
} finally {
  await browser.close();
}
