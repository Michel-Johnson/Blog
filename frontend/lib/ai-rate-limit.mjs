function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function prune(entries, cutoff) {
  while (entries.length && entries[0].at <= cutoff) entries.shift();
}

function retryAfterSeconds(entries, now, windowMs) {
  if (!entries.length) return Math.ceil(windowMs / 1000);
  return Math.max(1, Math.ceil((entries[0].at + windowMs - now) / 1000));
}

export function estimateTokenBudget(values, maxOutputTokens = 0) {
  const bytes = values.reduce((total, value) => total + Buffer.byteLength(String(value || ""), "utf8"), 0);
  return Math.max(1, Math.ceil(bytes / 3)) + Math.max(0, Number(maxOutputTokens) || 0);
}

export class AiRateLimiter {
  constructor(options = {}) {
    this.windowMs = positiveInteger(options.windowMs, 60_000);
    this.clientQpm = positiveInteger(options.clientQpm, 6);
    this.clientTpm = positiveInteger(options.clientTpm, 50_000);
    this.globalQpm = positiveInteger(options.globalQpm, 60);
    this.globalTpm = positiveInteger(options.globalTpm, 300_000);
    this.maxConcurrent = positiveInteger(options.maxConcurrent, 2);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.clients = new Map();
    this.global = { requests: [], tokens: [] };
  }

  reserve(clientId, tokenBudget) {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const key = String(clientId || "unknown");
    const tokens = Math.max(1, Math.ceil(Number(tokenBudget) || 1));
    const client = this.clients.get(key) || { requests: [], tokens: [], concurrent: 0, lastSeen: now };
    prune(client.requests, cutoff);
    prune(client.tokens, cutoff);
    prune(this.global.requests, cutoff);
    prune(this.global.tokens, cutoff);

    const clientTokenTotal = client.tokens.reduce((sum, item) => sum + item.value, 0);
    const globalTokenTotal = this.global.tokens.reduce((sum, item) => sum + item.value, 0);
    const rejection = (scope, kind, entries, limit) => ({
      ok: false,
      scope,
      kind,
      limit,
      retryAfter: retryAfterSeconds(entries, now, this.windowMs)
    });

    if (client.requests.length >= this.clientQpm) return rejection("client", "qpm", client.requests, this.clientQpm);
    if (clientTokenTotal + tokens > this.clientTpm) return rejection("client", "tpm", client.tokens, this.clientTpm);
    if (client.concurrent >= this.maxConcurrent) return rejection("client", "concurrent", client.requests, this.maxConcurrent);
    if (this.global.requests.length >= this.globalQpm) return rejection("global", "qpm", this.global.requests, this.globalQpm);
    if (globalTokenTotal + tokens > this.globalTpm) return rejection("global", "tpm", this.global.tokens, this.globalTpm);

    const requestEntry = { at: now };
    const tokenEntry = { at: now, value: tokens };
    client.requests.push(requestEntry);
    client.tokens.push(tokenEntry);
    client.concurrent += 1;
    client.lastSeen = now;
    this.global.requests.push(requestEntry);
    this.global.tokens.push(tokenEntry);
    this.clients.set(key, client);

    if (this.clients.size > 2_000) {
      for (const [candidateKey, candidate] of this.clients) {
        if (candidate.concurrent === 0 && candidate.lastSeen <= cutoff) this.clients.delete(candidateKey);
      }
    }

    let released = false;
    return {
      ok: true,
      limits: {
        clientQpm: this.clientQpm,
        clientTpm: this.clientTpm,
        globalQpm: this.globalQpm,
        globalTpm: this.globalTpm
      },
      release: () => {
        if (released) return;
        released = true;
        client.concurrent = Math.max(0, client.concurrent - 1);
      }
    };
  }
}
