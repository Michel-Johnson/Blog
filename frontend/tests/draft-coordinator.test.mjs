import assert from "node:assert/strict";
import test from "node:test";
import { DraftCoordinator } from "../lib/draft-coordinator.mjs";

test("one client owns a draft until takeover", () => {
  const coordinator = new DraftCoordinator({ leaseTtlMs: 20_000 });
  assert.equal(coordinator.acquireLease("draft-a", "tab-a").acquired, true);
  assert.equal(coordinator.acquireLease("draft-a", "tab-b").acquired, false);
  assert.equal(coordinator.acquireLease("draft-a", "tab-b", { takeover: true }).acquired, true);
  assert.equal(coordinator.activeLease("draft-a").clientId, "tab-b");
});

test("mutations are serialized", async () => {
  const coordinator = new DraftCoordinator();
  const order = [];
  const first = coordinator.withMutation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("first");
  });
  const second = coordinator.withMutation(async () => order.push("second"));
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first", "second"]);
});
