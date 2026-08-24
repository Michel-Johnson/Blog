import assert from "node:assert/strict";
import test from "node:test";
import { AiRateLimiter, estimateTokenBudget } from "../lib/ai-rate-limit.mjs";

test("enforces per-client QPM without affecting another client", () => {
  let now = 0;
  const limiter = new AiRateLimiter({ now: () => now, clientQpm: 2, clientTpm: 10_000, globalQpm: 10, globalTpm: 100_000 });
  limiter.reserve("a", 100).release();
  limiter.reserve("a", 100).release();
  assert.equal(limiter.reserve("a", 100).kind, "qpm");
  assert.equal(limiter.reserve("b", 100).ok, true);
  now = 60_001;
  assert.equal(limiter.reserve("a", 100).ok, true);
});

test("enforces per-client and global TPM reservations", () => {
  const limiter = new AiRateLimiter({ clientQpm: 10, clientTpm: 500, globalQpm: 10, globalTpm: 700 });
  limiter.reserve("a", 300).release();
  assert.equal(limiter.reserve("a", 250).kind, "tpm");
  limiter.reserve("b", 350).release();
  const global = limiter.reserve("c", 100);
  assert.equal(global.scope, "global");
  assert.equal(global.kind, "tpm");
});

test("enforces concurrent requests and estimates multilingual token budgets", () => {
  const limiter = new AiRateLimiter({ clientQpm: 10, clientTpm: 10_000, globalQpm: 10, globalTpm: 100_000, maxConcurrent: 1 });
  const first = limiter.reserve("a", 100);
  assert.equal(first.ok, true);
  assert.equal(limiter.reserve("a", 100).kind, "concurrent");
  first.release();
  assert.equal(limiter.reserve("a", 100).ok, true);
  assert.ok(estimateTokenBudget(["中文上下文", "English context"], 128) > 128);
});

test("counts a rejected concurrent attempt against neither QPM nor TPM", () => {
  const limiter = new AiRateLimiter({ clientQpm: 2, clientTpm: 250, globalQpm: 2, globalTpm: 250, maxConcurrent: 1 });
  const first = limiter.reserve("a", 100);
  assert.equal(limiter.reserve("a", 100).kind, "concurrent");
  first.release();
  const second = limiter.reserve("a", 100);
  assert.equal(second.ok, true);
  second.release();
  assert.equal(limiter.reserve("a", 100).kind, "qpm");
});
