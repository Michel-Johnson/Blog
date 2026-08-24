import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const base = process.env.BASE_URL || "https://micheljohnson.top";
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("ADMIN_PASSWORD is required");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${base}/admin.html?b=toolbar-online-audit-${Date.now()}`, { waitUntil: "networkidle" });
const login = page.locator("[data-login-form]");
if (await login.isVisible()) {
  await login.locator('input[name="password"]').fill(password);
  await login.locator('button[type="submit"]').click();
}
await page.locator("[data-workbench]").waitFor({ state: "visible" });

const editor = page.locator(".toastui-editor-ww-container .ProseMirror");
await editor.waitFor({ state: "visible" });
await editor.click();
await page.keyboard.press("ControlOrMeta+A");
await page.keyboard.type(Array.from({ length: 45 }, (_, index) => `滚动工具栏测试段落 ${index + 1}。这是一段用于形成真实页面高度的正文。`).join("\n\n"));
await page.waitForTimeout(500);

const readState = () => page.evaluate(() => {
  const toolbar = document.querySelector(".toastui-editor-toolbar");
  const rect = toolbar?.getBoundingClientRect();
  const style = toolbar ? getComputedStyle(toolbar) : null;
  const ancestors = [];
  let node = toolbar?.parentElement;
  while (node && ancestors.length < 12) {
    const computed = getComputedStyle(node);
    ancestors.push({
      tag: node.tagName,
      className: node.className,
      overflow: computed.overflow,
      overflowY: computed.overflowY,
      transform: computed.transform,
      contain: computed.contain,
      position: computed.position,
      height: node.getBoundingClientRect().height
    });
    node = node.parentElement;
  }
  return {
    scrollY,
    documentHeight: document.documentElement.scrollHeight,
    toolbar: rect && style ? {
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      position: style.position,
      cssTop: style.top,
      opacity: style.opacity,
      visibility: style.visibility,
      zIndex: style.zIndex
    } : null,
    ancestors
  };
});

const before = await readState();
await page.evaluate(() => window.scrollTo(0, Math.min(1800, document.documentElement.scrollHeight - innerHeight)));
await page.waitForTimeout(400);
const after = await readState();
await page.screenshot({ path: "/tmp/admin-toolbar-idle.png" });
await page.locator(".toastui-editor-toolbar").hover();
await page.waitForTimeout(240);
const hovered = await readState();
await page.screenshot({ path: "/tmp/admin-toolbar-hovered.png" });
console.log(JSON.stringify({ before, after, hovered }, null, 2));
await browser.close();
