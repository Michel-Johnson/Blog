import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { detectContentFormat, parseArgv } from "../bin/michel-blog.mjs";

const execFileAsync = promisify(execFile);
const CLI = path.resolve("bin/michel-blog.mjs");

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(body));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function createMockWriter() {
  const posts = new Map();
  const pins = new Set();
  const requests = [];
  const csrfToken = "test-csrf";
  const cookie = "mj_admin=test-session";

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({ method: request.method, pathname: url.pathname });

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      const body = await requestBody(request);
      if (body.password !== "test-password") return json(response, 401, { error: "Invalid password" });
      return json(response, 200, { ok: true, csrfToken }, { "Set-Cookie": `${cookie}; HttpOnly; SameSite=Strict` });
    }

    if (request.headers.cookie !== cookie) return json(response, 401, { error: "Authentication required" });
    if (request.method !== "GET" && request.headers["x-csrf-token"] !== csrfToken) {
      return json(response, 403, { error: "Invalid CSRF token" });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/posts") {
      const status = url.searchParams.get("status") || "all";
      const uniquePosts = [...new Set(posts.values())];
      return json(response, 200, {
        posts: uniquePosts.filter((post) => status === "all" || post.status === status)
      });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/posts") {
      const post = await requestBody(request);
      const slug = post.slug || post.title.toLowerCase().replace(/\s+/g, "-");
      const draftId = post.draftId || `draft-${posts.size + 1}`;
      const saved = { ...post, slug, draftId };
      posts.set(slug, saved);
      posts.set(draftId, saved);
      return json(response, 200, {
        status: saved.status,
        slug,
        draftId,
        url: saved.status === "published" ? `post.html?slug=${slug}&theme=sketch` : "admin.html"
      });
    }

    const postMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
    if (postMatch) {
      const identity = decodeURIComponent(postMatch[1]);
      const post = posts.get(identity);
      if (!post) return json(response, 404, { error: "Post not found" });
      if (request.method === "GET") return json(response, 200, { post });
      if (request.method === "DELETE") {
        for (const [key, value] of posts) {
          if (value === post) posts.delete(key);
        }
        return json(response, 200, { deleted: post });
      }
    }

    const pinMatch = url.pathname.match(/^\/api\/admin\/pins\/([^/]+)$/);
    if (request.method === "POST" && pinMatch) {
      const identity = decodeURIComponent(pinMatch[1]);
      const body = await requestBody(request);
      if (body.pinned) pins.add(identity);
      else pins.delete(identity);
      return json(response, 200, { slug: identity, pinned: Boolean(body.pinned) });
    }

    return json(response, 404, { error: "Not found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    posts,
    pins,
    requests,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function cli(args, url, options = {}) {
  return execFileAsync(process.execPath, [CLI, ...args, "--url", url], {
    env: {
      ...process.env,
      MICHEL_BLOG_PASSWORD: "test-password",
      TZ: "Asia/Shanghai"
    },
    ...options
  });
}

test("CLI argument parsing and content format detection are deterministic", () => {
  assert.deepEqual(parseArgv(["create", "--title", "Hello", "--publish", "--format=html"]), {
    positional: ["create"],
    flags: { title: "Hello", publish: true, format: "html" }
  });
  assert.equal(detectContentFormat("post.md"), "markdown");
  assert.equal(detectContentFormat("post.html"), "html");
  assert.equal(detectContentFormat("-", "md"), "markdown");
});

test("CLI runs through an installed symlink", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "michel-blog-link-"));
  try {
    const installedLink = path.join(temp, "michel-blog");
    await symlink(CLI, installedLink);
    const result = await execFileAsync(installedLink, ["help"]);
    assert.match(result.stdout, /^michel-blog - write Michel's blog/m);
    assert.match(result.stdout, /--format md\|html/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI writes Markdown and HTML through the authenticated writer API", async () => {
  const mock = await createMockWriter();
  const temp = await mkdtemp(path.join(os.tmpdir(), "michel-blog-cli-"));
  try {
    const markdownPath = path.join(temp, "notes.md");
    const htmlPath = path.join(temp, "demo.html");
    const outputPath = path.join(temp, "downloaded.html");
    const markdown = "# Notes\n\nThis is **Markdown**.\n";
    const html = "<article><h1>Demo</h1><p>Raw <strong>HTML</strong>.</p></article>\n";
    await writeFile(markdownPath, markdown);
    await writeFile(htmlPath, html);

    const draft = await cli([
      "create",
      "--title", "CLI notes",
      "--slug", "cli-notes",
      "--category", "Notes",
      "--tags", "cli, markdown",
      "--file", markdownPath,
      "--json"
    ], mock.url);
    assert.match(draft.stdout, /"status": "draft"/);
    assert.equal(mock.posts.get("cli-notes").markdown, markdown);
    assert.equal(mock.posts.get("cli-notes").contentFormat, "markdown");

    const published = await cli([
      "create",
      "--title", "HTML demo",
      "--slug", "html-demo",
      "--file", htmlPath,
      "--publish",
      "--pin",
      "--json"
    ], mock.url);
    assert.match(published.stdout, /"status": "published"/);
    assert.equal(mock.posts.get("html-demo").markdown, html);
    assert.equal(mock.posts.get("html-demo").contentFormat, "html");
    assert.equal(mock.posts.get("html-demo").status, "published");
    assert.equal(mock.pins.has("html-demo"), true);

    await cli(["get", "html-demo", "--output", outputPath], mock.url);
    assert.equal(await readFile(outputPath, "utf8"), html);

    const list = await cli(["list", "--status", "published", "--json"], mock.url);
    const listed = JSON.parse(list.stdout);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].slug, "html-demo");

    await cli(["unpin", "html-demo"], mock.url);
    assert.equal(mock.pins.has("html-demo"), false);

    await cli(["delete", "cli-notes", "--yes"], mock.url);
    assert.equal(mock.posts.has("cli-notes"), false);
    assert.ok(mock.requests.some((item) => item.pathname === "/api/admin/login"));
  } finally {
    await mock.close();
    await rm(temp, { recursive: true, force: true });
  }
});
