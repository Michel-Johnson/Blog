import test from "node:test";
import assert from "node:assert/strict";
import { encodeIntentionalParagraphIndents } from "../lib/markdown-indentation.mjs";

test("stores intentional paragraph indentation as stable Markdown entities", () => {
  assert.equal(
    encodeIntentionalParagraphIndents("## 标题\n\n　　正文"),
    "## 标题\n\n&#12288;&#12288;正文"
  );
});

test("does not rewrite full-width spaces inside fenced code", () => {
  assert.equal(
    encodeIntentionalParagraphIndents("```text\n　　代码\n```\n　　正文"),
    "```text\n　　代码\n```\n&#12288;&#12288;正文"
  );
});
