import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8081";
const slug = "reader-editor-parity-fixture";
const articleHtml = `
  <p class="lead">本文从基础原理、经典调度和工程实现出发，逐步进入 Zero Bubble、长上下文与双向流水线。</p>
  <nav class="toc"><strong>目录</strong><ol><li><a href="#route">学习路线</a></li><li><a href="#table">工程实现</a></li></ol></nav>
  <blockquote><strong>学习主线：</strong>每一种方法都回答四个问题：切了什么、谁在等待、显存何时达到峰值。</blockquote>
  <h2 id="route">学习路线</h2>
  <p>这是用于校验阅读页面与编辑页面排版宽度、字体、字号和行高的同源正文。</p>
  <table id="table"><thead><tr><th>阶段</th><th>目标</th><th>核心内容</th></tr></thead><tbody><tr><td>基础原理</td><td>看懂一条流水线</td><td>Stage、Micro Batch、前向与反向</td></tr></tbody></table>
`;
const fixture = {
  slug,
  originalSlug: slug,
  title: "流水线并行（PP）：从基础原理到前沿调度",
  category: "AI INFRA",
  date: "2026/08/11",
  excerpt: "本文从基础原理与经典调度出发，逐步深入前沿流水线并行技术。",
  markdown: articleHtml,
  contentFormat: "html",
  authored: true,
  status: "published",
  tags: ["AI Infra"]
};

console.log(`[parity] launch ${base}`);
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
await context.addInitScript(() => localStorage.removeItem("michel-html-reading-width-v1"));

const cssMetrics = async (locator) => locator.evaluate((node) => {
  const style = getComputedStyle(node);
  return {
    width: Number.parseFloat(style.width),
    fontFamily: style.fontFamily,
    fontSize: Number.parseFloat(style.fontSize),
    lineHeight: Number.parseFloat(style.lineHeight),
    letterSpacing: Number.parseFloat(style.letterSpacing) || 0,
    clientWidth: node.clientWidth,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight
  };
});

const publicPage = await context.newPage();
await publicPage.route("**/authored-posts.js*", async (route) => route.fulfill({
  status: 200,
  contentType: "application/javascript",
  body: `window.MICHEL_AUTHORED_POSTS=${JSON.stringify([fixture])};`
}));
console.log("[parity] public page");
await publicPage.goto(`${base}/post.html?slug=${slug}&theme=sketch&b=reader-editor-parity`, { waitUntil: "domcontentloaded", timeout: 15000 });
await publicPage.locator("#post-content .lead").waitFor();
await publicPage.screenshot({ path: "/tmp/reader-parity-public.png", fullPage: true });

const adminPage = await context.newPage();
await adminPage.route("**/api/admin/session", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, csrfToken: "test" }) }));
await adminPage.route(`**/api/admin/posts/${slug}`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ post: fixture }) }));
await adminPage.route("**/api/admin/posts", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [fixture] }) }));
console.log("[parity] editor page");
await adminPage.goto(`${base}/admin.html?edit=${slug}&b=reader-editor-parity`, { waitUntil: "domcontentloaded", timeout: 15000 });
await adminPage.locator("[data-workbench]").waitFor({ state: "visible" });
await adminPage.locator("[data-html-visual-editor]").waitFor();
const frame = adminPage.frameLocator("[data-html-visual-editor]");
await frame.locator("body .lead").waitFor();
await adminPage.screenshot({ path: "/tmp/reader-parity-editor.png", fullPage: true });

const publicContent = await cssMetrics(publicPage.locator("#post-content"));
const publicTitle = await cssMetrics(publicPage.locator("#post-title"));
const editorBody = await frame.locator("body").evaluate((node) => {
  const style = getComputedStyle(node);
  return {
    width: Number.parseFloat(style.width),
    fontFamily: style.fontFamily,
    fontSize: Number.parseFloat(style.fontSize),
    lineHeight: Number.parseFloat(style.lineHeight),
    letterSpacing: Number.parseFloat(style.letterSpacing) || 0,
    clientWidth: node.clientWidth
  };
});
const editorTitle = await cssMetrics(adminPage.locator("[data-post-title]"));

const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
const checks = {
  bodyWidth: near(publicContent.clientWidth, editorBody.clientWidth, 2),
  bodyFontSize: near(publicContent.fontSize, editorBody.fontSize, .1),
  bodyLineHeight: near(publicContent.lineHeight, editorBody.lineHeight, .2),
  bodyLetterSpacing: near(publicContent.letterSpacing, editorBody.letterSpacing, .1),
  titleFontSize: near(publicTitle.fontSize, editorTitle.fontSize, .1),
  titleLineHeight: near(publicTitle.lineHeight, editorTitle.lineHeight, .2),
  titleWidth: near(publicTitle.clientWidth, editorTitle.clientWidth, 2),
  titleLetterSpacing: near(publicTitle.letterSpacing, editorTitle.letterSpacing, .1),
  titleWrapsWithoutClipping: editorTitle.clientHeight + 2 >= editorTitle.scrollHeight
};
console.log(JSON.stringify({ base, publicContent, editorBody, publicTitle, editorTitle, checks }, null, 2));
await browser.close();
if (Object.values(checks).some((value) => !value)) process.exit(1);
