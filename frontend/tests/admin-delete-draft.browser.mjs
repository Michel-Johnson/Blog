import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.ADMIN_DELETE_TEST_URL
  || "http://127.0.0.1:8787/admin.html?delete-test=1";
const password = process.env.ADMIN_TEST_PASSWORD;

assert.ok(password, "ADMIN_TEST_PASSWORD is required");

const browser = await chromium.launch({ headless: true });
const title = `delete-regression-${Date.now()}`;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const loginForm = page.locator("[data-login-form]");
  if (await loginForm.isVisible()) {
    await loginForm.locator('input[name="password"]').fill(password);
    await loginForm.locator('button[type="submit"]').click();
  }

  await page.locator("[data-workbench]:not([hidden])").waitFor();
  await page.locator("[data-new-draft]").click();
  await page.locator("[data-post-title]").fill(title);
  await page.locator("[data-post-title]").dispatchEvent("input");
  await page.waitForTimeout(1800);
  await page.locator("[data-refresh-drafts]").click();

  const draftRow = page.locator(".draft-item-row", { hasText: title });
  await draftRow.waitFor();
  assert.equal(await draftRow.count(), 1, "new draft should appear once");

  await page.locator("[data-delete-post]").click();
  await page.locator("[data-delete-dialog] button[value='confirm']").click();
  await draftRow.waitFor({ state: "detached" });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-workbench]:not([hidden])").waitFor();
  await page.locator("[data-refresh-drafts]").click();
  assert.equal(
    await page.locator(".draft-item-row", { hasText: title }).count(),
    0,
    "deleted draft must not return after refresh"
  );

  console.log("top Delete removes the draft from server and browser cache");
} finally {
  await browser.close();
}
