import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.HTML_WIDTH_TEST_BASE || "http://127.0.0.1:8814";
const posts = [{
  slug: "html-width-fixture",
  title: "HTML width fixture",
  category: "Tests",
  date: "2026/08/12",
  excerpt: "A wide HTML reading fixture.",
  contentFormat: "html",
  markdown: "<article class=\"pp-article\"><style>.pp-article{font-size:18px;line-height:1.75}.pp-article h2{font-size:32px}.pp-article .lead{font-size:20px}</style><p class=\"lead\">A deliberately oversized HTML introduction.</p><h2>Comfortable reading</h2><p>HTML articles should support a wider reader-selected measure without affecting Markdown posts.</p></article>",
  authored: true,
  status: "published"
}, {
  slug: "markdown-width-fixture",
  title: "Markdown width fixture",
  category: "Tests",
  date: "2026/08/12",
  excerpt: "Markdown remains unchanged.",
  contentFormat: "markdown",
  markdown: "## Markdown\n\nThis article keeps the normal reading measure.",
  authored: true,
  status: "published"
}];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify(posts)};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.goto(`${base}/post.html?slug=html-width-fixture&test=html-width`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-html-post"));

  const initial = await page.evaluate(() => ({
    contentWidth: document.querySelector("#post-content").getBoundingClientRect().width,
    controlDisplay: getComputedStyle(document.querySelector("[data-html-reading-width-handle]")).display,
    ariaValue: document.querySelector("[data-html-reading-width-handle]").getAttribute("aria-valuenow")
  }));
  assert.equal(initial.controlDisplay, "flex");
  assert.equal(initial.ariaValue, "960");
  assert.ok(initial.contentWidth >= 950, "HTML article did not receive the wider default measure");
  const typography = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector(".post-hero h1")).fontSize,
    article: getComputedStyle(document.querySelector(".pp-article")).fontSize,
    lead: getComputedStyle(document.querySelector(".pp-article .lead")).fontSize,
    h2: getComputedStyle(document.querySelector(".pp-article h2")).fontSize
  }));
  assert.equal(typography.article, "14.5px", "embedded HTML font size escaped the reader scale");
  assert.ok(parseFloat(typography.lead) < 16, "embedded HTML lead remained oversized");
  assert.equal(typography.h2, "25.26px", "embedded HTML heading remained oversized");
  assert.equal(await page.locator("[data-html-reading-font-control]").count(), 0,
    "removed HTML font control is still present");
  const topPlacement = await page.evaluate(() => {
    const handle = document.querySelector("[data-html-reading-width-handle]").getBoundingClientRect();
    const hero = document.querySelector(".post-hero").getBoundingClientRect();
    const paper = document.querySelector(".post-paper").getBoundingClientRect();
    return { handleTop: handle.top, heroTop: hero.top, heroBottom: hero.bottom, paperTop: paper.top };
  });
  assert.ok(topPlacement.handleTop >= topPlacement.heroTop && topPlacement.handleTop < topPlacement.heroBottom,
    "HTML width control is not in the top article header");
  assert.ok(topPlacement.handleTop < topPlacement.paperTop, "HTML width control remained beside the article body");

  const handle = page.locator("[data-html-reading-width-handle]");
  await handle.hover();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const widened = await page.evaluate(() => ({
    contentWidth: document.querySelector("#post-content").getBoundingClientRect().width,
    stored: localStorage.getItem("michel-html-reading-width-v1"),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  }));
  assert.ok(widened.contentWidth > initial.contentWidth + 120, "dragging did not widen the HTML article");
  assert.equal(widened.stored, "1120");
  assert.ok(widened.documentWidth <= widened.viewportWidth, "desktop width control caused horizontal overflow");
  await handle.hover();
  await page.screenshot({ path: "/tmp/html-reading-width-wide.png", fullPage: true });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-html-post"));
  const restored = await page.locator("[data-html-reading-width-handle]").getAttribute("aria-valuenow");
  assert.equal(restored, "1120", "saved HTML width was not restored after reload");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator("[data-html-reading-width-handle]").focus();
  await page.keyboard.press("End");
  const ultraWide = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const hero = rect(".post-hero");
    const paper = rect(".post-paper");
    return {
      contentWidth: rect("#post-content").width,
      heroBottom: hero.bottom,
      paperTop: paper.top,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
  });
  assert.equal(ultraWide.contentWidth, 1200, "keyboard End did not select the maximum HTML measure");
  assert.ok(ultraWide.heroBottom <= ultraWide.paperTop, "wide HTML metadata overlapped the article");
  assert.ok(ultraWide.documentWidth <= ultraWide.viewportWidth, "ultrawide HTML article overflowed horizontally");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const mobile = await page.evaluate(() => ({
    controlDisplay: getComputedStyle(document.querySelector("[data-html-reading-width-handle]")).display,
    fontControlPresent: Boolean(document.querySelector("[data-html-reading-font-control]")),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  }));
  assert.equal(mobile.controlDisplay, "none");
  assert.equal(mobile.fontControlPresent, false);
  assert.ok(mobile.documentWidth <= mobile.viewportWidth, "mobile HTML article overflowed horizontally");

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const portraitTablet = await page.evaluate(() => ({
    fontControlPresent: Boolean(document.querySelector("[data-html-reading-font-control]")),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  }));
  assert.equal(portraitTablet.fontControlPresent, false);
  assert.ok(portraitTablet.documentWidth <= portraitTablet.viewportWidth, "portrait tablet font control caused overflow");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/post.html?slug=markdown-width-fixture&test=markdown-width`, { waitUntil: "domcontentloaded" });
  const markdown = await page.evaluate(() => ({
    htmlClass: document.body.classList.contains("is-html-post"),
    controlDisplay: getComputedStyle(document.querySelector("[data-html-reading-width-handle]")).display,
    fontControlPresent: Boolean(document.querySelector("[data-html-reading-font-control]")),
    contentWidth: document.querySelector("#post-content").getBoundingClientRect().width,
    fontSize: getComputedStyle(document.querySelector("#post-content")).fontSize
  }));
  assert.equal(markdown.htmlClass, false);
  assert.equal(markdown.controlDisplay, "none");
  assert.equal(markdown.fontControlPresent, false);
  assert.equal(markdown.contentWidth, 760, "HTML width leaked into Markdown posts");
  assert.equal(markdown.fontSize, "16.5px", "HTML font size leaked into Markdown posts");

  await page.screenshot({ path: "/tmp/html-reading-width-markdown.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, initial, topPlacement, widened, restored, ultraWide, mobile, markdown }, null, 2));
} finally {
  await browser.close();
}
