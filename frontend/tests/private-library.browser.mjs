import { spawn } from "node:child_process";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const port = 8099;
const origin = `http://127.0.0.1:${port}`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: "ignore"
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await sleep(500);

const posts = [
  { slug: "private-notes", title: "私人研究笔记", category: "Notes", status: "published", updatedAt: "2026-08-22T10:00:00Z" },
  { slug: "private-english", title: "Long-form systems journal", category: "Dev", status: "published", updatedAt: "2026-08-21T10:00:00Z" },
  { draftId: "draft-1", title: "尚未完成的草稿", category: "Diary", status: "draft", excerpt: "A private draft paper.", updatedAt: "2026-08-22T11:00:00Z" }
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let authenticated = false;

  await page.route("**/api/admin/session", (route) => route.fulfill({
    status: authenticated ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(authenticated ? { ok: true, csrfToken: "test-token" } : { error: "Unauthorized" })
  }));
  await page.route("**/api/admin/login", (route) => {
    authenticated = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, csrfToken: "test-token" }) });
  });
  await page.route("**/api/admin/logout", (route) => {
    authenticated = false;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/admin/posts?status=all", (route) => route.fulfill({
    status: authenticated ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(authenticated ? { ok: true, posts } : { error: "Unauthorized" })
  }));

  await page.goto(`${origin}/private.html`, { waitUntil: "networkidle" });
  if (!(await page.locator("[data-login-panel]").isVisible())) throw new Error("Locked screen is not visible");
  if (await page.locator("[data-private-workspace]").isVisible()) throw new Error("Private workspace leaked before authentication");

  await page.locator('input[name="password"]').fill("test-only");
  await page.locator('[data-login-form] button[type="submit"]').click();
  await page.locator("[data-private-workspace]").waitFor({ state: "visible" });
  if (await page.locator(".private-book").count() !== 2) throw new Error("Published books were not rendered");
  if (await page.locator(".private-paper").count() !== 1) throw new Error("Draft paper was not rendered");
  await page.screenshot({ path: "/tmp/private-library-desktop.png", fullPage: true });

  await page.locator("[data-logout]").click();
  await page.locator("[data-login-panel]").waitFor({ state: "visible" });
  const remainingPrivateNodes = await page.locator(".private-book, .private-paper").evaluateAll((nodes) =>
    nodes.map((node) => ({ className: node.className, title: node.textContent.trim() }))
  );
  if (remainingPrivateNodes.length) {
    throw new Error(`Private nodes remain after logout: ${JSON.stringify(remainingPrivateNodes)}`);
  }

  authenticated = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-private-workspace]").waitFor({ state: "visible" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`Mobile page overflows horizontally by ${overflow}px`);
  await page.screenshot({ path: "/tmp/private-library-mobile.png", fullPage: true });

  console.log(JSON.stringify({ ok: true, books: 2, drafts: 1, mobileOverflow: overflow }));
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
