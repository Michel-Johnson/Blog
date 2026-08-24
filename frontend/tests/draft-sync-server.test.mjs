import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`admin server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/admin.html`);
      if (response.ok) return;
    } catch (_) {
      // The listening socket is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("admin server did not become ready");
}

function sessionClient(baseUrl) {
  let cookie = "";
  let csrfToken = "";
  const request = async (pathname, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (cookie) headers.set("Cookie", cookie);
    if (csrfToken && options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrfToken);
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    const payload = await response.json();
    if (payload.csrfToken) csrfToken = payload.csrfToken;
    return { response, payload };
  };
  return { request };
}

test("draft writes are isolated, leased, atomic, and revision checked", async (t) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "michel-blog-data-"));
  const port = 20_000 + (process.pid % 10_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const password = `draft-test-${process.pid}`;
  const child = spawn(process.execPath, ["admin-server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ADMIN_PORT: String(port),
      ADMIN_PASSWORD: password,
      BLOG_DATA_ROOT: dataRoot,
      ZHIPU_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  t.after(async () => {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit").catch(() => {});
    await rm(dataRoot, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${logs}`);
  });
  const client = sessionClient(baseUrl);
  const login = await client.request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  assert.equal(login.response.status, 200);

  const draftId = "sync-test-draft";
  const clientA = "tab-a";
  const clientB = "tab-b";
  const leaseA = await client.request(`/api/admin/draft-leases/${draftId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: clientA })
  });
  assert.equal(leaseA.response.status, 200);

  const leaseB = await client.request(`/api/admin/draft-leases/${draftId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: clientB })
  });
  assert.equal(leaseB.response.status, 423);

  const initial = await client.request("/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      clientId: clientA,
      baseRevision: 0,
      title: "Safe draft",
      slug: "safe-draft",
      category: "Notes",
      date: "2026-08-22",
      markdown: "first version",
      status: "draft"
    })
  });
  assert.equal(initial.response.status, 200);
  assert.equal(initial.payload.revision, 1);

  const stale = await client.request("/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      clientId: clientA,
      baseRevision: 0,
      title: "Stale overwrite",
      slug: "safe-draft",
      date: "2026-08-22",
      markdown: "must not win",
      status: "draft"
    })
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.payload.currentRevision, 1);

  const takeover = await client.request(`/api/admin/draft-leases/${draftId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: clientB, takeover: true })
  });
  assert.equal(takeover.response.status, 200);

  const updated = await client.request("/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      clientId: clientB,
      baseRevision: 1,
      title: "Safe draft",
      slug: "safe-draft",
      category: "Notes",
      date: "2026-08-22",
      markdown: "second version",
      status: "draft"
    })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.revision, 2);

  const index = JSON.parse(await readFile(path.join(dataRoot, "data", "authored-posts.json"), "utf8"));
  assert.equal(index.length, 1);
  assert.equal(index[0].markdown, "second version");
  assert.equal(index[0].revision, 2);
  const draftFile = path.join(dataRoot, "content", "drafts", "2026-08-22-safe-draft.md");
  assert.equal(await readFile(draftFile, "utf8").then((text) => text.includes("second version")), true);
  assert.match(await readFile(draftFile, "utf8"), /revision: 2/);
  assert.equal((await readdir(path.join(dataRoot, "data"))).some((name) => name.endsWith(".tmp")), false);

  await writeFile(path.join(dataRoot, "data", "authored-posts.json"), "{broken", "utf8");
  const recovered = await client.request("/api/admin/posts?status=draft");
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.payload.posts[0].revision, 2);
  const recoveredPost = await client.request("/api/admin/posts/safe-draft");
  assert.equal(recoveredPost.payload.post.markdown, "second version");
  assert.equal(
    (await readdir(path.join(dataRoot, "data"))).some((name) => name.startsWith("authored-posts.json.corrupt-")),
    true
  );

  await writeFile(path.join(dataRoot, "data", "draft-commit.json"), JSON.stringify({
    version: 1,
    startedAt: new Date().toISOString(),
    post: {
      ...recoveredPost.payload.post,
      markdown: "recovered interrupted version",
      revision: 3,
      updatedAt: new Date().toISOString()
    }
  }), "utf8");
  const afterInterruptedCommit = await client.request("/api/admin/posts/safe-draft");
  assert.equal(afterInterruptedCommit.payload.post.revision, 3);
  assert.equal(afterInterruptedCommit.payload.post.markdown, "recovered interrupted version");
  await assert.rejects(readFile(path.join(dataRoot, "data", "draft-commit.json"), "utf8"));

  const runtimeBundle = await fetch(`${baseUrl}/authored-posts.js`, { headers: { Cookie: "" } }).then((response) => response.text());
  assert.doesNotMatch(runtimeBundle, /safe-draft/, "private drafts must not leak into the public runtime bundle");
  assert.match(runtimeBundle, /MICHEL_AUTHORED_POSTS/);
});
