import assert from "node:assert/strict";
import { buildReaderAssistantSystemPrompt } from "../lib/reader-assistant-prompt.mjs";

const prompt = buildReaderAssistantSystemPrompt({
  title: "Pipeline Parallelism",
  pageUrl: "https://example.com/post",
  articleContext: "Article body",
  selectionContext: "\n\nPRIVATE READER CONTEXT\nSelected passage"
});

assert.match(prompt, /focused semantic paragraphs/i);
assert.match(prompt, /blank line between paragraphs/i);
assert.match(prompt, /simple factual or one-step question[\s\S]*do not force a summary/i);
assert.match(prompt, /non-trivial answer[\s\S]*brief summary paragraph/i);
assert.match(prompt, /very difficult or multi-stage question[\s\S]*interim summaries/i);
assert.match(prompt, /Title: Pipeline Parallelism/);
assert.match(prompt, /PRIVATE READER CONTEXT/);

console.log("Reader assistant prompt structure verified.");
