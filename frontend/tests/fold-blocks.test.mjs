import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const window = {};
vm.runInNewContext(fs.readFileSync(new URL("../fold-blocks.js", import.meta.url), "utf8"), { window });
const folds = window.MichelFoldBlocks;

assert.ok(folds, "shared fold-block helper should be registered");

const source = "前文。\n\n需要 **默认收起** 的内容。\n\n后文。";
const wrapped = folds.wrapSelection(source, "默认收起");
assert.ok(wrapped, "selected editor text should map back to markdown");
assert.match(wrapped.markdown, /\$\$fold\n/);
assert.match(wrapped.markdown, /"markdown":"\*\*默认收起\*\*"/);
assert.match(wrapped.markdown, /前文。[\s\S]*后文。/);

const encoded = folds.encode("实现细节", "第一段。\n\n- 条目一");
const html = folds.expand(encoded, { render: (markdown) => `<p>${markdown}</p>` });
assert.match(html, /<details class="fold-block" data-fold-block>/);
assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/, "reader blocks must be collapsed initially");
assert.match(html, /<summary><span>实现细节<\/span><small aria-hidden="true">展开<\/small><\/summary>/);

console.log("fold-block tests passed");
