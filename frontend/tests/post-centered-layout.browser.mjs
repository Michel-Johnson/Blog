import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.POST_TEST_URL
  || "http://127.0.0.1:8081/post.html?slug=machine-learning&theme=sketch";
const viewports = [
  { width: 1920, height: 1080, sideRail: true },
  { width: 1760, height: 1050, sideRail: true },
  { width: 1680, height: 1050, sideRail: false },
  { width: 1440, height: 1000, sideRail: false },
  { width: 1180, height: 900, sideRail: false },
  { width: 390, height: 844, sideRail: false }
];

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseUrl}&layout-test=${viewport.width}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".post-paper");

    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector).getBoundingClientRect();
        return {
          left: value.left,
          right: value.right,
          top: value.top,
          bottom: value.bottom,
          width: value.width,
          height: value.height,
          center: value.left + value.width / 2
        };
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        paper: rect(".post-paper"),
        content: rect(".post-content"),
        hero: rect(".post-hero"),
        launcher: rect(".reader-assistant-launcher")
      };
    });

    assert.ok(
      Math.abs(geometry.paper.center - geometry.viewportWidth / 2) <= 1,
      `${viewport.width}px paper is not centered`
    );
    assert.ok(
      geometry.documentWidth <= geometry.viewportWidth,
      `${viewport.width}px layout overflows horizontally`
    );
    if (viewport.width >= 1180) {
      assert.ok(
        geometry.paper.width >= 1000,
        `${viewport.width}px paper did not use the wider reading surface`
      );
      assert.ok(
        geometry.content.width >= 800,
        `${viewport.width}px article measure remained too narrow`
      );
    }
    assert.ok(
      geometry.launcher.height <= 80,
      `${viewport.width}px assistant launcher was stretched vertically`
    );

    if (viewport.sideRail) {
      assert.ok(geometry.hero.right < geometry.paper.left, "wide rail overlaps centered paper");
    } else {
      assert.ok(geometry.hero.bottom <= geometry.paper.top, "stacked metadata overlaps paper");
    }
    await page.close();
  }
  console.log("centered post layout checks passed");
} finally {
  await browser.close();
}
