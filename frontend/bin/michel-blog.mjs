#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "http://127.0.0.1:8787";

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseArgv(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equalIndex = token.indexOf("=");
    if (equalIndex !== -1) {
      flags[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      index += 1;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

function flag(flags, ...names) {
  for (const name of names) {
    if (Object.hasOwn(flags, name)) return flags[name];
  }
  return undefined;
}

function booleanFlag(flags, name, fallback = false) {
  const value = flag(flags, name);
  if (value === undefined) return fallback;
  if (value === true) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

export function detectContentFormat(file, requested = "") {
  const normalized = String(requested || "").trim().toLowerCase();
  if (["md", "markdown"].includes(normalized)) return "markdown";
  if (["html", "htm"].includes(normalized)) return "html";
  return /\.html?$/i.test(String(file || "")) ? "html" : "markdown";
}

async function readInput(file) {
  if (!file) return undefined;
  if (file === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(path.resolve(file), "utf8");
}

async function loadPassword(flags) {
  if (process.env.MICHEL_BLOG_PASSWORD) return process.env.MICHEL_BLOG_PASSWORD;
  const passwordFile = flag(flags, "password-file") || process.env.MICHEL_BLOG_PASSWORD_FILE;
  if (passwordFile) return (await readFile(path.resolve(passwordFile), "utf8")).trim();
  fail(
    "Missing credentials. Set MICHEL_BLOG_PASSWORD or MICHEL_BLOG_PASSWORD_FILE. " +
    "The CLI intentionally does not accept a password argument."
  );
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_URL).replace(/\/+$/, "");
}

function cookieFromResponse(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => String(value).split(";")[0]).filter(Boolean).join("; ");
}

export class BlogClient {
  constructor({ baseUrl = DEFAULT_URL, password, fetchImpl = fetch } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.password = password;
    this.fetch = fetchImpl;
    this.cookie = "";
    this.csrfToken = "";
  }

  async login() {
    const response = await this.fetch(`${this.baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: this.password })
    });
    const body = await this.readResponse(response);
    this.cookie = cookieFromResponse(response);
    this.csrfToken = String(body.csrfToken || "");
    if (!this.cookie || !this.csrfToken) fail("Login succeeded without a usable session.");
    return body;
  }

  async request(route, options = {}) {
    if (!this.cookie || !this.csrfToken) await this.login();
    const headers = new Headers(options.headers || {});
    headers.set("Cookie", this.cookie);
    if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", this.csrfToken);
    if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return this.readResponse(await this.fetch(`${this.baseUrl}${route}`, { ...options, headers }));
  }

  async readResponse(response) {
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const message = body && typeof body === "object" ? body.error : body;
      fail(message || `Request failed with HTTP ${response.status}`);
    }
    return body;
  }

  list(status = "all") {
    return this.request(`/api/admin/posts?status=${encodeURIComponent(status)}`, { method: "GET" });
  }

  get(identity) {
    return this.request(`/api/admin/posts/${encodeURIComponent(identity)}`, { method: "GET" });
  }

  save(post) {
    return this.request("/api/admin/posts", { method: "POST", body: JSON.stringify(post) });
  }

  delete(identity) {
    return this.request(`/api/admin/posts/${encodeURIComponent(identity)}`, { method: "DELETE" });
  }

  pin(identity, pinned) {
    return this.request(`/api/admin/pins/${encodeURIComponent(identity)}`, {
      method: "POST",
      body: JSON.stringify({ pinned })
    });
  }
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function tagsValue(value, existing = []) {
  if (value === undefined) return Array.isArray(existing) ? existing.join(", ") : String(existing || "");
  return String(value).split(",").map((item) => item.trim()).filter(Boolean).join(", ");
}

function postPayload(existing, flags, markdown, status) {
  const file = flag(flags, "file", "content");
  const title = flag(flags, "title") ?? existing?.title ?? "";
  const excerpt = flag(flags, "excerpt");
  const contentFormat = detectContentFormat(file, flag(flags, "format") ?? existing?.contentFormat);
  return {
    ...(existing || {}),
    title,
    slug: flag(flags, "slug") ?? existing?.slug ?? "",
    originalSlug: existing?.originalSlug || "",
    aliases: existing?.aliases || [],
    draftId: existing?.draftId || flag(flags, "draft-id") || "",
    category: flag(flags, "category") ?? existing?.category ?? "Notes",
    date: flag(flags, "date") ?? existing?.date ?? today(),
    tags: tagsValue(flag(flags, "tags"), existing?.tags),
    excerpt: excerpt !== undefined ? String(excerpt) : String(existing?.excerpt || ""),
    excerptMode: excerpt !== undefined ? "manual" : (existing?.excerptMode || "auto"),
    markdown: markdown !== undefined ? markdown.replace(/\r\n?/g, "\n") : String(existing?.markdown || ""),
    contentFormat,
    status,
    summarize: booleanFlag(flags, "summarize", status === "published" && excerpt === undefined),
    annotate: booleanFlag(flags, "annotate", false),
    deferEnrichment: booleanFlag(flags, "defer-enrichment", status === "published")
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printPostList(posts) {
  if (!posts.length) {
    process.stdout.write("No posts found.\n");
    return;
  }
  for (const post of posts) {
    const identity = post.draftId || post.slug;
    process.stdout.write(`${identity}\t${post.status}\t${post.contentFormat || "markdown"}\t${post.title}\n`);
  }
}

async function saveCommand(client, command, identity, flags) {
  const isCreate = command === "create";
  const existing = isCreate ? null : (await client.get(identity)).post;
  const file = flag(flags, "file", "content");
  const markdown = await readInput(file);
  const status = command === "publish" || booleanFlag(flags, "publish")
    ? "published"
    : flag(flags, "status") || existing?.status || "draft";
  const payload = postPayload(existing, flags, markdown, status === "published" ? "published" : "draft");

  if (!payload.title.trim() && payload.status === "published") fail("--title is required when publishing.");
  if (!payload.markdown.trim() && payload.status === "published") fail("--file is required when publishing empty content.");
  if (isCreate && markdown === undefined) fail("create requires --file <path> or --file -.");

  const saved = await client.save(payload);
  const savedIdentity = saved.slug || payload.draftId;
  if (booleanFlag(flags, "pin")) await client.pin(savedIdentity, true);
  if (booleanFlag(flags, "unpin")) await client.pin(savedIdentity, false);
  return saved;
}

export function helpText() {
  return `michel-blog - write Michel's blog from Codex or a terminal

Usage:
  michel-blog list [--status all|draft|published] [--json]
  michel-blog get <slug-or-draft-id> [--output FILE] [--json]
  michel-blog create --title TITLE --file FILE [--format md|html] [--publish]
  michel-blog update <slug-or-draft-id> [--file FILE] [metadata options]
  michel-blog publish <slug-or-draft-id> [--file FILE]
  michel-blog delete <slug-or-draft-id> --yes
  michel-blog pin <slug-or-draft-id>
  michel-blog unpin <slug-or-draft-id>

Content:
  --file FILE              Read Markdown or HTML; use - for stdin
  --format md|html         Optional; otherwise inferred from file extension
  --title TITLE            Post title
  --slug SLUG              Stable public slug
  --category NAME          Category (default: Notes)
  --tags a,b,c             Comma-separated tags
  --date YYYY-MM-DD        Publication date
  --excerpt TEXT           Manual summary; omit to use automatic summary
  --summarize              Generate an automatic summary
  --annotate               Generate automatic terminology annotations
  --defer-enrichment       Queue summary/annotations after publish (default)
  --pin / --unpin          Update the pinned shelf after saving

Connection:
  --url URL                Default: MICHEL_BLOG_URL or ${DEFAULT_URL}
  --password-file FILE     Or set MICHEL_BLOG_PASSWORD_FILE
  MICHEL_BLOG_PASSWORD     Preferred for one-off automation

Examples:
  michel-blog create --title "Training notes" --file post.md
  michel-blog create --title "Interactive demo" --file post.html --publish
  cat post.md | michel-blog update training-notes --file -
  michel-blog publish training-notes --pin
`;
}

export async function run(argv, dependencies = {}) {
  const { positional, flags } = parseArgv(argv);
  const command = positional[0];
  if (!command || ["help", "-h", "--help"].includes(command) || booleanFlag(flags, "help")) {
    process.stdout.write(helpText());
    return;
  }

  const password = dependencies.password ?? await loadPassword(flags);
  const client = dependencies.client || new BlogClient({
    baseUrl: flag(flags, "url") || process.env.MICHEL_BLOG_URL || DEFAULT_URL,
    password,
    fetchImpl: dependencies.fetchImpl || fetch
  });
  const identity = positional[1];

  if (command === "list") {
    const status = String(flag(flags, "status") || "all");
    if (!["all", "draft", "published"].includes(status)) fail("--status must be all, draft, or published.");
    const result = await client.list(status);
    if (booleanFlag(flags, "json")) printJson(result.posts);
    else printPostList(result.posts);
    return;
  }

  if (command === "get") {
    if (!identity) fail("get requires a slug or draft id.");
    const result = await client.get(identity);
    const output = flag(flags, "output");
    if (output) await writeFile(path.resolve(output), result.post.markdown || "", "utf8");
    else if (booleanFlag(flags, "json")) printJson(result.post);
    else process.stdout.write(String(result.post.markdown || ""));
    return;
  }

  if (["create", "update", "edit", "publish"].includes(command)) {
    if (command !== "create" && !identity) fail(`${command} requires a slug or draft id.`);
    const result = await saveCommand(client, command === "edit" ? "update" : command, identity, flags);
    if (booleanFlag(flags, "json")) printJson(result);
    else process.stdout.write(`${result.status}: ${result.slug}\n${client.baseUrl}/${String(result.url || "").replace(/^\.\//, "")}\n`);
    return;
  }

  if (command === "delete") {
    if (!identity) fail("delete requires a slug or draft id.");
    if (!booleanFlag(flags, "yes")) fail("Refusing to delete without --yes.");
    const result = await client.delete(identity);
    if (booleanFlag(flags, "json")) printJson(result.deleted);
    else process.stdout.write(`Deleted: ${result.deleted.title} (${result.deleted.status})\n`);
    return;
  }

  if (["pin", "unpin"].includes(command)) {
    if (!identity) fail(`${command} requires a slug or draft id.`);
    const result = await client.pin(identity, command === "pin");
    if (booleanFlag(flags, "json")) printJson(result);
    else process.stdout.write(`${command === "pin" ? "Pinned" : "Unpinned"}: ${result.slug}\n`);
    return;
  }

  fail(`Unknown command: ${command}\n\n${helpText()}`);
}

function executablePath(value) {
  if (!value) return "";
  try {
    return realpathSync(path.resolve(value));
  } catch {
    return path.resolve(value);
  }
}

const isMain = executablePath(process.argv[1]) === executablePath(fileURLToPath(import.meta.url));
if (isMain) {
  run(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`michel-blog: ${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  });
}
