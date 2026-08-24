import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.ASSISTANT_RESIZE_TEST_URL
  || "http://127.0.0.1:8787/admin.html?resize-test=1";
const frameKey = "michel.readerAssistantFrame.v1";
const browser = await chromium.launch({ headless: true });

function closeTo(actual, expected, tolerance = 2) {
  return Math.abs(actual - expected) <= tolerance;
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({
      left: 360,
      top: 170,
      width: 520,
      height: 520
    }));
  }, frameKey);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  await page.evaluate(() => {
    document.querySelector("[data-workbench]").hidden = false;
    const panel = document.querySelector("[data-assistant-panel]");
    panel.hidden = false;
    panel.style.display = "grid";
  });
  await page.waitForSelector("[data-assistant-panel]:not([hidden])");

  const panel = page.locator("[data-assistant-panel]");
  const handles = page.locator("[data-assistant-resize-handle]");
  assert.equal(await handles.count(), 8, "assistant should expose four edges and four corners");

  const frame = async () => {
    const box = await panel.boundingBox();
    assert.ok(box, "assistant frame should be visible");
    return box;
  };

  const dragHandle = async (edge, dx, dy) => {
    const handle = page.locator(`[data-assistant-resize-handle][data-resize-edge="${edge}"]`);
    const box = await handle.boundingBox();
    assert.ok(box, `${edge} resize handle should be visible`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  };

  const initial = await frame();
  await dragHandle("e", 90, 0);
  const east = await frame();
  assert.ok(closeTo(east.x, initial.x), "east resize should keep the left edge fixed");
  assert.ok(closeTo(east.width, initial.width + 90), "east resize should change width");

  await dragHandle("w", -70, 0);
  const west = await frame();
  assert.ok(closeTo(west.x, east.x - 70), "west resize should move the left edge");
  assert.ok(closeTo(west.x + west.width, east.x + east.width), "west resize should keep the right edge fixed");

  await dragHandle("n", 0, -55);
  const north = await frame();
  assert.ok(closeTo(north.y, west.y - 55), "north resize should move the top edge");
  assert.ok(closeTo(north.y + north.height, west.y + west.height), "north resize should keep the bottom edge fixed");

  await dragHandle("se", 45, 35);
  const corner = await frame();
  assert.ok(closeTo(corner.width, north.width + 45), "corner resize should change width");
  assert.ok(closeTo(corner.height, north.height + 35), "corner resize should change height");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), frameKey);
  assert.ok(closeTo(saved.width, corner.width), "resized width should persist");
  assert.ok(closeTo(saved.height, corner.height), "resized height should persist");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  await page.evaluate(() => {
    document.querySelector("[data-workbench]").hidden = false;
    const panel = document.querySelector("[data-assistant-panel]");
    panel.hidden = false;
    panel.style.display = "grid";
  });
  const restored = await frame();
  assert.ok(closeTo(restored.x, corner.x), "restored frame should keep its horizontal position");
  assert.ok(closeTo(restored.y, corner.y), "restored frame should keep its vertical position");
  assert.ok(closeTo(restored.width, corner.width), "restored frame should keep its width");
  assert.ok(closeTo(restored.height, corner.height), "restored frame should keep its height");

  console.log("assistant eight-direction resize and persistence checks passed");
} finally {
  await browser.close();
}
