import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGeneratedAnnotations,
  applyGeneratedAnnotationsToHtml,
  decodeAnnotationPayload,
  mergeAnnotationDefinitions,
  removeGeneratedAnnotations,
  removeGeneratedHtmlAnnotations
} from "../lib/auto-annotations.mjs";

const authorHref = `#michel-note-v1:${Buffer.from(JSON.stringify({ body: "作者说明", origin: "author" })).toString("base64url")}`;

test("preserves author annotations while refreshing GLM annotations", () => {
  const source = `[作者词](${authorHref}) 与 梯度下降 是核心概念。`;
  const generated = applyGeneratedAnnotations(source, [{ term: "梯度下降", body: "沿梯度反方向迭代优化参数。" }]);
  assert.match(generated, new RegExp(authorHref));
  assert.match(generated, /\[梯度下降\]\(#michel-note-v1:/);
  assert.equal(removeGeneratedAnnotations(generated), source);
});

test("does not annotate code, links, or ambiguous repeated terms", () => {
  const source = "`Transformer` [Transformer](https://example.com) Transformer 与 Transformer";
  const generated = applyGeneratedAnnotations(source, [{ term: "Transformer", body: "基于注意力机制的神经网络架构。" }]);
  assert.equal(generated, source);
});

test("does not insert Markdown annotations inside raw HTML blocks", () => {
  const source = [
    "<br>",
    "Transformer inside a raw HTML block.",
    "",
    "Transformer outside the block."
  ].join("\n");
  const generated = applyGeneratedAnnotations(source, [{
    term: "Transformer",
    left: "",
    right: " outside",
    body: "基于注意力机制的神经网络架构。"
  }]);
  assert.match(generated, /Transformer inside a raw HTML block/);
  assert.doesNotMatch(generated, /\[Transformer\]\(#michel-note-v1:[^)]+\) inside/);
  assert.match(generated, /\[Transformer\]\(#michel-note-v1:[^)]+\) outside/);
});

test("uses exact context to disambiguate a repeated term", () => {
  const source = "监督学习需要标签，无监督学习不需要标签。";
  const generated = applyGeneratedAnnotations(source, [{
    term: "学习",
    left: "无监督",
    right: "不需要",
    body: "从无标签数据中发现结构。"
  }]);
  assert.equal((generated.match(/#michel-note-v1:/g) || []).length, 1);
  assert.match(generated, /无监督\[学习\]/);
});

test("caps generated definitions at 50 Unicode characters", () => {
  const generated = applyGeneratedAnnotations("反向传播用于训练。", [{
    term: "反向传播",
    body: "这是一段用于测试长度限制的说明。".repeat(8)
  }]);
  const href = generated.match(/\((#michel-note-v1:[A-Za-z0-9_-]+)\)/)?.[1];
  const payload = decodeAnnotationPayload(href);
  assert.ok(payload);
  assert.equal(Array.from(payload.body).length, 50);
});

test("keeps a broad long-form annotation set instead of truncating at eight", () => {
  const terms = Array.from({ length: 14 }, (_, index) => `术语-${String(index + 1).padStart(2, "0")}`);
  const source = terms.join("，");
  const generated = applyGeneratedAnnotations(source, terms.map((term) => ({
    term,
    body: `${term}的简明解释。`
  })));
  assert.equal((generated.match(/#michel-note-v1:/g) || []).length, 14);
});

test("keeps exact extracted locations when GLM only returns definitions by id", () => {
  const merged = mergeAnnotationDefinitions([{
    id: "term-1",
    term: "梯度下降",
    left: "通过",
    right: "优化参数"
  }], [{
    id: "term-1",
    term: "被模型意外改写的词",
    left: "错误上下文",
    body: "沿梯度反方向迭代更新参数。"
  }]);
  assert.deepEqual(merged[0], {
    term: "梯度下降",
    left: "通过",
    right: "优化参数",
    title: "梯度下降",
    body: "沿梯度反方向迭代更新参数。",
    url: "",
    label: "参考来源"
  });
});

test("annotates legacy HTML text without touching links, code, or KaTeX", () => {
  const source = [
    '<p><a href="https://example.com">监督学习</a></p>',
    '<p>梯度下降用于优化参数。</p>',
    '<code>梯度下降</code>',
    '<span class="katex"><span>梯度下降</span></span>'
  ].join("");
  const generated = applyGeneratedAnnotationsToHtml(source, [{
    term: "梯度下降",
    left: "",
    right: "用于",
    title: "梯度下降",
    body: "沿损失函数梯度反方向迭代更新参数。"
  }]);
  assert.equal((generated.match(/#michel-note-v1:/g) || []).length, 1);
  assert.match(generated, /<p><a href="#michel-note-v1:[^"]+">梯度下降<\/a>用于优化参数。<\/p>/);
  assert.match(generated, /<code>梯度下降<\/code>/);
  assert.match(generated, /<span class="katex"><span>梯度下降<\/span><\/span>/);
  assert.equal(removeGeneratedHtmlAnnotations(generated), source);
});

test("keeps author HTML annotations when refreshing generated legacy annotations", () => {
  const source = `<p><a href="${authorHref}">作者词</a>与监督学习。</p>`;
  const generated = applyGeneratedAnnotationsToHtml(source, [{
    term: "监督学习",
    body: "从带标签样本学习输入到输出的映射。"
  }]);
  assert.match(generated, new RegExp(authorHref));
  assert.equal((generated.match(/#michel-note-v1:/g) || []).length, 2);
  assert.equal(removeGeneratedHtmlAnnotations(generated), source);
});
