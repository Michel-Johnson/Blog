import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_STREAM_TEST_BASE || "http://127.0.0.1:8787";
const post = {
  slug: "assistant-stream-scroll-fixture",
  title: "Assistant stream scroll fixture",
  category: "Tests",
  date: "2026/08/22",
  excerpt: "Verify manual scrolling during a streaming answer.",
  contentFormat: "html",
  markdown: "<article><h2>Streaming</h2><p>Ask a long question and inspect the answer.</p></article>",
  authored: true,
  status: "published"
};

const chunks = Array.from({ length: 24 }, (_, index) => {
  const paragraph = `第 ${index + 1} 段：这是用于验证流式输出滚动行为的较长正文。新内容应继续生成，但用户向上阅读后，页面不能擅自跳回底部。`;
  return index === 10 ? `${paragraph}\n\n- 列表内容不应产生段首缩进。\n\n` : `${paragraph}\n\n`;
});

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(10000);
  await page.addInitScript(({ streamChunks }) => {
    const nativeFetch = window.fetch.bind(window);
    window.__assistantStreamChunksSent = 0;
    window.__assistantStreamDone = false;
    window.fetch = (input, init) => {
      if (!String(input).includes("/api/assistant/chat")) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          let index = 0;
          const timer = setInterval(() => {
            if (index >= streamChunks.length) {
              clearInterval(timer);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              controller.close();
              window.__assistantStreamDone = true;
              return;
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: streamChunks[index] })}\n\n`));
            index += 1;
            window.__assistantStreamChunksSent = index;
          }, 110);
        }
      }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" }
      }));
    };
  }, { streamChunks: chunks });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));

  await page.goto(`${base}/post.html?slug=${post.slug}&qa=stream-scroll`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  console.log("stage: page-loaded");
  await page.locator("[data-assistant-launcher]").click();
  console.log("stage: assistant-opened");
  await page.locator("[data-assistant-input]").fill("请给出较长的分段说明");
  await page.locator("[data-assistant-send]").click();
  console.log("stage: question-sent");

  const messages = page.locator("[data-assistant-messages]");
  await page.waitForFunction(() => window.__assistantStreamChunksSent >= 9);
  console.log("stage: stream-started");
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-assistant-messages]");
    return node && node.scrollHeight > node.clientHeight + 160;
  });

  const geometrySamples = [];
  for (let index = 0; index < 12; index += 1) {
    geometrySamples.push(await page.evaluate(() => {
      const panel = document.querySelector(".reader-assistant");
      const article = document.querySelector(".post-content");
      const panelRect = panel.getBoundingClientRect();
      const articleRect = article.getBoundingClientRect();
      return {
        panelHeight: panelRect.height,
        panelTop: panelRect.top,
        articleLeft: articleRect.left,
        viewportWidth: document.documentElement.clientWidth,
        pageScrollY: window.scrollY
      };
    }));
    await page.waitForTimeout(45);
  }
  const spread = (key) => {
    const values = geometrySamples.map((sample) => sample[key]);
    return Math.max(...values) - Math.min(...values);
  };
  assert.ok(spread("panelHeight") <= 1,
    `assistant frame height jittered during streaming (${spread("panelHeight")}px spread)`);
  assert.ok(spread("panelTop") <= 1,
    `assistant frame moved during streaming (${spread("panelTop")}px spread)`);
  assert.ok(spread("articleLeft") <= 1,
    `article moved during streaming (${spread("articleLeft")}px spread)`);
  assert.ok(spread("viewportWidth") <= 1,
    `viewport width changed during streaming (${spread("viewportWidth")}px spread)`);
  assert.ok(spread("pageScrollY") <= 1,
    `page scroll changed during streaming (${spread("pageScrollY")}px spread)`);

  const followedGap = await messages.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);
  assert.ok(followedGap <= 80, `stream did not initially follow the bottom (${followedGap}px gap)`);

  await messages.evaluate((node) => {
    node.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, bubbles: true }));
    node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight - 240);
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const pausedAt = await messages.evaluate((node) => node.scrollTop);
  const chunksAtPause = await page.evaluate(() => window.__assistantStreamChunksSent);
  await page.waitForFunction((count) => window.__assistantStreamChunksSent >= count + 5, chunksAtPause);
  const afterMoreChunks = await messages.evaluate((node) => node.scrollTop);
  assert.ok(Math.abs(afterMoreChunks - pausedAt) <= 3,
    `stream stole the user's scroll position (${pausedAt}px -> ${afterMoreChunks}px)`);

  await messages.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const chunksAtResume = await page.evaluate(() => window.__assistantStreamChunksSent);
  await page.waitForFunction((count) => window.__assistantStreamDone || window.__assistantStreamChunksSent >= count + 2, chunksAtResume);
  const resumedGap = await messages.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);
  assert.ok(resumedGap <= 80, `auto-follow did not resume at the bottom (${resumedGap}px gap)`);

  await page.waitForFunction(() => window.__assistantStreamDone);
  console.log("stage: stream-finished");
  const answer = page.locator(".assistant-message:not(.is-user):not([data-assistant-intro])").last();
  const paragraphIndent = await answer.locator(":scope > p").first().evaluate((node) => parseFloat(getComputedStyle(node).textIndent));
  assert.ok(paragraphIndent >= 24, `assistant paragraph indentation is too small (${paragraphIndent}px)`);
  const listIndent = await answer.locator("li").first().evaluate((node) => {
    const target = node.querySelector(":scope > p") || node;
    return parseFloat(getComputedStyle(target).textIndent);
  });
  assert.equal(listIndent, 0, "list content incorrectly inherited paragraph indentation");

  try {
    await page.screenshot({
      path: "/tmp/assistant-stream-scroll.png",
      fullPage: false,
      timeout: 5_000,
    });
  } catch (error) {
    console.warn(`diagnostic screenshot skipped: ${error.message}`);
  }
  console.log(JSON.stringify({
    ok: true,
    base,
    pausedAt: Math.round(pausedAt),
    afterMoreChunks: Math.round(afterMoreChunks),
    resumedGap: Math.round(resumedGap),
    paragraphIndent,
    listIndent,
    geometrySpread: {
      panelHeight: spread("panelHeight"),
      panelTop: spread("panelTop"),
      articleLeft: spread("articleLeft"),
      viewportWidth: spread("viewportWidth"),
      pageScrollY: spread("pageScrollY")
    }
  }, null, 2));
} finally {
  await browser.close();
}
