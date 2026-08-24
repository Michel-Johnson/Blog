import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_ZOOM_TEST_BASE || "file:///Users/bytedance/ui";
const post = {
  slug: "assistant-edge-zoom-fixture",
  title: "Edge zoom fixture",
  category: "Tests",
  date: "2026/08/14",
  excerpt: "Keep the Ask AI composer anchored while browser zoom changes.",
  contentFormat: "html",
  markdown: "<article><h2>Viewport test</h2><p>Windows Edge zoom changes the CSS viewport.</p></article>",
  authored: true,
  status: "published"
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 700 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"
  });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${base}/post.html?slug=${post.slug}&qa=edge-zoom`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-assistant-launcher]").click();
  const panel = page.locator("[data-assistant-panel]");
  const form = page.locator("[data-assistant-form]");

  const geometry = async () => page.evaluate(() => {
    const panelNode = document.querySelector("[data-assistant-panel]");
    const formNode = document.querySelector("[data-assistant-form]");
    const panelRect = panelNode.getBoundingClientRect();
    const formRect = formNode.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      docked: panelNode.classList.contains("is-docked-left"),
      panelBottomGap: innerHeight - panelRect.bottom,
      formBottomGap: innerHeight - formRect.bottom,
      formToPanelBottom: panelRect.bottom - formRect.bottom
    };
  });

  await panel.waitFor({ state: "visible" });
  const initial = await geometry();
  await page.setViewportSize({ width: 1050, height: 875 });
  await page.waitForTimeout(250);
  const zoomedFloating = await geometry();
  assert.equal(initial.docked, false);
  assert.equal(zoomedFloating.docked, false);
  assert.ok(Math.abs(initial.panelBottomGap - zoomedFloating.panelBottomGap) <= 2,
    `floating panel lost its bottom anchor: ${initial.panelBottomGap} -> ${zoomedFloating.panelBottomGap}`);
  assert.ok(Math.abs(initial.formToPanelBottom - zoomedFloating.formToPanelBottom) <= 2,
    `composer moved inside the floating panel: ${initial.formToPanelBottom} -> ${zoomedFloating.formToPanelBottom}`);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  const docked = await geometry();
  assert.equal(docked.docked, true);
  assert.ok(Math.abs(docked.panelBottomGap) <= 1,
    `docked assistant did not fill the Edge viewport: bottom gap ${docked.panelBottomGap}`);
  assert.ok(docked.formBottomGap <= 12,
    `docked composer was not anchored near the viewport bottom: gap ${docked.formBottomGap}`);

  await page.screenshot({ path: "/tmp/assistant-edge-zoom-layout.png", fullPage: false });
  console.log(JSON.stringify({ ok: true, initial, zoomedFloating, docked }, null, 2));
} finally {
  await browser.close();
}
