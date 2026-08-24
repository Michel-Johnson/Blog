import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.ASSISTANT_BRANCH_TEST_BASE || "http://127.0.0.1:8082";
const post = {
  slug: "assistant-branch-tree-fixture",
  title: "Assistant branch tree fixture",
  category: "Tests",
  date: "2026/08/14",
  excerpt: "Verify quote-driven conversation branches.",
  contentFormat: "html",
  markdown: "<article><p>Article root passage for branch testing.</p></article>",
  authored: true,
  status: "published"
};
const responses = [
  "第一段包含引用甲。第二段包含引用乙。",
  "甲分支回答，其中包含嵌套引用甲二。",
  "乙分支回答。",
  "甲二的继续回答。"
];
const requests = [];

function selectText(page, text) {
  return page.evaluate((target) => {
    const answers = [...document.querySelectorAll(".assistant-message:not(.is-user):not([data-assistant-intro])")];
    for (const answer of answers) {
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
        return true;
      }
    }
    return false;
  }, text);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("**/authored-posts.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([post])};window.MICHEL_HIDDEN_POSTS=[];`
  }));
  await page.route("**/api/assistant/chat", async (route) => {
    requests.push(JSON.parse(route.request().postData() || "{}"));
    const content = responses[requests.length - 1] || "fallback";
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: `data: ${JSON.stringify({ content })}\n\ndata: ${JSON.stringify({ done: true })}\n\n`
    });
  });

  await page.goto(`${base}/post.html?slug=${post.slug}&qa=branch-tree`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-assistant-launcher]").click();
  const ask = async (question) => {
    const expectedUsers = await page.locator(".assistant-message.is-user").count() + 1;
    await page.locator("[data-assistant-input]").fill(question);
    await page.locator("[data-assistant-send]").click();
    await page.waitForFunction((count) => document.querySelectorAll(".assistant-message.is-user").length >= count, expectedUsers);
    await page.waitForTimeout(180);
  };

  await ask("起始问题");
  assert.ok(await selectText(page, "引用甲"));
  await page.waitForTimeout(180);
  await ask("甲问题");
  assert.ok(await selectText(page, "引用乙"));
  await page.waitForTimeout(180);
  await ask("乙问题");

  assert.equal(await page.locator(".selection-ai-highlights.is-persistent").count(), 2,
    "multiple quote anchors were not kept in the session");
  assert.deepEqual(requests[1].branchPath.map((item) => item.content), ["起始问题", responses[0]],
    "A branch did not include its root path");
  assert.deepEqual(requests[2].branchPath.map((item) => item.content), ["起始问题", responses[0]],
    "B branch leaked messages from sibling A");

  await page.getByRole("button", { name: "Open branch for quoted text: 引用甲" }).first().click();
  await page.waitForTimeout(120);
  assert.equal(await page.getByText("甲分支回答，其中包含嵌套引用甲二。", { exact: true }).isVisible(), true,
    "clicking A did not restore A branch");
  assert.equal(await page.getByText("乙分支回答。", { exact: true }).isVisible(), false,
    "clicking A did not hide sibling B branch");

  assert.ok(await selectText(page, "嵌套引用甲二"));
  await page.waitForTimeout(180);
  await ask("继续甲二");
  assert.deepEqual(requests[3].branchPath.map((item) => item.content), [
    "起始问题", responses[0], "甲问题", responses[1]
  ], "nested branch path was not assembled from root to leaf");
  assert.ok(!requests[3].branchPath.some((item) => item.content === "乙问题" || item.content === responses[2]),
    "nested A branch leaked B sibling context");

  await page.screenshot({ path: "/tmp/assistant-branch-tree.png", fullPage: false });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(250);
  const portraitLayout = await page.evaluate(() => {
    const panel = document.querySelector("[data-assistant-panel]").getBoundingClientRect();
    const form = document.querySelector("[data-assistant-form]").getBoundingClientRect();
    return {
      panelBottomGap: Math.round(innerHeight - panel.bottom),
      formBottomGap: Math.round(innerHeight - form.bottom),
      horizontalOverflow: Math.round(document.documentElement.scrollWidth - innerWidth)
    };
  });
  assert.ok(portraitLayout.panelBottomGap >= -1 && portraitLayout.panelBottomGap <= 24,
    `portrait assistant is not anchored to the bottom (${portraitLayout.panelBottomGap}px)`);
  assert.ok(portraitLayout.formBottomGap >= 0 && portraitLayout.formBottomGap <= 40,
    `portrait composer is not near the bottom (${portraitLayout.formBottomGap}px)`);
  assert.ok(portraitLayout.horizontalOverflow <= 1,
    `portrait branch UI caused horizontal overflow (${portraitLayout.horizontalOverflow}px)`);
  await page.screenshot({ path: "/tmp/assistant-branch-tree-portrait.png", fullPage: false });
  console.log(JSON.stringify({ ok: true, anchors: 3, requests: requests.map((item) => item.branchPath?.length || 0) }, null, 2));
} finally {
  await browser.close();
}
