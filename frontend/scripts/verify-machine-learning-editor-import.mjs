import fs from "node:fs";
import vm from "node:vm";

const serverSource = fs.readFileSync(new URL("../admin-server.mjs", import.meta.url), "utf8");
const postsSource = fs.readFileSync(new URL("../posts.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = serverSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} was not found`);
  const next = serverSource.indexOf("\nfunction ", start + 1);
  if (next < 0) throw new Error(`${name} has no following function boundary`);
  return serverSource.slice(start, next).trim();
}

const postContext = { window: {} };
vm.createContext(postContext);
vm.runInContext(postsSource, postContext);
const article = postContext.window.MICHEL_POSTS.find((post) => post.slug === "machine-learning");
if (!article) throw new Error("machine-learning article fixture is missing");

const helpers = [
  "stripTags",
  "decodeHtml",
  "markdownEscapeText",
  "normalizeLegacyMathSource",
  "extractRenderedKatex",
  "htmlToMarkdown"
].map(functionSource).join("\n\n");

const converter = vm.runInNewContext(`(() => { ${helpers}; return { htmlToMarkdown, extractRenderedKatex }; })()`);
const extracted = converter.extractRenderedKatex(article.content);
const markdown = converter.htmlToMarkdown(article.content);

const forbidden = [
  /class=["']katex/,
  /<math\b/,
  /katex-html/,
  /<annotation\b/,
  /tmp\\_[wb]/,
  /L-->loss/
];
for (const pattern of forbidden) {
  if (pattern.test(markdown)) throw new Error(`editor import retained legacy output: ${pattern}`);
}

const required = [
  "\\mathrm{tmp}_w",
  "\\mathrm{tmp}_b",
  "L \\longrightarrow \\text{loss}",
  "L(f_{\\vec{w},b}(\\vec{x}^{(i)}), y^{(i)}) ="
];
for (const token of required) {
  if (!markdown.includes(token)) {
    const nearby = markdown.split("\n").filter((line) => /tmp|loss|cost function/i.test(line)).slice(0, 12);
    const formulaSources = extracted.formulas.filter((formula) => /tmp|loss|cost function/i.test(formula));
    throw new Error(`editor import is missing normalized formula: ${token}\n${nearby.join("\n")}\n${formulaSources.join("\n")}`);
  }
}

if (/the cost function\s*,?\s*the cost function/i.test(markdown)) {
  throw new Error("editor import duplicated a prose-only legacy formula");
}

console.log(`verified machine-learning editor import (${markdown.length} characters)`);
