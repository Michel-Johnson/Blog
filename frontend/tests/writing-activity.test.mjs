import test from "node:test";
import assert from "node:assert/strict";

import {
  countWritingCharacters,
  previousWritingCharacters,
  updateWritingPostCounts
} from "../lib/writing-activity.mjs";

test("an edited published post inherits its slug baseline under a new draft id", () => {
  const activity = {
    postCounts: {
      "existing-post": { characters: 1000, status: "published" }
    }
  };
  const editedDraft = {
    draftId: "new-draft-id",
    slug: "existing-post",
    originalSlug: "existing-post",
    aliases: ["existing-post"]
  };

  const previous = previousWritingCharacters(activity, editedDraft);
  const current = 1020;
  assert.equal(previous, 1000);
  assert.equal(Math.max(0, current - previous), 20);

  updateWritingPostCounts(activity, editedDraft, current, "draft");
  assert.deepEqual(activity.postCounts["new-draft-id"], { characters: 1020, status: "draft" });
  assert.deepEqual(activity.postCounts["existing-post"], { characters: 1020, status: "draft" });

  const published = { ...editedDraft, status: "published" };
  assert.equal(previousWritingCharacters(activity, published), 1020);
  assert.equal(Math.max(0, current - previousWritingCharacters(activity, published)), 0);
});

test("new posts count their first content, while deletions do not subtract activity", () => {
  const activity = { postCounts: {} };
  const post = { draftId: "brand-new", slug: "brand-new" };
  assert.equal(previousWritingCharacters(activity, post), 0);
  assert.equal(Math.max(0, 32 - previousWritingCharacters(activity, post)), 32);

  updateWritingPostCounts(activity, post, 32, "draft");
  assert.equal(Math.max(0, 20 - previousWritingCharacters(activity, post)), 0);
});

test("character counting ignores Markdown chrome but keeps authored text", () => {
  assert.equal(countWritingCharacters("**hello** [world](https://example.com)"), 10);
});
