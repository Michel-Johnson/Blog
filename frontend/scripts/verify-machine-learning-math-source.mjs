import fs from "node:fs";
import vm from "node:vm";

const postScript = fs.readFileSync(new URL("../post.js", import.meta.url), "utf8");
const postsScript = fs.readFileSync(new URL("../posts.js", import.meta.url), "utf8");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(postsScript, context);

const article = context.window.MICHEL_POSTS.find((post) => post.slug === "machine-learning");
if (!article) throw new Error("machine-learning article fixture is missing");

const functionMatch = postScript.match(/  function normalizeLegacyMathSource\(source\) \{[\s\S]*?\n  \}/);
if (!functionMatch) throw new Error("normalizeLegacyMathSource was not found");

const normalize = vm.runInNewContext(
  `(() => { const normalizeMathTexShortcuts = (value) => value; ${functionMatch[0]} return normalizeLegacyMathSource; })()`,
);

const sources = [...article.content.matchAll(
  /<annotation\b[^>]*encoding=(?:"|')application\/x-tex(?:"|')[^>]*>([\s\S]*?)<\/annotation>/gi,
)].map((match) => match[1].replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));

if (sources.length !== 36) throw new Error(`expected 36 formulas, found ${sources.length}`);

const normalized = sources.map(normalize);
const joined = normalized.join("\n");
const required = [
  "\\mathrm{tmp}_w",
  "\\mathrm{tmp}_b",
  "\\dots",
  "L \\longrightarrow \\text{loss}",
  "L(f_{\\vec{w},b}(\\vec{x}^{(i)}), y^{(i)}) =",
];

for (const token of required) {
  if (!joined.includes(token)) throw new Error(`normalized formulas are missing: ${token}`);
}

const forbidden = [/tmp\\_[wb]/, /\.\.\./, /…/, /^L-->loss$/m, /L\([^\n]+y\^\{\(i\)\}\)=/];
for (const pattern of forbidden) {
  if (pattern.test(joined)) throw new Error(`legacy formula remains after normalization: ${pattern}`);
}

console.log(`verified ${normalized.length} machine-learning formulas`);
