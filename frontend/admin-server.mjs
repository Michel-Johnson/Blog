#!/usr/bin/env node
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  countWritingCharacters,
  previousWritingCharacters,
  updateWritingPostCounts,
  writingIdentities
} from "./lib/writing-activity.mjs";
import {
  applyGeneratedAnnotations,
  applyGeneratedAnnotationsToHtml,
  mergeAnnotationDefinitions,
  removeGeneratedAnnotations,
  removeGeneratedHtmlAnnotations
} from "./lib/auto-annotations.mjs";
import { encodeIntentionalParagraphIndents } from "./lib/markdown-indentation.mjs";
import { serializeAuthoredPostsBundle } from "./lib/authored-post-bundle.mjs";
import { trimTrailingEmptyContent } from "./lib/trailing-content.mjs";
import { AiRateLimiter, estimateTokenBudget } from "./lib/ai-rate-limit.mjs";
import { buildReaderAssistantSystemPrompt } from "./lib/reader-assistant-prompt.mjs";
import { atomicWriteFile, atomicWriteJson } from "./lib/atomic-file.mjs";
import { DraftCoordinator } from "./lib/draft-coordinator.mjs";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DATA_ROOT = path.resolve(process.env.BLOG_DATA_ROOT || ROOT);
const CONTENT_ROOT = path.join(BLOG_DATA_ROOT, "content");
const STATE_ROOT = path.join(BLOG_DATA_ROOT, "data");
const UPLOAD_ROOT = path.join(BLOG_DATA_ROOT, "uploads");
const AUTHORED_BUNDLE_FILE = path.join(STATE_ROOT, "authored-posts.js");
const PINNED_BUNDLE_FILE = path.join(STATE_ROOT, "pinned-posts.js");
const DRAFT_COMMIT_FILE = path.join(STATE_ROOT, "draft-commit.json");
const PORT = Number(process.env.ADMIN_PORT || 8787);
const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 40 * 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const PASSWORD = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
const PASSWORD_WAS_GENERATED = !process.env.ADMIN_PASSWORD;
const sessions = new Map();
const POST_VIEWS_FILE = process.env.POST_VIEWS_FILE || path.join(STATE_ROOT, "post-views.json");
let postViewMutationQueue = Promise.resolve();
const draftCoordinator = new DraftCoordinator({
  leaseTtlMs: Number(process.env.DRAFT_LEASE_TTL_MS || 20_000)
});
const ZHIPU_API_KEY = String(process.env.ZHIPU_API_KEY || "").trim();
const ASSISTANT_ENDPOINT = process.env.ASSISTANT_ENDPOINT || "https://open.bigmodel.cn/api/anthropic/v1/messages";
const GLM_MODEL = String(process.env.ZHIPU_MODEL || "glm-5.3").trim();
const ASSISTANT_MAX_TOKENS = Math.max(2048, Number(process.env.ASSISTANT_MAX_TOKENS || 8192) || 8192);
const WEB_SEARCH_ENDPOINT = process.env.ZHIPU_WEB_SEARCH_ENDPOINT || "https://open.bigmodel.cn/api/paas/v4/web_search";
const WEB_SEARCH_API_KEY = String(process.env.ZHIPU_WEB_SEARCH_API_KEY || ZHIPU_API_KEY).trim();
const assistantLimiter = new AiRateLimiter({
  windowMs: Number(process.env.ASSISTANT_RATE_WINDOW_MS || 60_000),
  clientQpm: Number(process.env.ASSISTANT_CLIENT_QPM || 6),
  clientTpm: Number(process.env.ASSISTANT_CLIENT_TPM || 50_000),
  globalQpm: Number(process.env.ASSISTANT_GLOBAL_QPM || 60),
  globalTpm: Number(process.env.ASSISTANT_GLOBAL_TPM || 300_000),
  maxConcurrent: Number(process.env.ASSISTANT_MAX_CONCURRENT || 2)
});

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

const IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"]
]);
const UPLOAD_TYPES = new Map([
  ...IMAGE_TYPES,
  ["application/pdf", ".pdf"]
]);

class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const LEGACY_BASE_URL = process.env.LEGACY_POST_BASE_URL || "https://micheljohnson.top";
const ENV_MARKDOWN_ROOTS = String(process.env.ADMIN_MARKDOWN_ROOTS || process.env.HEXO_SOURCE_ROOT || "")
  .split(path.delimiter)
  .flatMap((item) => item.split(","))
  .map((item) => item.trim())
  .filter(Boolean);

function hash(value) {
  return createHash("sha256").update(String(value)).digest();
}

function equalSecret(a, b) {
  const left = hash(a);
  const right = hash(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(body));
}

function text(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function cookieHeader(name, value, maxAge) {
  const secure = process.env.ADMIN_COOKIE_SECURE === "1" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getSession(req) {
  const token = parseCookies(req).mj_admin;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, ...session };
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { error: "Not logged in" });
    return null;
  }
  if (req.method !== "GET") {
    const csrf = req.headers["x-csrf-token"];
    if (!csrf || csrf !== session.csrfToken) {
      json(res, 403, { error: "Invalid CSRF token" });
      return null;
    }
  }
  return session;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function requestIp(req) {
  const remote = String(req.socket.remoteAddress || "");
  const isLoopbackProxy = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  // The service only listens on 127.0.0.1. Trust exactly the address appended
  // by that local Nginx proxy; any client-supplied X-Forwarded-For value stays
  // earlier in the chain and cannot choose the limiter key.
  return isLoopbackProxy && forwarded.length ? forwarded.at(-1) : remote || "unknown";
}

function assistantLimitError(res, rejection) {
  const unit = rejection.kind === "tpm" ? "token budget" : rejection.kind === "qpm" ? "question limit" : "concurrent request limit";
  const subject = rejection.scope === "global" ? "The blog's" : "Your";
  json(res, 429, {
    error: `${subject} ${unit} has been reached. Please try again shortly.`,
    code: `assistant_${rejection.scope}_${rejection.kind}_limit`,
    retryAfter: rejection.retryAfter
  }, {
    "Retry-After": String(rejection.retryAfter),
    "X-RateLimit-Limit": String(rejection.limit),
    "X-RateLimit-Scope": rejection.scope,
    "X-RateLimit-Policy": rejection.kind
  });
}

function cleanAssistantMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).flatMap((item) => {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    const content = String(item?.content || "").trim().slice(0, 6000);
    return role && content ? [{ role, content }] : [];
  });
}

function assistantTextDelta(event) {
  if (event?.type !== "content_block_delta") return "";
  return event?.delta?.type === "text_delta" ? String(event.delta.text || "") : "";
}

function redactAssistantError(error) {
  return String(error?.message || error || "")
    .replaceAll(ZHIPU_API_KEY, "[redacted]")
    .slice(0, 800);
}

function assistantClientError(error) {
  const message = String(error?.message || "");
  if (error?.name === "AbortError") return "Assistant request timed out";
  if (/GLM (?:upstream|summary|annotation) error (?:401|403)/i.test(message)) return "Assistant authentication failed";
  if (/GLM (?:upstream|summary|annotation) error 429/i.test(message)) return "GLM is rate-limited. Please try again later.";
  if (/GLM (?:upstream|summary|annotation) error 402|insufficient|quota|balance|余额/i.test(message)) return "GLM quota is unavailable.";
  if (/GLM (?:upstream|summary|annotation) error/i.test(message)) return "GLM is temporarily unavailable. Please try again in a moment.";
  return "Assistant request failed";
}

async function handleAssistant(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!ZHIPU_API_KEY) {
    json(res, 503, { error: "Assistant is not configured" });
    return;
  }
  let slot = null;
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 90000);
  res.on("close", () => aborter.abort());
  try {
    const body = await readJson(req);
    const question = String(body.question || "").trim().slice(0, 2000);
    if (!question) {
      json(res, 400, { error: "Question is required" });
      return;
    }
    const title = String(body.title || "Untitled article").trim().slice(0, 300);
    const article = String(body.article || "").trim().slice(0, 24000);
    const pageUrl = String(body.url || "").trim().slice(0, 1000);
    const selectedText = String(body.selectedText || "").trim().slice(0, 4000);
    const contextBefore = String(body.contextBefore || "").trim().slice(0, 4000);
    const contextAfter = String(body.contextAfter || "").trim().slice(0, 4000);
    const selectionOrigin = body.selectionOrigin === "assistant" ? "assistant" : "article";
    // The client owns the transient conversation tree, but sends only the
    // selected root-to-leaf branch. Sibling branches never enter model context.
    const history = cleanAssistantMessages(body.branchPath ?? body.messages);
    const selectionContext = selectedText
      ? `\n\nPRIVATE READER CONTEXT (hidden from the conversation UI)\nText before selection: ${contextBefore || "(none)"}\nSelected passage: ${selectedText}\nText after selection: ${contextAfter || "(none)"}`
      : "";
    const groundedQuestion = selectedText
      ? `Answer the visitor's question specifically about this quoted passage. The quoted passage comes from ${selectionOrigin === "assistant" ? "your previous answer in this conversation" : "the article"}. Do not say the question is ambiguous or ask what it refers to. ${selectionOrigin === "assistant" ? "Do not describe or imply that the quoted passage came from the article. Refer to it as the quoted passage or the previous answer." : ""}\n\nQuoted passage: ${selectedText}\n\nVisitor question: ${question}`
      : question;
    const articleContext = selectedText
      ? "The visitor selected a passage. Use the private passage context below instead of re-reading the full article."
      : article || "No article text was available.";
    const tokenBudget = estimateTokenBudget([
      title,
      pageUrl,
      articleContext,
      selectionContext,
      groundedQuestion,
      ...history.map((message) => message.content)
    ], ASSISTANT_MAX_TOKENS + 800);
    slot = assistantLimiter.reserve(requestIp(req), tokenBudget);
    if (!slot.ok) {
      assistantLimitError(res, slot);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ status: "connecting" })}\n\n`);
    const upstream = await fetch(ASSISTANT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ZHIPU_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      signal: aborter.signal,
      body: JSON.stringify({
        model: GLM_MODEL,
        stream: true,
        max_tokens: ASSISTANT_MAX_TOKENS,
        temperature: 0.4,
        thinking: { type: "disabled" },
        system: buildReaderAssistantSystemPrompt({
          title,
          pageUrl,
          articleContext,
          selectionContext
        }),
        messages: [...history, { role: "user", content: groundedQuestion }]
      })
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      throw new Error(`GLM upstream error ${upstream.status}: ${detail.slice(0, 300)}`);
    }
    res.write(`data: ${JSON.stringify({ status: "generating" })}\n\n`);
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const content = assistantTextDelta(parsed);
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        } catch (_) {
          // Ignore malformed upstream keepalive chunks.
        }
      }
    }
    res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch (error) {
    console.warn(`[assistant] ${redactAssistantError(error)}`);
    const clientError = assistantClientError(error);
    if (!res.headersSent) json(res, error.name === "AbortError" ? 504 : 502, { error: clientError });
    else {
      res.write(`data: ${JSON.stringify({ error: clientError })}\n\n`);
      res.end();
    }
  } finally {
    clearTimeout(timeout);
    slot?.release();
  }
}

function assistantPayloadText(payload) {
  return Array.isArray(payload?.content)
    ? payload.content.map((item) => item?.type === "text" ? String(item.text || "") : "").join("")
    : String(payload?.content || payload?.choices?.[0]?.message?.content || "");
}

function parseJsonObject(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("GLM returned invalid annotation JSON");
  return JSON.parse(source.slice(first, last + 1));
}

async function callGlmJson(system, content, maxTokens = 1200) {
  if (!ZHIPU_API_KEY) throw new Error("GLM annotations are not configured");
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 90000);
  try {
    const upstream = await fetch(ASSISTANT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ZHIPU_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      signal: aborter.signal,
      body: JSON.stringify({
        model: GLM_MODEL,
        stream: false,
        max_tokens: maxTokens,
        temperature: 0.1,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content }]
      })
    });
    if (!upstream.ok) throw new Error(`GLM annotation error ${upstream.status}`);
    return parseJsonObject(assistantPayloadText(await upstream.json()));
  } finally {
    clearTimeout(timeout);
  }
}

async function searchTerm(query) {
  if (!WEB_SEARCH_API_KEY || !query) return [];
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 12000);
  try {
    const upstream = await fetch(WEB_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WEB_SEARCH_API_KEY}`
      },
      signal: aborter.signal,
      body: JSON.stringify({
        search_query: String(query).slice(0, 70),
        search_engine: "search_std",
        count: 3,
        search_intent: false,
        search_recency_filter: "noLimit",
        content_size: "medium",
        request_id: `annotation-${Date.now()}`,
        user_id: "michel-blog"
      })
    });
    if (!upstream.ok) throw new Error(`web search error ${upstream.status}`);
    const payload = await upstream.json();
    const results = payload?.search_result || payload?.data?.search_result || payload?.data || [];
    return (Array.isArray(results) ? results : []).slice(0, 3).map((item) => ({
      title: String(item?.title || "").slice(0, 160),
      content: String(item?.content || item?.snippet || "").slice(0, 800),
      url: String(item?.link || item?.url || "")
    }));
  } catch (error) {
    console.warn(`[annotations] search skipped: ${redactAssistantError(error)}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function generatePostAnnotations(title, markdown) {
  const article = String(removeGeneratedAnnotations(markdown) || "").slice(0, 30000);
  if (!article.trim()) return [];
  const annotationTarget = Math.max(8, Math.min(18, Math.ceil(article.length / 1200) + 6));
  const extracted = await callGlmJson(
    "Select useful annotation targets throughout the supplied article. Cover technical terms, algorithms, statistical concepts, abbreviations, named concepts, people, works, places, and uncommon phrases that a curious reader may want explained. Do not restrict the selection to only the most central terms, but never select generic words or repeat the same concept. Spread selections across sections and avoid clusters that would make a paragraph hard to read or select. Return strict JSON only: {\"items\":[{\"term\":\"exact article text\",\"left\":\"up to 12 exact characters immediately before\",\"right\":\"up to 12 exact characters immediately after\",\"query\":\"optional web search query\",\"needsWeb\":true}]}. The term and context must be copied exactly so the publisher can locate one occurrence.",
    `Target approximately ${annotationTarget} annotations, using fewer only when the article genuinely has fewer useful targets.\n\nTitle: ${String(title || "Untitled").slice(0, 300)}\n\nArticle:\n${article}`,
    2200
  );
  const selected = (Array.isArray(extracted?.items) ? extracted.items : []).slice(0, annotationTarget).map((item, index) => ({
    id: `term-${index + 1}`,
    term: String(item?.term || ""),
    left: String(item?.left || ""),
    right: String(item?.right || ""),
    query: String(item?.query || ""),
    needsWeb: item?.needsWeb === true
  }));
  const evidence = await Promise.all(selected.map(async (item) => ({
    ...item,
    search: item?.needsWeb ? await searchTerm(item.query || item.term) : []
  })));
  const synthesized = await callGlmJson(
    "Write compact hover definitions for selected terms from a blog article. Use article context first and web evidence only when supplied. Return strict JSON only: {\"items\":[{\"id\":\"term-1\",\"title\":\"short title\",\"body\":\"definition\",\"url\":\"best source URL or empty\",\"label\":\"reference label\"}]}. Return exactly one item for each supplied id. Never repeat or rewrite the term or its context. Each body must be a complete sentence in the article language and no more than 50 Unicode characters. Do not invent facts.",
    JSON.stringify({ title, article, candidates: evidence }),
    2800
  );
  return mergeAnnotationDefinitions(selected, synthesized?.items);
}

async function explainSelectedTerm(title, markdown, selectedText, contextBefore, contextAfter) {
  const term = String(selectedText || "").trim().slice(0, 300);
  if (!term) throw new Error("Selected text is required");
  const search = await searchTerm(term);
  const result = await callGlmJson(
    "Explain one selected term or phrase from a blog draft. Use the draft context first and supplied web evidence when useful. Return strict JSON only: {\"title\":\"short heading\",\"body\":\"compact explanation\",\"url\":\"best source URL or empty\",\"label\":\"short source label or empty\"}. Match the article language. The explanation must be accurate, self-contained, and concise enough for an inline hover note.",
    JSON.stringify({
      articleTitle: String(title || "Untitled").slice(0, 300),
      term,
      contextBefore: String(contextBefore || "").slice(-600),
      contextAfter: String(contextAfter || "").slice(0, 600),
      article: String(removeGeneratedAnnotations(markdown) || "").slice(0, 12000),
      search
    }),
    900
  );
  const body = String(result?.body || "").trim();
  if (!body) throw new Error("AI returned an empty explanation");
  return {
    type: "definition",
    title: String(result?.title || term).trim().slice(0, 120),
    body: body.slice(0, 1200),
    label: String(result?.label || "").trim().slice(0, 80),
    url: String(result?.url || "").trim().slice(0, 1000),
    origin: "glm"
  };
}

async function generatePostSummary(title, markdown) {
  if (!ZHIPU_API_KEY) throw new Error("GLM summary is not configured");
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 90000);
  try {
    const articlePrompt = `Title: ${String(title || "Untitled").slice(0, 300)}\n\nArticle:\n${String(markdown || "").slice(0, 30000)}`;
    let previous = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const correction = previous
        ? `\n\nThe previous draft was invalid because it was too long, incomplete, or used an ellipsis:\n${previous}\nRewrite it as a complete sentence within the exact length limit.`
        : "";
      const upstream = await fetch(ASSISTANT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ZHIPU_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        signal: aborter.signal,
        body: JSON.stringify({
          model: GLM_MODEL,
          stream: false,
          max_tokens: 256,
          temperature: 0.1,
          thinking: { type: "disabled" },
          system: "Write a concise but informative article summary in the article's language. Return only one or two complete plain-text sentences. Cover the article's central theme plus at least two concrete aspects, stages, experiences, arguments, or conclusions that are genuinely present in the source. Prefer a coherent overview over a list of keywords, and do not merely repeat the title. Preserve the author's meaning; avoid Markdown, headings, labels, quotation marks, invented details, ellipses, and truncated phrases. For Chinese, stay within 45-90 Chinese characters including punctuation. For English, write 24-45 words including punctuation. End naturally.",
          messages: [{ role: "user", content: `${articlePrompt}${correction}` }]
        })
      });
      if (!upstream.ok) throw new Error(`GLM summary error ${upstream.status}`);
      const payload = await upstream.json();
      const summary = Array.isArray(payload?.content)
        ? payload.content.map((item) => item?.type === "text" ? String(item.text || "") : "").join("")
        : String(payload?.content || payload?.choices?.[0]?.message?.content || "");
      previous = summary.replace(/\s+/g, " ").trim().replace(/^(summary|摘要)\s*[:：]\s*/i, "");
      if (autoSummaryFits(previous)) return previous;
    }
    const compacted = compactAutoSummary(previous);
    if (compacted) return compacted;
    throw new Error("GLM could not produce a complete summary within the length limit");
  } finally {
    clearTimeout(timeout);
  }
}

function autoSummaryFits(value) {
  const text = String(value || "").trim();
  if (!text || /…|\.\.\./u.test(text)) return false;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) {
    const length = Array.from(text).length;
    return length >= 45 && length <= 90 && /[。！？!?]$/u.test(text);
  }
  const length = text.split(/\s+/u).filter(Boolean).length;
  return length >= 24 && length <= 45 && /[.!?]$/u.test(text);
}

function compactAutoSummary(value) {
  const text = String(value || "")
    .replace(/…|\.\.\./gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) {
    const chars = Array.from(text);
    if (chars.length <= 90) return /[。！？!?]$/u.test(text) ? text : `${text.replace(/[，、：:；;。！？!?\s]+$/u, "")}。`;
    const window = chars.slice(0, 90).join("");
    const punctuation = [...window.matchAll(/[。！？!?；;]/g)]
      .map((match) => match.index + 1)
      .filter((index) => index >= 45);
    if (punctuation.length) return chars.slice(0, punctuation.at(-1)).join("");
    const clause = window.match(/^.{45,89}?[，、：:；;]/u)?.[0];
    if (clause) return `${clause.replace(/[，、：:；;\s]+$/u, "")}。`;
    return `${chars.slice(0, 89).join("").replace(/[，、：:；;。！？!?\s]+$/u, "")}。`;
  }
  const words = text.split(/\s+/u);
  if (words.length <= 45) return /[.!?]$/u.test(text) ? text : `${text.replace(/[,;:.!?]+$/u, "")}.`;
  return `${words.slice(0, 44).join(" ").replace(/[,;:.!?]+$/u, "")}.`;
}

async function readJson(req) {
  const body = await readBody(req, MAX_JSON);
  return body.length ? JSON.parse(body.toString("utf8")) : {};
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || `post-${Date.now()}`;
}

function cleanFileBase(value) {
  return String(value || "image")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
}

function publicDate(value) {
  const input = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input.replaceAll("-", "/");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(input)) return input;
  const datePrefix = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(input);
  if (datePrefix) return `${datePrefix[1]}/${datePrefix[2]}/${datePrefix[3]}`;
  return new Date().toISOString().slice(0, 10).replaceAll("-", "/");
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.map((item) => path.resolve(item))));
}

function editableMarkdownRoots() {
  const roots = [
    path.join(CONTENT_ROOT, "posts"),
    path.join(CONTENT_ROOT, "drafts"),
    path.join(ROOT, "source", "_posts"),
    path.join(ROOT, "source", "_drafts"),
    path.resolve(ROOT, "..", "website", "source", "_posts"),
    path.resolve(ROOT, "..", "website", "source", "_drafts"),
    path.resolve(ROOT, "..", "hexo", "source", "_posts"),
    path.resolve(ROOT, "..", "hexo", "source", "_drafts"),
    path.resolve(ROOT, "..", "blog", "source", "_posts"),
    path.resolve(ROOT, "..", "blog", "source", "_drafts"),
    "/home/www/website/source/_posts",
    "/home/www/website/source/_drafts",
    ...ENV_MARKDOWN_ROOTS.flatMap((root) => [
      root,
      path.join(root, "source", "_posts"),
      path.join(root, "source", "_drafts")
    ])
  ];
  return uniquePaths(roots);
}

function markdownDisplayPath(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(ROOT, absolute);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative
    : absolute;
}

function resolveEditableMarkdownPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const absolute = path.resolve(ROOT, raw);
  const roots = editableMarkdownRoots();
  if (!/\.md(?:own)?$/i.test(absolute)) return "";
  const allowed = roots.some((root) => absolute === root || absolute.startsWith(`${root}${path.sep}`));
  return allowed ? absolute : "";
}

function isoDate(value) {
  return publicDate(value).replaceAll("/", "-");
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[#>*_`~|$\\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(parseInt(number, 10)));
}

function markdownEscapeText(value) {
  return decodeHtml(String(value || ""))
    .replace(/<a\b[^>]*class=(["'])[^"']*(?:post-anchor|markdownIt-Anchor)[^"']*\1[^>]*>\s*<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLegacyMathSource(source) {
  return String(source || "")
    .replace(/\u00a0/g, " ")
    .replace(/([xy])\{\(i\)\}/g, "$1^{(i)}")
    .replace(/tmp\\?_([wb])/g, "\\mathrm{tmp}_$1")
    .replace(/…/g, "\\dots")
    .replace(/\.\.\./g, "\\dots")
    .replace(/^L-->loss$/i, "L \\longrightarrow \\text{loss}")
    .replace(
      /^L\((f_[\s\S]+?\^\{\(i\)\})\s*,\s*(y\^\{\(i\)\})\s*\)=/,
      "L($1), $2) ="
    )
    .trim();
}

function extractRenderedKatex(html) {
  const formulas = [];
  const source = String(html || "");
  let cursor = 0;
  let output = "";

  while (cursor < source.length) {
    const openingPattern = /<span\b[^>]*>/gi;
    openingPattern.lastIndex = cursor;
    let opening = null;
    let display = false;
    for (let match = openingPattern.exec(source); match; match = openingPattern.exec(source)) {
      const classValue = /\bclass=(["'])(.*?)\1/i.exec(match[0])?.[2] || "";
      const classes = classValue.split(/\s+/);
      if (classes.includes("katex-display") || classes.includes("katex")) {
        opening = match;
        display = classes.includes("katex-display");
        break;
      }
    }
    if (!opening) {
      output += source.slice(cursor);
      break;
    }

    const spanPattern = /<span\b[^>]*>|<\/span\s*>/gi;
    spanPattern.lastIndex = opening.index + opening[0].length;
    let depth = 1;
    let closingEnd = -1;
    for (let match = spanPattern.exec(source); match; match = spanPattern.exec(source)) {
      depth += /^<span\b/i.test(match[0]) ? 1 : -1;
      if (depth === 0) {
        closingEnd = spanPattern.lastIndex;
        break;
      }
    }
    if (closingEnd < 0) {
      output += source.slice(cursor);
      break;
    }

    const rendered = source.slice(opening.index, closingEnd);
    const annotation = /<annotation\b[^>]*encoding=(["'])application\/x-tex\1[^>]*>([\s\S]*?)<\/annotation>/i.exec(rendered);
    if (!annotation) {
      output += source.slice(cursor, closingEnd);
      cursor = closingEnd;
      continue;
    }

    const placeholder = `\u0000MICHEL_MATH_${formulas.length}\u0000`;
    let tex = decodeHtml(annotation[2]).trim();
    const proseOnly = /^,?\s*the\s+cost\s+function\s*$/i.test(tex);
    if (proseOnly) {
      output += source.slice(cursor, opening.index) + tex.replace(/^\s*,?\s*/, ", ");
      cursor = closingEnd;
      continue;
    }
    tex = normalizeLegacyMathSource(tex);
    formulas.push(display ? `\n\n$$${tex}$$\n\n` : `$${tex}$`);
    output += source.slice(cursor, opening.index) + placeholder;
    cursor = closingEnd;
  }

  return { html: output, formulas };
}

function htmlToMarkdown(html) {
  const extracted = extractRenderedKatex(html);
  let output = extracted.html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<span\b[^>]*id=(["'])more\1[^>]*>\s*<\/span>/gi, "\n\n")
    .replace(/<a\b[^>]*class=(["'])[^"']*(?:post-anchor|markdownIt-Anchor)[^"']*\1[^>]*>\s*<\/a>/gi, "")
    .replace(/<figure\b[^>]*class=(["'])highlight[^>]*>[\s\S]*?<pre>([\s\S]*?)<\/pre>[\s\S]*?<\/figure>/gi, (_, _quote, code) => `\n\n\`\`\`\n${stripTags(code).replace(/\n{3,}/g, "\n\n").trim()}\n\`\`\`\n\n`)
    .replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => `\n\n\`\`\`\n${decodeHtml(code).trim()}\n\`\`\`\n\n`)
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => `\n\n\`\`\`\n${stripTags(code).trim()}\n\`\`\`\n\n`)
    .replace(/<img\b([^>]*)>/gi, (_, attrs) => {
      const src = /\bsrc=(["'])(.*?)\1/i.exec(attrs)?.[2] || "";
      const alt = /\balt=(["'])(.*?)\1/i.exec(attrs)?.[2] || "image";
      return src ? `\n\n![${decodeHtml(alt)}](${decodeHtml(src)})\n\n` : "";
    })
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, textValue) => `\n\n# ${markdownEscapeText(textValue)}\n\n`)
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, textValue) => `\n\n## ${markdownEscapeText(textValue)}\n\n`)
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, textValue) => `\n\n### ${markdownEscapeText(textValue)}\n\n`)
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_, textValue) => `\n\n#### ${markdownEscapeText(textValue)}\n\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, textValue) => {
      const block = htmlToMarkdown(textValue)
        .split("\n")
        .map((line) => line.trim() ? `> ${line}` : ">")
        .join("\n");
      return `\n\n${block}\n\n`;
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, textValue) => {
      const href = /\bhref=(["'])(.*?)\1/i.exec(attrs)?.[2] || "";
      const text = markdownEscapeText(textValue);
      if (!href) return text;
      if (!text) return "";
      return `[${text}](${decodeHtml(href)})`;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => `\`${decodeHtml(code).trim()}\``)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `\n- ${htmlToMarkdown(item).replace(/\n+/g, " ").trim()}`)
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, textValue) => `\n\n${htmlToMarkdown(textValue).trim()}\n\n`)
    .replace(/<\/?(div|section|article|main|header|footer|table|thead|tbody|tr|td|th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeHtml(output)
    .replace(/\u0000MICHEL_MATH_(\d+)\u0000/g, (match, index) => extracted.formulas[Number(index)] ?? match)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseWindowArrayFile(filename, variableName, baseRoot = ROOT) {
  const file = path.join(baseRoot, filename);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const pattern = new RegExp(`window\\.${variableName}\\s*=\\s*([\\s\\S]*?);\\s*$`);
  const match = pattern.exec(text);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return [];
  }
}

async function writeWindowArrayFile(filename, variableName, items) {
  const file = path.join(ROOT, filename);
  const output = `window.${variableName} = ${JSON.stringify(items, null, 2)};\n`;
  await writeFile(`${file}.tmp`, output, "utf8");
  await rename(`${file}.tmp`, file);
}

async function writeRuntimeWindowArrayFile(file, variableName, items) {
  const output = `window.${variableName} = ${JSON.stringify(items, null, 2)};\n`;
  await atomicWriteFile(file, output, { encoding: "utf8" });
}

async function annotateLegacyPost(slug) {
  const posts = parseWindowArrayFile("posts.js", "MICHEL_POSTS");
  const index = posts.findIndex((post) => String(post?.slug || "") === String(slug || ""));
  if (index < 0) return null;
  const current = posts[index];
  const baseHtml = removeGeneratedHtmlAnnotations(String(current.content || ""));
  const articleMarkdown = htmlToMarkdown(baseHtml);
  const candidates = await generatePostAnnotations(current.title, articleMarkdown);
  const content = applyGeneratedAnnotationsToHtml(baseHtml, candidates);
  const annotationsGenerated = (content.match(/#michel-note-v1:/g) || []).length;
  posts[index] = { ...current, content };
  await writeWindowArrayFile("posts.js", "MICHEL_POSTS", posts);
  return {
    slug: current.slug,
    title: current.title,
    annotationsGenerated,
    terms: candidates.map((candidate) => candidate.term)
  };
}

function isAiPost(post) {
  const category = String(post?.category || "").trim().toLowerCase();
  const tags = Array.isArray(post?.tags)
    ? post.tags
    : String(post?.tags || "").split(/[,，\s]+/);
  return Boolean(post?.ai)
    || category === "ai"
    || tags.some((tag) => String(tag || "").trim().toLowerCase() === "ai");
}

function normalizedSourcePath(value) {
  try {
    return new URL(String(value || ""), LEGACY_BASE_URL).pathname.replace(/\/$/, "");
  } catch (_) {
    return String(value || "").replace(/\/$/, "");
  }
}

async function backfillLegacySummaries() {
  const allPosts = parseWindowArrayFile("all-posts.js", "MICHEL_ALL_POSTS");
  const featuredPosts = parseWindowArrayFile("posts.js", "MICHEL_POSTS");
  const authoredPosts = await loadAuthoredIndex();
  const authoredKeys = new Set(authoredPosts.map((post) => slugify(post.slug || post.title)));
  const eligible = allPosts.filter((post) => (
    !isAiPost(post)
    && post.excerptMode !== "manual"
    && !authoredKeys.has(slugify(post.slug || post.title))
  ));
  const results = [];

  for (const post of eligible) {
    const sourcePath = normalizedSourcePath(post.source);
    const featured = featuredPosts.find((candidate) => (
      normalizedSourcePath(candidate.source) === sourcePath
      || (candidate.title === post.title && candidate.date === post.date)
    ));
    try {
      const markdown = featured?.content
        ? htmlToMarkdown(featured.content)
        : await loadLegacyMarkdown(post);
      const contentHash = createHash("sha256").update(`${post.title}\n${markdown}`).digest("hex");
      const excerpt = await generatePostSummary(post.title, markdown);
      Object.assign(post, { excerpt, excerptMode: "auto", summaryContentHash: contentHash });
      if (featured) Object.assign(featured, { excerpt, excerptMode: "auto", summaryContentHash: contentHash });
      results.push({ slug: post.slug, ok: true });
      console.log(`[summary] updated ${post.slug}`);
    } catch (error) {
      results.push({ slug: post.slug, ok: false, error: error.message });
      console.warn(`[summary] skipped ${post.slug}: ${error.message}`);
    }
  }

  await writeWindowArrayFile("all-posts.js", "MICHEL_ALL_POSTS", allPosts);
  await writeWindowArrayFile("posts.js", "MICHEL_POSTS", featuredPosts);
  return results;
}

function legacyPosts() {
  const featured = parseWindowArrayFile("posts.js", "MICHEL_POSTS");
  const all = parseWindowArrayFile("all-posts.js", "MICHEL_ALL_POSTS");
  const bySlug = new Map();
  [...all, ...featured].forEach((post) => {
    if (!post?.slug) return;
    const key = slugify(post.slug);
    bySlug.set(key, { ...(bySlug.get(key) || {}), ...post, slug: post.slug });
  });
  return bySlug;
}

function legacySourceUrl(source) {
  if (!source) return "";
  try {
    return new URL(source, LEGACY_BASE_URL).toString();
  } catch (_) {
    return "";
  }
}

function extractLegacyArticleHtml(pageHtml) {
  const html = String(pageHtml || "");
  const candidates = [
    {
      tag: "div",
      pattern: /<div\b(?=[^>]*class=(["'])[^"']*post-body[^"']*\1)(?=[^>]*itemprop=(["'])articleBody\2)[^>]*>/i
    },
    {
      tag: "div",
      pattern: /<div\b(?=[^>]*itemprop=(["'])articleBody\1)(?=[^>]*class=(["'])[^"']*post-body[^"']*\2)[^>]*>/i
    },
    {
      tag: "div",
      pattern: /<div\b[^>]*class=(["'])[^"']*(?:post-content|entry-content|article-content|post-body|markdown-body)[^"']*\1[^>]*>/i
    },
    {
      tag: "article",
      pattern: /<article\b[^>]*class=(["'])[^"']*(?:post-content|article-content|markdown-body)[^"']*\1[^>]*>/i
    },
    {
      tag: "article",
      pattern: /<article\b[^>]*>/i
    },
    {
      tag: "main",
      pattern: /<main\b[^>]*>/i
    }
  ];

  for (const { tag, pattern } of candidates) {
    const match = pattern.exec(html);
    const body = match ? extractElementInnerHtml(html, match, tag) : "";
    if (body && stripTags(body).trim().length > 20) return body;
  }
  return "";
}

function extractElementInnerHtml(html, startMatch, tagName) {
  if (!startMatch) return "";
  const startIndex = startMatch.index;
  const startEnd = startIndex + startMatch[0].length;
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    const token = match[0];
    const isClose = /^<\//.test(token);
    const selfClosing = /\/>$/.test(token);
    if (isClose) {
      depth -= 1;
      if (depth === 0) return html.slice(startEnd, match.index);
      continue;
    }
    if (!selfClosing) depth += 1;
  }
  return html.slice(startEnd);
}

async function loadLegacyMarkdown(post) {
  if (post.markdown) return String(post.markdown);
  if (post.content) return htmlToMarkdown(post.content);
  const source = legacySourceUrl(post.source);
  if (!source) throw new Error("Legacy post has no readable source");
  const response = await fetch(source, {
    headers: {
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) throw new Error(`Legacy source returned ${response.status}`);
  const html = await response.text();
  const article = extractLegacyArticleHtml(html) || html;
  const markdown = htmlToMarkdown(article);
  if (!markdown) throw new Error("Legacy source did not contain editable content");
  return markdown;
}

async function getLegacyPostBySlug(slug) {
  const normalized = slugify(slug);
  const post = legacyPosts().get(normalized);
  if (!post) return null;
  const markdown = await loadLegacyMarkdown(post);
  const originalSlug = String(post.slug || post.title || "").trim();
  const canonicalSlug = slugify(post.slug || post.title);
  return {
    slug: canonicalSlug,
    originalSlug,
    aliases: Array.from(new Set([originalSlug, canonicalSlug].filter(Boolean))),
    category: post.category || "Notes",
    date: publicDate(post.date),
    title: post.title || "Untitled",
    excerpt: String(post.excerpt || "").trim() || stripMarkdown(markdown).slice(0, 180),
    excerptMode: post.excerptMode === "auto" ? "auto" : "manual",
    summaryContentHash: String(post.summaryContentHash || "").trim(),
    tags: Array.isArray(post.tags) ? post.tags : [],
    markdown,
    authored: false,
    status: "published",
    legacySource: post.source || "",
    importedFromLegacy: true
  };
}

function frontmatter(post) {
  const lines = [
    "---",
    `title: ${JSON.stringify(post.title)}`,
    `date: ${isoDate(post.date)}`,
    `category: ${JSON.stringify(post.category)}`,
    `tags: [${post.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`,
    `slug: ${JSON.stringify(post.slug)}`,
    `originalSlug: ${JSON.stringify(post.originalSlug || "")}`,
    `aliases: ${JSON.stringify(Array.isArray(post.aliases) ? post.aliases : [])}`,
    `draftId: ${JSON.stringify(post.draftId || "")}`,
    `status: ${JSON.stringify(post.status)}`,
    `revision: ${Math.max(0, Number(post.revision || 0))}`,
    `createdAt: ${JSON.stringify(post.createdAt || "")}`,
    `updatedAt: ${JSON.stringify(post.updatedAt || "")}`,
    `updatedBy: ${JSON.stringify(post.updatedBy || "")}`,
    `contentFormat: ${JSON.stringify(post.contentFormat || "markdown")}`,
    `excerpt: ${JSON.stringify(post.excerpt || "")}`,
    `excerptMode: ${JSON.stringify(post.excerptMode || "manual")}`,
    `summaryContentHash: ${JSON.stringify(post.summaryContentHash || "")}`,
    `annotationContentHash: ${JSON.stringify(post.annotationContentHash || "")}`,
    "---",
    ""
  ];
  return `${lines.join("\n")}${post.markdown || ""}\n`;
}

async function loadAuthoredIndex() {
  const file = path.join(STATE_ROOT, "authored-posts.json");
  let loaded = null;
  if (existsSync(file)) {
    try {
      const posts = JSON.parse(await readFile(file, "utf8"));
      if (Array.isArray(posts)) loaded = posts;
      else throw new Error("authored index is not an array");
    } catch (error) {
      const quarantined = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      await rename(file, quarantined).catch(() => {});
      console.error(`[storage] quarantined malformed authored index: ${quarantined} (${error.message})`);
    }
  }
  if (loaded) return recoverPendingDraftCommit(loaded);
  const recovered = await recoverAuthoredIndexFromContent();
  if (recovered.length) {
    await writeAuthoredIndex(recovered);
    console.warn(`[storage] rebuilt authored index from ${recovered.length} content files`);
  }
  return recoverPendingDraftCommit(recovered);
}

const PINNED_POSTS_FILE = path.join(STATE_ROOT, "pinned-posts.json");

async function loadPinnedPosts() {
  if (!existsSync(PINNED_POSTS_FILE)) {
    const runtimePins = parseWindowArrayFile("pinned-posts.js", "MICHEL_PINNED_POSTS", STATE_ROOT);
    return (runtimePins.length ? runtimePins : parseWindowArrayFile("pinned-posts.js", "MICHEL_PINNED_POSTS"))
      .map((slug) => slugify(slug))
      .filter(Boolean);
  }
  try {
    const pins = JSON.parse(await readFile(PINNED_POSTS_FILE, "utf8"));
    return Array.from(new Set((Array.isArray(pins) ? pins : []).map((slug) => slugify(slug)).filter(Boolean)));
  } catch (_) {
    return [];
  }
}

function emptyPostViews() {
  return { version: 1, posts: {} };
}

async function loadPostViews() {
  if (!existsSync(POST_VIEWS_FILE)) return emptyPostViews();
  try {
    const parsed = JSON.parse(await readFile(POST_VIEWS_FILE, "utf8"));
    if (parsed?.version === 1 && parsed.posts && typeof parsed.posts === "object") return parsed;
  } catch (_) {
    // Treat a malformed statistics file as empty instead of breaking the reader.
  }
  return emptyPostViews();
}

async function writePostViews(store) {
  await atomicWriteJson(POST_VIEWS_FILE, store);
}

function postViewKey(post, fallback = "") {
  return slugify(post?.slug || post?.originalSlug || fallback);
}

function postViewCount(post, store, fallback = "") {
  const key = postViewKey(post, fallback);
  return Math.max(0, Number(store?.posts?.[key]?.views || 0));
}

async function recordPostView(identity) {
  const post = await getPostBySlug(identity);
  if (!post || post.status === "draft") return null;
  const key = postViewKey(post, identity);
  if (!key) return null;

  const mutation = postViewMutationQueue.then(async () => {
    const store = await loadPostViews();
    const now = new Date().toISOString();
    const previous = store.posts[key] || {};
    store.posts[key] = {
      views: Math.max(0, Number(previous.views || 0)) + 1,
      firstViewedAt: previous.firstViewedAt || now,
      lastViewedAt: now
    };
    await writePostViews(store);
  });
  postViewMutationQueue = mutation.catch(() => {});
  await mutation;
  return { ok: true };
}

async function writePinnedPosts(pins) {
  const normalized = Array.from(new Set(pins.map((slug) => slugify(slug)).filter(Boolean)));
  await atomicWriteJson(PINNED_POSTS_FILE, normalized);
  await writeRuntimeWindowArrayFile(PINNED_BUNDLE_FILE, "MICHEL_PINNED_POSTS", normalized);
  return normalized;
}

async function setPostPinned(identity, requestedPinned) {
  const post = await getPostBySlug(identity);
  if (!post) throw new Error("Post not found");
  const canonicalSlug = slugify(post.slug || identity);
  const current = await loadPinnedPosts();
  const withoutPost = current.filter((slug) => slug !== canonicalSlug);
  const pinned = typeof requestedPinned === "boolean"
    ? requestedPinned
    : !current.includes(canonicalSlug);
  const pins = await writePinnedPosts(pinned ? [canonicalSlug, ...withoutPost] : withoutPost);
  return { slug: canonicalSlug, pinned, pins };
}

const WRITING_ACTIVITY_FILE = path.join(STATE_ROOT, "writing-activity.json");

function writingDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function writingIdentity(post) {
  return writingIdentities(post)[0] || "";
}

function emptyWritingDay() {
  return {
    characters: 0,
    draftCharacters: 0,
    publishedCharacters: 0,
    saves: 0,
    draftSaves: 0,
    publishedSaves: 0
  };
}

async function writeWritingActivity(activity) {
  await atomicWriteJson(WRITING_ACTIVITY_FILE, activity);
}

async function loadWritingActivity(posts = null) {
  if (existsSync(WRITING_ACTIVITY_FILE)) {
    try {
      const parsed = JSON.parse(await readFile(WRITING_ACTIVITY_FILE, "utf8"));
      if (parsed && parsed.version === 1 && parsed.days && parsed.postCounts) return parsed;
    } catch (_) {
      // Rebuild a malformed activity cache from the authored index.
    }
  }

  const sourcePosts = posts || await loadAuthoredIndex();
  const activity = {
    version: 1,
    initializedAt: new Date().toISOString(),
    days: {},
    postCounts: {}
  };
  sourcePosts.forEach((post) => {
    const identity = writingIdentity(post);
    if (!identity) return;
    const characters = countWritingCharacters(post.markdown);
    const status = post.status === "draft" ? "draft" : "published";
    updateWritingPostCounts(activity, post, characters, status);
    if (!characters) return;
    const key = writingDateKey(post.createdAt) || String(post.date || "").replaceAll("/", "-");
    if (!key) return;
    const day = activity.days[key] || emptyWritingDay();
    day.characters += characters;
    day[status === "draft" ? "draftCharacters" : "publishedCharacters"] += characters;
    day.saves += 1;
    day[status === "draft" ? "draftSaves" : "publishedSaves"] += 1;
    activity.days[key] = day;
  });
  await writeWritingActivity(activity);
  return activity;
}

async function recordWritingSave(previousPosts, post) {
  const activity = await loadWritingActivity(previousPosts);
  const identity = writingIdentity(post);
  if (!identity) return;
  const characters = countWritingCharacters(post.markdown);
  const previous = previousWritingCharacters(activity, post);
  const added = Math.max(0, characters - previous);
  const status = post.status === "draft" ? "draft" : "published";
  const key = writingDateKey(post.updatedAt) || writingDateKey();
  const day = activity.days[key] || emptyWritingDay();
  day.saves += 1;
  day[status === "draft" ? "draftSaves" : "publishedSaves"] += 1;
  if (added) {
    day.characters += added;
    day[status === "draft" ? "draftCharacters" : "publishedCharacters"] += added;
  }
  activity.days[key] = day;
  updateWritingPostCounts(activity, post, characters, status);
  activity.updatedAt = new Date().toISOString();
  await writeWritingActivity(activity);
}

async function publicWritingActivity() {
  const activity = await loadWritingActivity();
  return {
    version: activity.version,
    updatedAt: activity.updatedAt || activity.initializedAt || "",
    days: activity.days
  };
}

function parseFrontmatterValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw.slice(1, -1).split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return raw.replace(/^['"]|['"]$/g, "");
}

function parseMarkdownDocument(text, filePath = "") {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  const frontmatterText = match ? match[1] : "";
  const markdown = match ? source.slice(match[0].length).trim() : source.trim();
  const meta = {};
  const lines = frontmatterText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const item = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!item) continue;
    const key = item[1];
    let value = item[2];
    if (!value && index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
      const items = [];
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        items.push(parseFrontmatterValue(lines[index].replace(/^\s+-\s+/, "")));
      }
      meta[key] = items;
      continue;
    }
    meta[key] = parseFrontmatterValue(value);
  }

  const basename = path.basename(filePath, path.extname(filePath));
  const dateFromName = /^(\d{4}-\d{2}-\d{2})[-_]/.exec(basename)?.[1] || "";
  const baseWithoutDate = basename.replace(/^\d{4}-\d{2}-\d{2}[-_]/, "");
  const title = String(meta.title || baseWithoutDate || "Untitled").trim();
  const rawDate = Array.isArray(meta.date) ? meta.date[0] : meta.date;
  const categoryValue = meta.category || meta.categories || meta.categorie || "Notes";
  const tagsValue = meta.tags || [];
  const tags = Array.isArray(tagsValue)
    ? tagsValue.map((tag) => String(tag).trim()).filter(Boolean)
    : String(tagsValue || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const sourceSlug = String(meta.slug || baseWithoutDate || title).trim();
  const originalSlug = String(meta.originalSlug || sourceSlug || title).trim();
  const aliasesValue = Array.isArray(meta.aliases) ? meta.aliases : [];
  const status = String(meta.status || "").trim() === "draft" || filePath.includes(`${path.sep}drafts${path.sep}`)
    ? "draft"
    : "published";

  return {
    slug: slugify(sourceSlug || title),
    originalSlug,
    aliases: Array.from(new Set([
      ...aliasesValue,
      sourceSlug,
      originalSlug,
      title,
      slugify(sourceSlug),
      slugify(title),
      baseWithoutDate
    ].map((value) => String(value || "").trim()).filter(Boolean))),
    draftId: String(meta.draftId || "").trim(),
    revision: Math.max(0, Number(meta.revision || 0)),
    createdAt: String(meta.createdAt || "").trim(),
    updatedAt: String(meta.updatedAt || "").trim(),
    updatedBy: String(meta.updatedBy || "").trim(),
    category: Array.isArray(categoryValue) ? String(categoryValue[0] || "Notes") : String(categoryValue || "Notes"),
    date: publicDate(rawDate || dateFromName),
    title,
    excerpt: String(meta.excerpt || "").trim() || stripMarkdown(markdown).slice(0, 180),
    excerptMode: String(meta.excerptMode || "").trim() === "auto" ? "auto" : "manual",
    summaryContentHash: String(meta.summaryContentHash || "").trim(),
    annotationContentHash: String(meta.annotationContentHash || "").trim(),
    contentFormat: String(meta.contentFormat || "").trim() === "html" ? "html" : "markdown",
    tags,
    markdown,
    authored: true,
    status,
    importedFromMarkdown: true,
    sourceMarkdownPath: markdownDisplayPath(filePath)
  };
}

async function walkMarkdownFiles(folder) {
  const files = [];
  if (!existsSync(folder)) return files;
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdownFiles(fullPath));
    } else if (/\.md(?:own)?$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function recoverAuthoredIndexFromContent() {
  const files = [
    ...await walkMarkdownFiles(path.join(CONTENT_ROOT, "drafts")),
    ...await walkMarkdownFiles(path.join(CONTENT_ROOT, "posts"))
  ];
  const recovered = [];
  for (const file of files) {
    try {
      const post = parseMarkdownDocument(await readFile(file, "utf8"), file);
      recovered.push({
        ...post,
        authored: true,
        importedFromMarkdown: false,
        sourceMarkdownPath: ""
      });
    } catch (_) {
      // One malformed content file must not prevent recovery of the others.
    }
  }
  const byIdentity = new Map();
  recovered
    .sort((left, right) => String(left.updatedAt || "").localeCompare(String(right.updatedAt || "")))
    .forEach((post) => {
      const identity = post.draftId || `${post.status}:${post.slug}`;
      byIdentity.set(identity, post);
    });
  return Array.from(byIdentity.values());
}

async function loadLocalMarkdownPosts() {
  const markdownFiles = [];
  for (const folder of editableMarkdownRoots()) {
    markdownFiles.push(...await walkMarkdownFiles(folder));
  }
  const posts = [];
  for (const file of markdownFiles) {
    try {
      const post = parseMarkdownDocument(await readFile(file, "utf8"), file);
      if (post.markdown) posts.push(post);
    } catch (_) {
      // Skip malformed imported Markdown instead of blocking the editor.
    }
  }
  return posts;
}

async function getLocalMarkdownPostBySlug(slug) {
  const normalized = slugify(slug);
  if (!normalized) return null;
  const posts = await loadLocalMarkdownPosts();
  return posts.find((post) => (
    post.slug === normalized
    || slugify(post.slug) === normalized
    || slugify(post.originalSlug) === normalized
    || (Array.isArray(post.aliases) && post.aliases.some((alias) => slugify(alias) === normalized))
  )) || null;
}

async function writeAuthoredIndex(posts) {
  await mkdir(STATE_ROOT, { recursive: true });
  const sorted = posts.slice().sort((a, b) => {
    const updated = String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    return updated || String(b.date).localeCompare(String(a.date));
  });
  const jsonPath = path.join(STATE_ROOT, "authored-posts.json");
  await atomicWriteJson(jsonPath, sorted);
  const js = serializeAuthoredPostsBundle(sorted);
  await atomicWriteFile(AUTHORED_BUNDLE_FILE, js, { encoding: "utf8" });
}

function mergeCommittedPost(posts, committed) {
  return posts
    .filter((item) => {
      if (committed.draftId && item.draftId === committed.draftId) return false;
      if (item.slug === committed.slug) return false;
      return true;
    })
    .concat(committed);
}

async function recoverPendingDraftCommit(posts) {
  if (!existsSync(DRAFT_COMMIT_FILE)) return posts;
  try {
    const marker = JSON.parse(await readFile(DRAFT_COMMIT_FILE, "utf8"));
    const committed = marker?.post;
    if (!committed?.slug || !committed?.status) throw new Error("invalid commit marker");
    const current = posts.find((item) => (
      (committed.draftId && item.draftId === committed.draftId)
      || (item.slug === committed.slug && item.status === committed.status)
    ));
    const selected = Number(current?.revision || 0) > Number(committed.revision || 0) ? current : committed;
    const folder = selected.status === "draft" ? "drafts" : "posts";
    const contentPath = path.join(CONTENT_ROOT, folder, `${isoDate(selected.date)}-${selected.slug}.md`);
    await atomicWriteFile(contentPath, frontmatter(selected), { encoding: "utf8" });
    const next = mergeCommittedPost(posts, selected);
    await writeAuthoredIndex(next);
    await unlink(DRAFT_COMMIT_FILE);
    console.warn(`[storage] completed interrupted revision ${selected.revision || 0} for ${selected.slug}`);
    return next;
  } catch (error) {
    console.error(`[storage] pending commit recovery failed: ${error.message}`);
    return posts;
  }
}

function postMatchesIdentity(post, identity) {
  const raw = String(identity || "").trim();
  const normalized = slugify(raw);
  return Boolean(raw && post && (
    post.draftId === raw
    || post.draftId === normalized
    || post.slug === raw
    || post.slug === normalized
    || slugify(post.slug) === normalized
    || (Array.isArray(post.aliases) && post.aliases.some((alias) => slugify(alias) === normalized))
  ));
}

function getPublishedAuthoredPostBySlug(identity) {
  const runtimePosts = parseWindowArrayFile("authored-posts.js", "MICHEL_AUTHORED_POSTS", STATE_ROOT);
  const posts = runtimePosts.length ? runtimePosts : parseWindowArrayFile("authored-posts.js", "MICHEL_AUTHORED_POSTS");
  const post = posts.find((item) => postMatchesIdentity(item, identity));
  if (!post) return null;

  const slug = slugify(post.slug || post.title);
  return {
    ...post,
    slug,
    originalSlug: String(post.originalSlug || post.slug || post.title || "").trim(),
    aliases: Array.from(new Set([
      slug,
      post.slug,
      post.originalSlug,
      post.title,
      ...(Array.isArray(post.aliases) ? post.aliases : [])
    ].map((item) => String(item || "").trim()).filter(Boolean))),
    authored: true,
    status: "published"
  };
}

async function moveMarkdownToTrash(filePath, label = "post") {
  const absolute = path.resolve(String(filePath || ""));
  if (!filePath || !existsSync(absolute)) return "";

  const parentName = path.basename(path.dirname(absolute));
  const trashDir = parentName === "_posts" || parentName === "_drafts"
    ? path.join(path.dirname(path.dirname(absolute)), "_trash")
    : path.join(CONTENT_ROOT, "trash");
  await mkdir(trashDir, { recursive: true });

  const extension = path.extname(absolute) || ".md";
  const base = cleanFileBase(path.basename(absolute, extension) || label);
  let destination = path.join(trashDir, `${base}${extension}`);
  if (existsSync(destination)) {
    destination = path.join(trashDir, `${base}-${Date.now()}${extension}`);
  }
  await rename(absolute, destination);
  return markdownDisplayPath(destination);
}

async function checkpointPost(post, reason) {
  if (!post?.markdown) return "";
  const identity = String(post.draftId || post.slug || "post").replace(/[^\w.-]/g, "").slice(0, 120) || "post";
  const revision = Math.max(0, Number(post.revision || 0));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-r${revision}-${String(reason || "checkpoint").replace(/[^\w.-]/g, "-")}.md`;
  const target = path.join(STATE_ROOT, "revisions", identity, filename);
  await atomicWriteFile(target, frontmatter(post), { encoding: "utf8" });
  return target;
}

async function deletePost(identity) {
  const posts = await loadAuthoredIndex();
  const post = posts.find((item) => postMatchesIdentity(item, identity));
  if (!post) return null;

  await checkpointPost(post, "before-delete");

  const folder = post.status === "draft" ? "drafts" : "posts";
  const localContentPath = path.join(CONTENT_ROOT, folder, `${isoDate(post.date)}-${post.slug}.md`);
  const moved = [];
  const localTrashPath = await moveMarkdownToTrash(localContentPath, post.slug);
  if (localTrashPath) moved.push(localTrashPath);

  const editableSourcePath = resolveEditableMarkdownPath(post.sourceMarkdownPath || "");
  if (editableSourcePath && path.resolve(editableSourcePath) !== path.resolve(localContentPath)) {
    const sourceTrashPath = await moveMarkdownToTrash(editableSourcePath, post.slug);
    if (sourceTrashPath) moved.push(sourceTrashPath);
  }

  await writeAuthoredIndex(posts.filter((item) => !postMatchesIdentity(item, identity)));
  return {
    slug: post.slug,
    draftId: post.draftId || "",
    status: post.status,
    title: post.title,
    revision: Math.max(0, Number(post.revision || 0)),
    trashedFiles: moved
  };
}

async function savePost(input) {
  const status = input.status === "draft" ? "draft" : "published";
  const rawTitle = String(input.title || "").trim();
  if (!rawTitle && status === "published") throw new Error("Title is required");
  const title = rawTitle || "Untitled";
  let markdown = encodeIntentionalParagraphIndents(
    String(input.markdown || "").replace(/\r\n?/g, "\n")
  );
  if (!markdown.trim() && status === "published") throw new Error("Markdown content is required");
  const requestedDraftId = String(input.draftId || "").trim().replace(/[^\w-]/g, "").slice(0, 80);
  const slug = slugify(input.slug || rawTitle || requestedDraftId || `draft-${Date.now()}`);
  const category = String(input.category || "Notes").trim() || "Notes";
  const date = publicDate(input.date);
  const tags = String(input.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const posts = await loadAuthoredIndex();
  const originalSlug = String(input.originalSlug || "").trim();
  const legacySource = String(input.legacySource || "").trim();
  const aliases = Array.from(new Set([
    slug,
    originalSlug,
    ...(Array.isArray(input.aliases) ? input.aliases : [])
  ].map((item) => String(item || "").trim()).filter(Boolean)));
  const existing = posts.find((item) => (
    (requestedDraftId && item.draftId === requestedDraftId)
    || postMatchesIdentity(item, slug)
  ));
  const currentRevision = Math.max(0, Number(existing?.revision || 0));
  const suppliedRevision = input.baseRevision === undefined || input.baseRevision === null || input.baseRevision === ""
    ? null
    : Math.max(0, Number(input.baseRevision));
  if (suppliedRevision !== null && suppliedRevision !== currentRevision) {
    throw new HttpError(409, "This draft changed in another page", {
      code: "draft_revision_conflict",
      currentRevision,
      post: existing || null
    });
  }
  const clientId = draftCoordinator.normalizeClientId(input.clientId);
  if (requestedDraftId && clientId) {
    const lease = draftCoordinator.ensureLease(requestedDraftId, clientId);
    if (!lease.acquired) {
      throw new HttpError(423, "This draft is being edited in another page", {
        code: "draft_lease_held",
        draftId: requestedDraftId,
        expiresAt: lease.expiresAt
      });
    }
  }
  const contentFormat = String(input.contentFormat || existing?.contentFormat || "").trim().toLowerCase() === "html"
    ? "html"
    : "markdown";
  markdown = trimTrailingEmptyContent(markdown);
  const annotationBase = removeGeneratedAnnotations(markdown);
  const annotationContentHash = createHash("sha256").update(`${title}\n${annotationBase}`).digest("hex");
  let nextAnnotationContentHash = String(existing?.annotationContentHash || "");
  let annotationsGenerated = 0;
  if (input.annotate === true && annotationContentHash !== nextAnnotationContentHash) {
    try {
      const candidates = await generatePostAnnotations(title, annotationBase);
      markdown = applyGeneratedAnnotations(annotationBase, candidates);
      annotationsGenerated = (markdown.match(/#michel-note-v1:/g) || []).length;
      nextAnnotationContentHash = annotationContentHash;
    } catch (error) {
      console.warn(`Automatic annotations skipped for ${slug}: ${redactAssistantError(error)}`);
    }
  }
  const publishingIdentities = Array.from(new Set([
    requestedDraftId,
    slug,
    originalSlug,
    ...aliases
  ].filter(Boolean)));
  const supersededDrafts = status === "published"
    ? posts.filter((item) => item.status === "draft" && publishingIdentities.some((identity) => postMatchesIdentity(item, identity)))
    : [];
  const requestedExcerpt = String(input.excerpt || "").trim();
  const requestedExcerptMode = input.excerptMode === "auto" || input.excerptMode === "manual"
    ? input.excerptMode
    : "";
  const excerptMode = requestedExcerptMode || (requestedExcerpt ? "manual" : "auto");
  const contentHash = createHash("sha256").update(`${title}\n${markdown}`).digest("hex");
  let summaryContentHash = String(existing?.summaryContentHash || "");
  let excerpt = excerptMode === "manual"
    ? requestedExcerpt
    : String(requestedExcerpt || existing?.excerpt || "").trim();
  if (excerptMode === "auto" && input.summarize === true && contentHash !== summaryContentHash) {
    try {
      excerpt = await generatePostSummary(title, markdown);
      summaryContentHash = contentHash;
    } catch (error) {
      console.warn(`Automatic summary skipped for ${slug}: ${error.message}`);
    }
  }
  if (!excerpt) excerpt = excerptMode === "auto"
    ? compactAutoSummary(stripMarkdown(markdown))
    : stripMarkdown(markdown).slice(0, 180);
  const sourceMarkdownPath = String(input.sourceMarkdownPath || "").trim();
  const existingSourceMarkdownPath = String(existing?.sourceMarkdownPath || "").trim();
  const editableSourcePath = resolveEditableMarkdownPath(sourceMarkdownPath || existingSourceMarkdownPath);
  const post = {
    ...(existing || {}),
    slug,
    originalSlug: originalSlug || existing?.originalSlug || "",
    aliases: aliases.length ? aliases : existing?.aliases || [slug],
    category,
    date,
    title,
    excerpt,
    excerptMode,
    summaryContentHash: excerptMode === "auto" ? summaryContentHash : "",
    annotationContentHash: nextAnnotationContentHash,
    annotationsGenerated,
    tags,
    markdown,
    contentFormat,
    authored: true,
    draftId: status === "draft" ? (requestedDraftId || existing?.draftId || randomBytes(8).toString("hex")) : (requestedDraftId || existing?.draftId || ""),
    importedFromLegacy: Boolean(input.importedFromLegacy || legacySource || existing?.importedFromLegacy),
    legacySource: legacySource || existing?.legacySource || "",
    importedFromMarkdown: Boolean(input.importedFromMarkdown || sourceMarkdownPath || existing?.importedFromMarkdown),
    sourceMarkdownPath: editableSourcePath ? markdownDisplayPath(editableSourcePath) : (sourceMarkdownPath || existingSourceMarkdownPath || ""),
    status,
    revision: currentRevision + 1,
    updatedBy: clientId,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await atomicWriteJson(DRAFT_COMMIT_FILE, {
    version: 1,
    startedAt: new Date().toISOString(),
    post
  });

  const folder = status === "draft" ? "drafts" : "posts";
  const postDir = path.join(CONTENT_ROOT, folder);
  await mkdir(postDir, { recursive: true });
  const markdownText = frontmatter(post);
  if (existing && status === "published") await checkpointPost(existing, "before-publish");
  const localContentPath = path.join(postDir, `${isoDate(date)}-${slug}.md`);
  await atomicWriteFile(localContentPath, markdownText, { encoding: "utf8" });
  const obsoletePosts = Array.from(new Set([existing, ...supersededDrafts].filter(Boolean)));
  const obsoleteContentPaths = obsoletePosts.flatMap((obsolete) => {
    const obsoleteFolder = obsolete.status === "draft" ? "drafts" : "posts";
    const obsoleteContentPath = obsolete.slug
      ? path.join(CONTENT_ROOT, obsoleteFolder, `${isoDate(obsolete.date)}-${obsolete.slug}.md`)
      : "";
    return obsoleteContentPath && obsoleteContentPath !== localContentPath ? [obsoleteContentPath] : [];
  });
  if (status === "published" && editableSourcePath && path.resolve(localContentPath) !== editableSourcePath) {
    await atomicWriteFile(editableSourcePath, markdownText, { encoding: "utf8" });
  }

  const next = posts
    .filter((item) => {
      if (post.draftId && item.draftId === post.draftId) return false;
      if (item.slug === slug) return false;
      if (existing && item.slug === existing.slug && item.status === existing.status && item.draftId === existing.draftId) return false;
      if (status === "published" && item.status === "draft" && publishingIdentities.some((identity) => postMatchesIdentity(item, identity))) return false;
      return true;
    })
    .concat(post);
  await recordWritingSave(posts, post);
  await writeAuthoredIndex(next);
  for (const obsoleteContentPath of obsoleteContentPaths) {
    try {
      await unlink(obsoleteContentPath);
    } catch (_) {
      // Cleanup follows the durable index commit; an already-missing old file is harmless.
    }
  }
  await unlink(DRAFT_COMMIT_FILE).catch(() => {});
  return post;
}

const enrichmentTokens = new Map();

function enrichmentSourceHash(post) {
  return createHash("sha256")
    .update(`${String(post?.title || "")}\n${removeGeneratedAnnotations(String(post?.markdown || ""))}`)
    .digest("hex");
}

function queuePostEnrichment(savedPost) {
  if (!savedPost?.slug || savedPost.status !== "published") return false;
  const token = randomBytes(12).toString("hex");
  enrichmentTokens.set(savedPost.slug, token);

  setImmediate(async () => {
    const baseMarkdown = removeGeneratedAnnotations(String(savedPost.markdown || ""));
    const sourceHash = enrichmentSourceHash({ ...savedPost, markdown: baseMarkdown });
    const annotationPromise = generatePostAnnotations(savedPost.title, baseMarkdown);
    const summaryPromise = savedPost.excerptMode === "auto"
      ? generatePostSummary(savedPost.title, baseMarkdown)
      : Promise.resolve(null);

    const [annotationResult, summaryResult] = await Promise.allSettled([
      annotationPromise,
      summaryPromise
    ]);

    try {
      await draftCoordinator.withMutation(async () => {
      if (enrichmentTokens.get(savedPost.slug) !== token) return;
      const posts = await loadAuthoredIndex();
      const index = posts.findIndex((post) => post.status === "published" && post.slug === savedPost.slug);
      if (index === -1) return;

      const current = posts[index];
      if (enrichmentSourceHash(current) !== sourceHash) {
        console.info(`[enrichment] skipped stale result for ${savedPost.slug}`);
        return;
      }

      const currentBase = removeGeneratedAnnotations(String(current.markdown || ""));
      let markdown = currentBase;
      let annotationContentHash = String(current.annotationContentHash || "");
      let annotationsGenerated = Number(current.annotationsGenerated || 0);
      if (annotationResult.status === "fulfilled") {
        markdown = applyGeneratedAnnotations(currentBase, annotationResult.value);
        annotationContentHash = sourceHash;
        annotationsGenerated = (markdown.match(/#michel-note-v1:/g) || []).length;
      } else {
        console.warn(`Automatic annotations skipped for ${savedPost.slug}: ${redactAssistantError(annotationResult.reason)}`);
      }

      let excerpt = String(current.excerpt || "");
      let summaryContentHash = String(current.summaryContentHash || "");
      if (current.excerptMode === "auto" && summaryResult.status === "fulfilled" && summaryResult.value) {
        excerpt = summaryResult.value;
        summaryContentHash = createHash("sha256").update(`${current.title}\n${markdown}`).digest("hex");
      } else if (summaryResult.status === "rejected") {
        console.warn(`Automatic summary skipped for ${savedPost.slug}: ${redactAssistantError(summaryResult.reason)}`);
      }

      const enriched = {
        ...current,
        markdown,
        excerpt,
        summaryContentHash: current.excerptMode === "auto" ? summaryContentHash : "",
        annotationContentHash,
        annotationsGenerated
      };
      const contentPath = path.join(CONTENT_ROOT, "posts", `${isoDate(enriched.date)}-${enriched.slug}.md`);
      const markdownText = frontmatter(enriched);
      await mkdir(path.dirname(contentPath), { recursive: true });
      await atomicWriteFile(contentPath, markdownText, { encoding: "utf8" });
      const editableSourcePath = resolveEditableMarkdownPath(enriched.sourceMarkdownPath || "");
      if (editableSourcePath && path.resolve(editableSourcePath) !== path.resolve(contentPath)) {
        await atomicWriteFile(editableSourcePath, markdownText, { encoding: "utf8" });
      }
      posts[index] = enriched;
      await writeAuthoredIndex(posts);
      draftCoordinator.publish({
        type: "draft-updated",
        draftId: enriched.draftId || "",
        slug: enriched.slug,
        status: enriched.status,
        revision: Math.max(0, Number(enriched.revision || 0)),
        updatedAt: enriched.updatedAt,
        clientId: "server-enrichment"
      });
      console.info(`[enrichment] completed for ${savedPost.slug}`);
      });
    } catch (error) {
      console.warn(`[enrichment] failed for ${savedPost.slug}: ${redactAssistantError(error)}`);
    } finally {
      if (enrichmentTokens.get(savedPost.slug) === token) enrichmentTokens.delete(savedPost.slug);
    }
  });
  return true;
}

async function listAdminPosts(status = "all") {
  const posts = await loadAuthoredIndex();
  const views = await loadPostViews();
  return posts
    .filter((post) => status === "all" || post.status === status)
    .map((post) => ({
      slug: post.slug,
      draftId: post.draftId || "",
      category: post.category,
      date: post.date,
      title: post.title,
      excerpt: post.excerpt,
      excerptMode: post.excerptMode || "manual",
      summaryContentHash: post.summaryContentHash || "",
      annotationContentHash: post.annotationContentHash || "",
      contentFormat: post.contentFormat === "html" ? "html" : "markdown",
      tags: post.tags,
      authored: post.authored,
      importedFromLegacy: Boolean(post.importedFromLegacy),
      legacySource: post.legacySource || "",
      importedFromMarkdown: Boolean(post.importedFromMarkdown),
      sourceMarkdownPath: post.sourceMarkdownPath || "",
      originalSlug: post.originalSlug || "",
      aliases: Array.isArray(post.aliases) ? post.aliases : [],
      status: post.status,
      revision: Math.max(0, Number(post.revision || 0)),
      updatedBy: String(post.updatedBy || ""),
      createdAt: post.createdAt || "",
      updatedAt: post.updatedAt || "",
      views: postViewCount(post, views)
    }))
    .sort((a, b) => {
      const updated = String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      return updated || String(b.date).localeCompare(String(a.date));
    });
}

async function getPostBySlug(slug) {
  const posts = await loadAuthoredIndex();
  return posts.find((post) => postMatchesIdentity(post, slug))
    || getPublishedAuthoredPostBySlug(slug)
    || await getLocalMarkdownPostBySlug(slug)
    || await getLegacyPostBySlug(slug);
}

function parseMultipart(buffer, boundary) {
  const raw = buffer.toString("latin1");
  const marker = `--${boundary}`;
  const parts = [];
  for (const section of raw.split(marker)) {
    if (!section || section === "--\r\n" || section === "--") continue;
    const normalized = section.replace(/^\r\n/, "").replace(/\r\n--$/, "");
    const headerEnd = normalized.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerText = normalized.slice(0, headerEnd);
    let body = normalized.slice(headerEnd + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    const headers = Object.fromEntries(headerText.split("\r\n").map((line) => {
      const index = line.indexOf(":");
      return index === -1 ? [line.toLowerCase(), ""] : [line.slice(0, index).toLowerCase(), line.slice(index + 1).trim()];
    }));
    const disposition = headers["content-disposition"] || "";
    const name = /name="([^"]+)"/.exec(disposition)?.[1] || "";
    const filename = /filename="([^"]*)"/.exec(disposition)?.[1] || "";
    parts.push({
      name,
      filename,
      type: headers["content-type"] || "application/octet-stream",
      data: Buffer.from(body, "latin1")
    });
  }
  return parts;
}

async function handleUpload(req, res) {
  const type = req.headers["content-type"] || "";
  const boundary = /boundary=([^;]+)/.exec(type)?.[1];
  if (!boundary) {
    json(res, 400, { error: "Missing multipart boundary" });
    return;
  }
  const body = await readBody(req, MAX_UPLOAD);
  const file = parseMultipart(body, boundary).find((part) => ["file", "image"].includes(part.name) && part.filename);
  if (!file) {
    json(res, 400, { error: "Missing upload file" });
    return;
  }
  const filenameExt = path.extname(file.filename).toLowerCase();
  const pdfBySignature = filenameExt === ".pdf" && file.data.subarray(0, 5).toString("ascii") === "%PDF-";
  const ext = UPLOAD_TYPES.get(file.type) || (pdfBySignature ? ".pdf" : null);
  if (!ext) {
    json(res, 415, { error: "Only jpeg, png, gif, webp, and PDF files are allowed" });
    return;
  }
  if (ext === ".pdf" && file.data.subarray(0, 5).toString("ascii") !== "%PDF-") {
    json(res, 415, { error: "The uploaded file is not a valid PDF" });
    return;
  }
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const folder = path.join(UPLOAD_ROOT, yyyy, mm);
  await mkdir(folder, { recursive: true });
  const name = `${Date.now()}-${cleanFileBase(path.basename(file.filename, path.extname(file.filename)))}${ext}`;
  const target = path.join(folder, name);
  await atomicWriteFile(target, file.data);
  const url = `/uploads/${yyyy}/${mm}/${name}`;
  const isPdf = ext === ".pdf";
  json(res, 200, {
    url,
    kind: isPdf ? "pdf" : "image",
    filename: file.filename,
    markdown: isPdf
      ? `[${file.filename}](${url})`
      : `![${file.filename.replace(/\.[^.]+$/, "")}](${url})`
  });
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/writing-activity" && req.method === "GET") {
      json(res, 200, { ok: true, activity: await publicWritingActivity() });
      return;
    }

    if (url.pathname.startsWith("/api/post-views/") && req.method === "POST") {
      const slug = decodeURIComponent(url.pathname.slice("/api/post-views/".length));
      const result = await recordPostView(slug);
      if (!result) {
        json(res, 404, { error: "Post not found" });
        return;
      }
      json(res, 200, result);
      return;
    }

    if (url.pathname === "/api/admin/login" && req.method === "POST") {
      const body = await readJson(req);
      if (!equalSecret(body.password || "", PASSWORD)) {
        json(res, 401, { error: "Wrong password" });
        return;
      }
      const token = randomBytes(32).toString("base64url");
      const csrfToken = randomBytes(24).toString("base64url");
      sessions.set(token, { csrfToken, expiresAt: Date.now() + SESSION_TTL_MS });
      json(res, 200, { ok: true, csrfToken }, {
        "Set-Cookie": cookieHeader("mj_admin", encodeURIComponent(token), Math.floor(SESSION_TTL_MS / 1000))
      });
      return;
    }

    if (url.pathname === "/api/admin/session" && req.method === "GET") {
      const session = requireSession(req, res);
      if (!session) return;
      json(res, 200, { ok: true, csrfToken: session.csrfToken });
      return;
    }

    if (url.pathname === "/api/admin/draft-events" && req.method === "GET") {
      if (!requireSession(req, res)) return;
      draftCoordinator.subscribe(req, res, url.searchParams.get("clientId") || "");
      return;
    }

    if (url.pathname.startsWith("/api/admin/draft-leases/") && req.method === "POST") {
      if (!requireSession(req, res)) return;
      const draftId = decodeURIComponent(url.pathname.slice("/api/admin/draft-leases/".length));
      const body = await readJson(req);
      const lease = draftCoordinator.acquireLease(draftId, body.clientId, { takeover: body.takeover === true });
      json(res, lease.acquired ? 200 : 423, lease.acquired
        ? { ok: true, lease }
        : { error: "This draft is being edited in another page", code: "draft_lease_held", lease });
      return;
    }

    if (url.pathname.startsWith("/api/admin/draft-leases/") && req.method === "DELETE") {
      if (!requireSession(req, res)) return;
      const draftId = decodeURIComponent(url.pathname.slice("/api/admin/draft-leases/".length));
      const body = await readJson(req).catch(() => ({}));
      json(res, 200, { ok: true, released: draftCoordinator.releaseLease(draftId, body.clientId) });
      return;
    }

    if (url.pathname === "/api/admin/logout" && req.method === "POST") {
      const session = requireSession(req, res);
      if (!session) return;
      sessions.delete(session.token);
      json(res, 200, { ok: true }, {
        "Set-Cookie": cookieHeader("mj_admin", "", 0)
      });
      return;
    }

    if (url.pathname === "/api/admin/summary" && req.method === "POST") {
      if (!requireSession(req, res)) return;
      const body = await readJson(req);
      const markdown = String(body.markdown || "").trim();
      if (!markdown) {
        json(res, 400, { error: "Article content is required" });
        return;
      }
      try {
        const summary = await generatePostSummary(body.title, markdown);
        json(res, 200, { ok: true, summary, model: GLM_MODEL });
      } catch (error) {
        console.warn(`Manual summary generation failed: ${redactAssistantError(error)}`);
        json(res, 502, { error: assistantClientError(error) });
      }
      return;
    }

    if (url.pathname === "/api/admin/explain-selection" && req.method === "POST") {
      if (!requireSession(req, res)) return;
      const body = await readJson(req);
      try {
        const explanation = await explainSelectedTerm(
          body.title,
          body.markdown,
          body.selectedText,
          body.contextBefore,
          body.contextAfter
        );
        json(res, 200, { ok: true, explanation });
      } catch (error) {
        console.warn(`Selection explanation failed: ${redactAssistantError(error)}`);
        json(res, 502, { error: assistantClientError(error) });
      }
      return;
    }

    if (url.pathname === "/api/admin/posts" && req.method === "POST") {
      if (!requireSession(req, res)) return;
      const body = await readJson(req);
      const deferEnrichment = body.deferEnrichment === true && body.status !== "draft";
      const post = await draftCoordinator.withMutation(() => savePost(deferEnrichment
        ? { ...body, summarize: false, annotate: false }
        : body));
      json(res, 200, {
        ok: true,
        slug: post.slug,
        draftId: post.draftId || "",
        status: post.status,
        updatedAt: post.updatedAt,
        revision: Math.max(0, Number(post.revision || 0)),
        excerpt: post.excerpt,
        excerptMode: post.excerptMode,
        summaryContentHash: post.summaryContentHash || "",
        annotationContentHash: post.annotationContentHash || "",
        markdown: post.markdown,
        annotationsGenerated: Number(post.annotationsGenerated || 0),
        enrichmentQueued: deferEnrichment,
        url: `./post.html?slug=${encodeURIComponent(post.slug)}&theme=sketch`
      });
      draftCoordinator.publish({
        type: "draft-updated",
        draftId: post.draftId || "",
        slug: post.slug,
        status: post.status,
        revision: Math.max(0, Number(post.revision || 0)),
        updatedAt: post.updatedAt,
        clientId: String(post.updatedBy || "")
      });
      if (deferEnrichment) queuePostEnrichment(post);
      return;
    }

    if (url.pathname === "/api/admin/posts" && req.method === "GET") {
      if (!requireSession(req, res)) return;
      const status = url.searchParams.get("status") || "all";
      const allowed = new Set(["all", "draft", "published"]);
      const posts = await listAdminPosts(allowed.has(status) ? status : "all");
      json(res, 200, { ok: true, posts });
      return;
    }

    if (url.pathname.startsWith("/api/admin/pins/") && req.method === "POST") {
      if (!requireSession(req, res)) return;
      const identity = decodeURIComponent(url.pathname.slice("/api/admin/pins/".length));
      const body = await readJson(req);
      const result = await setPostPinned(identity, body.pinned);
      json(res, 200, { ok: true, ...result });
      return;
    }

    if (url.pathname.startsWith("/api/admin/legacy-posts/") && url.pathname.endsWith("/annotations") && req.method === "POST") {
      if (!requireSession(req, res)) return;
      const slug = decodeURIComponent(url.pathname.slice("/api/admin/legacy-posts/".length, -"/annotations".length));
      const result = await annotateLegacyPost(slug);
      if (!result) {
        json(res, 404, { error: "Legacy post not found" });
        return;
      }
      json(res, 200, { ok: true, ...result });
      return;
    }

    if (url.pathname.startsWith("/api/admin/posts/") && req.method === "GET") {
      if (!requireSession(req, res)) return;
      const slug = decodeURIComponent(url.pathname.slice("/api/admin/posts/".length));
      const post = await getPostBySlug(slug);
      if (!post) {
        json(res, 404, { error: "Post not found" });
        return;
      }
      const views = await loadPostViews();
      json(res, 200, { ok: true, post: { ...post, views: postViewCount(post, views, slug) } });
      return;
    }

    if (url.pathname.startsWith("/api/admin/posts/") && req.method === "DELETE") {
      if (!requireSession(req, res)) return;
      const identity = decodeURIComponent(url.pathname.slice("/api/admin/posts/".length));
      const deleted = await draftCoordinator.withMutation(() => deletePost(identity));
      if (!deleted) {
        json(res, 404, { error: "Post not found or not managed by Michel Writer" });
        return;
      }
      draftCoordinator.releaseLease(deleted.draftId, url.searchParams.get("clientId") || "");
      draftCoordinator.publish({
        type: "draft-deleted",
        draftId: deleted.draftId || "",
        slug: deleted.slug,
        revision: Math.max(0, Number(deleted.revision || 0))
      });
      json(res, 200, { ok: true, deleted });
      return;
    }

    if (url.pathname === "/api/admin/upload" && req.method === "POST") {
      if (!requireSession(req, res)) return;
      await handleUpload(req, res);
      return;
    }

    json(res, 404, { error: "API route not found" });
  } catch (error) {
    const status = Number(error?.status || 400);
    json(res, status, { error: error.message || "Request failed", ...(error?.details || {}) });
  }
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const isUpload = pathname === "/uploads" || pathname.startsWith("/uploads/");
  const runtimeBundles = new Map([
    ["/authored-posts.js", AUTHORED_BUNDLE_FILE],
    ["/pinned-posts.js", PINNED_BUNDLE_FILE]
  ]);
  const runtimeTarget = runtimeBundles.get(pathname);
  const staticRoot = isUpload ? UPLOAD_ROOT : ROOT;
  const relativePath = isUpload ? pathname.slice("/uploads".length) || "/" : pathname;
  const target = runtimeTarget && existsSync(runtimeTarget)
    ? runtimeTarget
    : path.normalize(path.join(staticRoot, relativePath));
  const allowedRoot = runtimeTarget && target === runtimeTarget ? STATE_ROOT : staticRoot;
  if (target !== allowedRoot && !target.startsWith(`${allowedRoot}${path.sep}`)) {
    text(res, 403, "Forbidden");
    return;
  }
  try {
    const data = await readFile(target);
    const basename = path.basename(target);
    const noStore = new Set([
      "admin.html",
      "admin.js",
      "private.html",
      "private.css",
      "private.js",
      "authored-posts.js",
      "pinned-posts.js"
    ]).has(basename);
    res.writeHead(200, {
      "Content-Type": MIME.get(path.extname(target).toLowerCase()) || "application/octet-stream",
      "Cache-Control": noStore ? "no-store" : "public, max-age=60"
    });
    res.end(data);
  } catch (_) {
    text(res, 404, "Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/assistant/chat") {
    await handleAssistant(req, res);
    return;
  }
  if (url.pathname === "/api/writing-activity") {
    await handleApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith("/api/post-views/")) {
    await handleApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith("/api/admin/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
});

if (process.argv.includes("--backfill-summaries")) {
  const results = await backfillLegacySummaries();
  const updated = results.filter((item) => item.ok).length;
  const failed = results.length - updated;
  console.log(`[summary] complete: ${updated} updated, ${failed} failed`);
  if (failed) process.exitCode = 1;
} else {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Sketch admin server: http://127.0.0.1:${PORT}/admin.html`);
    console.log(`[assistant-rate-limit] client=${assistantLimiter.clientQpm} QPM/${assistantLimiter.clientTpm} TPM global=${assistantLimiter.globalQpm} QPM/${assistantLimiter.globalTpm} TPM concurrent=${assistantLimiter.maxConcurrent}`);
    if (PASSWORD_WAS_GENERATED) {
      console.log(`Generated ADMIN_PASSWORD for this session: ${PASSWORD}`);
    }
  });
}
