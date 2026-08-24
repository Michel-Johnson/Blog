import assert from "node:assert/strict";
import { chromium } from "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const baseUrl = process.env.ADMIN_UNPUBLISH_TEST_URL
  || "http://127.0.0.1:8790/admin.html?edit=legacy-note&unpublish-test=1";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
let savedPayload = null;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/session") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, csrfToken: "test-csrf" }) });
    }
    if (request.method() === "GET" && url.pathname === "/api/admin/posts/legacy-note") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          post: {
            slug: "legacy-note",
            originalSlug: "Legacy Note",
            aliases: ["legacy-note"],
            category: "Notes",
            date: "2025/11/12",
            title: "Legacy note",
            excerpt: "Legacy summary",
            markdown: "Legacy body",
            status: "published",
            importedFromLegacy: true,
            legacySource: "/2025/11/12/legacy-note/"
          }
        })
      });
    }
    if (request.method() === "POST" && url.pathname === "/api/admin/posts") {
      savedPayload = request.postDataJSON();
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, slug: "legacy-note", draftId: "legacy-draft", status: "draft" })
      });
    }
    if (request.method() === "GET" && url.pathname === "/api/admin/posts") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, posts: [] }) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("[data-workbench]:not([hidden])").waitFor();
  await page.locator("[data-unpublish]:visible").waitFor();
  assert.equal(await page.locator("[data-publish]:visible").count(), 1, "published legacy post should expose its Update action");
  assert.equal(await page.locator("[data-publish]").textContent(), "Update");

  await page.locator("[data-unpublish]").click();
  await page.locator("[data-unpublish-dialog] button[value='confirm']").click();
  await page.waitForURL(/admin\.html\?drafts=1/);

  assert.equal(savedPayload?.status, "draft", "Move to drafts must save the legacy article as a draft");
  assert.equal(savedPayload?.importedFromLegacy, true, "legacy identity must be retained for public suppression");
  console.log("published legacy article shows Move to drafts and returns to the draft inbox");
} finally {
  await browser.close();
}
