import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_QUOTE_TEST_BASE || "https://micheljohnson.top";
const post = {
  slug: "assistant-sticky-quote-fixture",
  title: "Sticky answer quote fixture",
  category: "Tests",
  date: "2026/08/13",
  excerpt: "Select answer text and keep the quote visible while scrolling.",
  contentFormat: "html",
  markdown: `<article><h2>Unsupervised learning</h2><p>Models discover structure, patterns and relationships without labels.</p></article>`,
  authored: true,
  status: "published"
};

const longAnswer = `无监督学习面对的是没有标签的数据。\n\n${Array.from({ length: 18 }, (_, index) =>
  `第 ${index + 1} 段解释：模型会主动发现数据中隐藏的结构、模式和关系，并结合上下文逐步形成可复用的表示。`
).join("\n\n")}`;
const requestBodies = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.route("**/api/assistant/chat", async (route) => {
    requestBodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: `data: ${JSON.stringify({ content: longAnswer })}\n\ndata: ${JSON.stringify({ done: true })}\n\n`
    });
  });

  await page.goto(`${base}/post.html?slug=${post.slug}&qa=sticky-answer-quote`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-assistant-launcher]").click();
  await page.locator("[data-assistant-input]").fill("如何理解？");
  await page.locator("[data-assistant-send]").click();
  await page.waitForFunction(() => document.querySelectorAll(".assistant-message:not(.is-user)").length >= 2);
  await page.waitForTimeout(300);
  await page.locator("[data-assistant-messages]").evaluate((node) => { node.scrollTop = 0; });
  await page.waitForTimeout(100);

  const selectedText = "主动发现数据中隐藏的结构、模式和关系";
  await page.evaluate((target) => {
    const answers = [...document.querySelectorAll(".assistant-message:not(.is-user)")];
    const answer = answers.at(-1);
    const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.nodeValue.indexOf(target);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error("target answer text not found");
  }, selectedText);

  const quote = page.locator("[data-assistant-quote]");
  await quote.waitFor({ state: "visible" });
  assert.match(await quote.textContent(), /主动发现数据中隐藏的结构、模式和关系/);
  assert.equal(await page.locator(".selection-ai-action").count(), 0,
    "answer selection still created a floating Ask AI button");
  await page.screenshot({ path: "/tmp/assistant-answer-quote-selected.png" });

  const before = await quote.boundingBox();
  const highlightTopBefore = Number.parseFloat(await page.locator(".selection-ai-highlights span").first().evaluate((node) => node.style.top));
  const rangeTopBefore = await page.evaluate(() => window.getSelection().getRangeAt(0).getBoundingClientRect().top);
  await page.locator("[data-assistant-messages]").evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await page.waitForTimeout(200);
  const highlightTopAfter = Number.parseFloat(await page.locator(".selection-ai-highlights span").first().evaluate((node) => node.style.top));
  const rangeTopAfter = await page.evaluate(() => window.getSelection().getRangeAt(0).getBoundingClientRect().top);
  const after = await quote.boundingBox();
  const messages = await page.locator("[data-assistant-messages]").boundingBox();
  const geometry = await page.evaluate(() => {
    const messagesNode = document.querySelector("[data-assistant-messages]");
    const quoteNode = document.querySelector("[data-assistant-quote]");
    return {
      quoteTop: quoteNode.getBoundingClientRect().top,
      messagesTop: messagesNode.getBoundingClientRect().top,
      scrollTop: messagesNode.scrollTop
    };
  });
  assert.ok(before && after && messages);
  assert.ok(Math.abs(after.y - before.y) <= 2, "quote moved away while scrolling the answer");
  assert.ok(after.y < messages.y, "quote was not placed in the fixed header above the messages viewport");
  const highlightHiddenAfter = await page.locator(".selection-ai-highlights").evaluate((node) => node.hidden);
  assert.ok(highlightTopAfter < highlightTopBefore - 100 || highlightHiddenAfter,
    `selection highlight stayed at its old viewport position instead of following or leaving with the selected text (${highlightTopBefore} -> ${highlightTopAfter}; range ${rangeTopBefore} -> ${rangeTopAfter}; scroll ${geometry.scrollTop})`);
  assert.equal(await page.locator("[data-assistant-input]").getAttribute("placeholder"), "",
    "composer still shows instructional placeholder text");
  assert.equal(await page.locator("[data-assistant-panel] header").getByText("Ask this article", { exact: true }).count(), 0,
    "old Ask this article title is still visible");

  const clearQuote = page.locator("[data-assistant-clear-quote]");
  await clearQuote.waitFor({ state: "visible" });
  await page.screenshot({ path: "/tmp/assistant-clear-quote-button.png" });
  await clearQuote.click();
  assert.equal(await page.locator("[data-assistant-quote]").isHidden(), true,
    "cancel selection did not hide the header quote");
  assert.equal(await page.locator(".selection-ai-highlights.is-persistent").count(), 1,
    "cancel selection removed the persistent branch anchor");
  assert.equal(await page.locator(".selection-ai-highlights.is-active").count(), 0,
    "cancel selection left the branch anchor active");
  await page.locator("[data-assistant-input]").fill("无引用问题");
  await page.locator("[data-assistant-send]").click();
  await page.waitForFunction(() => document.querySelectorAll(".assistant-message.is-user").length >= 2);
  await page.waitForTimeout(150);
  const unquotedRequest = requestBodies.at(-1);
  assert.equal(unquotedRequest.selectedText, "",
    "cancelled selection was still included in a later request");
  assert.equal(unquotedRequest.contextBefore, "",
    "cancelled selection context-before was still included in a later request");
  assert.equal(unquotedRequest.contextAfter, "",
    "cancelled selection context-after was still included in a later request");

  await page.evaluate((target) => {
    const answers = [...document.querySelectorAll(".assistant-message:not(.is-user)")];
    const answer = answers.at(-1);
    const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.nodeValue.indexOf(target);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
  }, selectedText);
  await page.waitForTimeout(250);

  await page.locator("[data-assistant-input]").fill("如何理解？");
  await page.locator("[data-assistant-send]").click();
  await page.waitForFunction(() => document.querySelectorAll(".assistant-message.is-user").length >= 2);
  await page.waitForTimeout(200);
  const followUpRequest = requestBodies.at(-1);
  assert.equal(followUpRequest.question, "如何理解？");
  assert.equal(followUpRequest.selectedText, selectedText,
    "selected answer text was not included in the follow-up request");
  assert.match(followUpRequest.contextBefore, /模型会|第 \d+ 段解释/,
    "answer context before the selection was not included");
  assert.match(followUpRequest.contextAfter, /并结合上下文|形成可复用的表示/,
    "answer context after the selection was not included");
  assert.equal(followUpRequest.selectionOrigin, "assistant",
    "answer selection origin was not included in the follow-up request");
  const quoteJump = page.locator(".assistant-message.is-user .assistant-quote-jump").last();
  await quoteJump.waitFor({ state: "visible" });
  const userBubble = page.locator(".assistant-message.is-user").last();
  const [jumpBox, bubbleBox] = await Promise.all([quoteJump.boundingBox(), userBubble.boundingBox()]);
  const bubbleStyle = await userBubble.evaluate((node) => {
    const style = getComputedStyle(node);
    return { fontSize: style.fontSize, lineHeight: style.lineHeight, paddingBlock: `${style.paddingTop}/${style.paddingBottom}` };
  });
  assert.ok(jumpBox && bubbleBox, "quote jump or user bubble has no layout box");
  assert.ok(jumpBox.x + jumpBox.width <= bubbleBox.x,
    "quote jump is not positioned to the left of the user bubble");
  assert.ok(jumpBox.width <= 22.5 && jumpBox.height <= 22.5,
    "quote jump button is larger than the compact 22px target");
  assert.ok(bubbleBox.height <= 36,
    `single-line user bubble still has excessive vertical height (${bubbleBox.height}px; ${JSON.stringify(bubbleStyle)})`);
  await quoteJump.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/assistant-answer-quote-jump-button.png" });
  await quoteJump.click();
  await page.waitForTimeout(500);
  assert.ok(await page.locator(".selection-ai-highlights.is-active span").first().isVisible(),
    "quote jump did not restore the quoted answer highlight");
  assert.ok(await page.locator(".selection-ai-highlights.is-active").evaluate((node) => node.classList.contains("is-quote-jump")),
    "quote jump did not apply the strengthened quoted-text highlight");
  const highlightBox = await page.locator(".selection-ai-highlights.is-active span").first().boundingBox();
  const quotedRangeBoxes = await page.evaluate((target) => {
    const boxes = [];
    const answers = [...document.querySelectorAll(".assistant-message:not(.is-user):not(.is-selection-preview)")];
    for (const answer of answers) {
      const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const index = node.nodeValue.indexOf(target);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        boxes.push(...[...range.getClientRects()].map((rect) => rect.toJSON()));
      }
    }
    return boxes;
  }, selectedText);
  assert.ok(highlightBox && quotedRangeBoxes.length,
    "quote highlight or quoted range has no layout box");
  assert.ok(quotedRangeBoxes.some((box) => (
    highlightBox.x < box.right
    && highlightBox.x + highlightBox.width > box.left
    && highlightBox.y < box.bottom
    && highlightBox.y + highlightBox.height > box.top
  )), "quote highlight does not overlap any matching quoted text range");
  await page.screenshot({ path: "/tmp/assistant-answer-quote-scrolled.png" });

  console.log(JSON.stringify({
    ok: true,
    selectedText,
    quoteTopBefore: Math.round(before.y),
    quoteTopAfter: Math.round(after.y),
    messagesTop: Math.round(messages.y),
    scrollTop: await page.locator("[data-assistant-messages]").evaluate((node) => Math.round(node.scrollTop)),
    highlightTopBefore: Math.round(highlightTopBefore),
    highlightTopAfter: Math.round(highlightTopAfter),
    followUpPayload: {
      question: followUpRequest.question,
      selectedText: followUpRequest.selectedText,
      contextBeforeLength: followUpRequest.contextBefore.length,
      contextAfterLength: followUpRequest.contextAfter.length
    }
  }, null, 2));
} finally {
  await browser.close();
}
