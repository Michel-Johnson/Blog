const DEFAULT_LEASE_TTL_MS = 20_000;

function cleanId(value, max = 120) {
  return String(value || "").trim().replace(/[^\w.-]/g, "").slice(0, max);
}

export class DraftCoordinator {
  constructor(options = {}) {
    this.leaseTtlMs = Math.max(5_000, Number(options.leaseTtlMs || DEFAULT_LEASE_TTL_MS));
    this.leases = new Map();
    this.subscribers = new Set();
    this.mutationQueue = Promise.resolve();
  }

  normalizeDraftId(value) {
    return cleanId(value, 120);
  }

  normalizeClientId(value) {
    return cleanId(value, 160);
  }

  activeLease(draftId) {
    const id = this.normalizeDraftId(draftId);
    const lease = this.leases.get(id);
    if (!lease) return null;
    if (lease.expiresAt <= Date.now()) {
      this.leases.delete(id);
      return null;
    }
    return { ...lease };
  }

  acquireLease(draftId, clientId, options = {}) {
    const id = this.normalizeDraftId(draftId);
    const client = this.normalizeClientId(clientId);
    if (!id || !client) throw new Error("draftId and clientId are required");
    const current = this.activeLease(id);
    if (current && current.clientId !== client && options.takeover !== true) {
      return { acquired: false, draftId: id, expiresAt: current.expiresAt };
    }
    const lease = {
      draftId: id,
      clientId: client,
      acquiredAt: current?.clientId === client ? current.acquiredAt : Date.now(),
      expiresAt: Date.now() + this.leaseTtlMs
    };
    this.leases.set(id, lease);
    if (!current || current.clientId !== client) {
      this.publish({ type: "lease", action: options.takeover ? "takeover" : "acquired", ...lease });
    }
    return { acquired: true, ...lease };
  }

  ensureLease(draftId, clientId) {
    const id = this.normalizeDraftId(draftId);
    const client = this.normalizeClientId(clientId);
    if (!id || !client) return { acquired: true, legacy: true };
    const current = this.activeLease(id);
    if (!current) return this.acquireLease(id, client);
    if (current.clientId !== client) {
      return { acquired: false, draftId: id, expiresAt: current.expiresAt };
    }
    return this.acquireLease(id, client);
  }

  releaseLease(draftId, clientId) {
    const id = this.normalizeDraftId(draftId);
    const client = this.normalizeClientId(clientId);
    const current = this.activeLease(id);
    if (!current || current.clientId !== client) return false;
    this.leases.delete(id);
    this.publish({ type: "lease", action: "released", draftId: id, clientId: client });
    return true;
  }

  withMutation(task) {
    const run = this.mutationQueue.then(task, task);
    this.mutationQueue = run.catch(() => {});
    return run;
  }

  subscribe(req, res, clientId = "") {
    const subscriber = { res, clientId: this.normalizeClientId(clientId) };
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    this.subscribers.add(subscriber);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keepalive\n\n");
    }, 15_000);
    heartbeat.unref?.();
    const close = () => {
      clearInterval(heartbeat);
      this.subscribers.delete(subscriber);
    };
    req.on("close", close);
    res.on("close", close);
  }

  publish(payload) {
    const message = `event: draft-sync\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const subscriber of this.subscribers) {
      if (subscriber.res.writableEnded) {
        this.subscribers.delete(subscriber);
        continue;
      }
      subscriber.res.write(message);
    }
  }
}
