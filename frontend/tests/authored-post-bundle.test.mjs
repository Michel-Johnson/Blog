import assert from "node:assert/strict";
import test from "node:test";
import { hiddenPostIdentities, serializeAuthoredPostsBundle } from "../lib/authored-post-bundle.mjs";

test("legacy drafts suppress their public fallback identities", () => {
  const posts = [
    {
      slug: "legacy-note",
      originalSlug: "Legacy Note",
      aliases: ["old-legacy-note"],
      status: "draft",
      importedFromLegacy: true
    },
    {
      slug: "normal-draft",
      status: "draft"
    },
    {
      slug: "published-note",
      status: "published",
      importedFromLegacy: true
    }
  ];

  assert.deepEqual(hiddenPostIdentities(posts), ["legacy-note", "Legacy Note", "old-legacy-note"]);
  const bundle = serializeAuthoredPostsBundle(posts);
  assert.match(bundle, /window\.MICHEL_AUTHORED_POSTS/);
  assert.match(bundle, /"published-note"/);
  assert.doesNotMatch(bundle.split("window.MICHEL_HIDDEN_POSTS")[0], /"legacy-note"/);
  assert.match(bundle, /window\.MICHEL_HIDDEN_POSTS/);
  assert.match(bundle, /"old-legacy-note"/);
  assert.doesNotMatch(bundle, /"normal-draft"/);
});
