import assert from "node:assert/strict";
import { trimTrailingEmptyContent } from "../lib/trailing-content.mjs";

assert.equal(trimTrailingEmptyContent("正文\n\n<br>\n<br />\n\n"), "正文");
assert.equal(trimTrailingEmptyContent("正文\n\n<p><br></p>\n<div> </div>"), "正文");
assert.equal(trimTrailingEmptyContent("正文\n\n<br>\n后文"), "正文\n\n<br>\n后文");
assert.equal(trimTrailingEmptyContent("```html\n<br>\n```\n"), "```html\n<br>\n```");

console.log(JSON.stringify({ ok: true }));
