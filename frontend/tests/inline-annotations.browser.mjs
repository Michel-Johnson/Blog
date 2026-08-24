import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const script = await readFile(new URL("../inline-annotations.js", import.meta.url), "utf8");
const payload = Buffer.from(JSON.stringify({ body: "用于测试选择。", origin: "glm" }), "utf8").toString("base64url");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  await page.setContent(`<!doctype html><style>
    body{font:28px serif;padding:80px}.article-annotation-popover{display:none}
    .article-annotation:hover .article-annotation-popover,.article-annotation.is-open .article-annotation-popover{display:block;position:absolute}
  </style><main id="root"><p><a href="#michel-note-v1:${payload}">梯度下降</a>可以优化模型参数并持续收敛。</p></main><script>${script}<\/script>`);
  await page.evaluate(() => window.MichelAnnotations.enhance(document.querySelector("#root")));

  const trigger = page.locator(".article-annotation");
  await trigger.hover();
  assert.equal(await page.locator(".article-annotation-popover").isVisible(), true);

  const start = await trigger.boundingBox();
  const paragraph = await page.locator("p").boundingBox();
  await page.mouse.move(start.x + 4, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(paragraph.x + paragraph.width - 4, paragraph.y + paragraph.height / 2, { steps: 12 });
  await page.mouse.up();
  const state = await page.evaluate(() => ({
    selection: window.getSelection().toString(),
    open: document.querySelector(".article-annotation").classList.contains("is-open")
  }));
  assert.match(state.selection, /梯度下降.*持续收敛/);
  assert.equal(state.open, false);

  await page.evaluate(() => window.getSelection().removeAllRanges());
  await trigger.click();
  assert.equal(await trigger.evaluate((node) => node.classList.contains("is-open")), true);
  console.log("inline annotation selection and pin checks passed");
} finally {
  await browser.close();
}
