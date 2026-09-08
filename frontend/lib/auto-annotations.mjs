const PREFIX = "#michel-note-v1:";

function encodePayload(payload) {
  return `${PREFIX}${Buffer.from(JSON.stringify(payload || {}), "utf8").toString("base64url")}`;
}

function decodePayload(href) {
  const value = String(href || "");
  const marker = value.indexOf(PREFIX);
  if (marker < 0) return null;
  try {
    const token = value.slice(marker + PREFIX.length).split(/[?#&]/)[0];
    const payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch (_) {
    return null;
  }
}

function annotationPattern() {
  return /\[([^\]]+)\]\((#michel-note-v1:[A-Za-z0-9_-]+)\)/g;
}

export function removeGeneratedAnnotations(markdown) {
  return String(markdown || "").replace(annotationPattern(), (match, text, href) => {
    return decodePayload(href)?.origin === "glm" ? text : match;
  });
}

function protectedRanges(markdown) {
  const ranges = [];
  const patterns = [
    /```[\s\S]*?```/g,
    /~~~[\s\S]*?~~~/g,
    /`[^`\n]*`/g,
    /!?\[[^\]]*\]\([^\n)]*\)/g,
    /<[^>\n]+>/g,
    /https?:\/\/[^\s)]+/g
  ];
  patterns.forEach((pattern) => {
    for (const match of markdown.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  });
  ranges.push(...rawHtmlBlockRanges(markdown));
  return ranges;
}

function rawHtmlBlockRanges(markdown) {
  const source = String(markdown || "");
  const lines = source.match(/[^\n]*(?:\n|$)/g) || [];
  const ranges = [];
  const blockTags = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  const blockStart = new RegExp(`^ {0,3}(?:<!--|<\\?|<![A-Z]|<!\\[CDATA\\[|<\\/?(?:${blockTags})(?:\\s|/?>)|<\\/?[A-Za-z][A-Za-z0-9-]*(?:\\s[^>]*)?/?>\\s*$)`, "i");
  let offset = 0;
  let start = -1;
  let fenced = false;

  lines.forEach((line) => {
    const text = line.replace(/\n$/, "");
    const fence = /^ {0,3}(?:```|~~~)/.test(text);
    if (start >= 0 && !text.trim()) {
      ranges.push([start, offset]);
      start = -1;
    }
    if (start < 0 && !fenced && !fence && blockStart.test(text)) start = offset;
    if (fence) fenced = !fenced;
    offset += line.length;
  });
  if (start >= 0) ranges.push([start, source.length]);
  return ranges;
}

function intersectsProtected(start, end, ranges) {
  return ranges.some(([left, right]) => start < right && end > left);
}

function candidatePositions(markdown, term, ranges) {
  const positions = [];
  let cursor = 0;
  while (term && cursor < markdown.length) {
    const index = markdown.indexOf(term, cursor);
    if (index < 0) break;
    const end = index + term.length;
    if (!intersectsProtected(index, end, ranges)) positions.push(index);
    cursor = end;
  }
  return positions;
}

function selectPosition(markdown, candidate, ranges) {
  const positions = candidatePositions(markdown, candidate.term, ranges);
  if (positions.length === 1) return positions[0];
  const left = String(candidate.left || "");
  const right = String(candidate.right || "");
  if (!left && !right) return -1;
  const contextual = positions.filter((index) => {
    const before = markdown.slice(Math.max(0, index - left.length), index);
    const after = markdown.slice(index + candidate.term.length, index + candidate.term.length + right.length);
    return (!left || before === left) && (!right || after === right);
  });
  return contextual.length === 1 ? contextual[0] : -1;
}

export function normalizeGeneratedCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      term: String(candidate?.term || "").trim(),
      left: String(candidate?.left || "").slice(-24),
      right: String(candidate?.right || "").slice(0, 24),
      title: String(candidate?.title || candidate?.term || "名词解释").trim().slice(0, 60),
      body: Array.from(String(candidate?.body || "").replace(/\s+/g, " ").trim()).slice(0, 50).join(""),
      url: /^https?:\/\//i.test(String(candidate?.url || "")) ? String(candidate.url) : "",
      label: String(candidate?.label || "参考来源").trim().slice(0, 30)
    }))
    .filter((candidate) => candidate.term.length >= 2 && candidate.body && Array.from(candidate.body).length <= 50)
    .slice(0, 18);
}

export function mergeAnnotationDefinitions(selected, definitions) {
  const definitionById = new Map(
    (Array.isArray(definitions) ? definitions : []).map((definition) => [
      String(definition?.id || ""),
      definition
    ])
  );
  return normalizeGeneratedCandidates((Array.isArray(selected) ? selected : []).map((candidate, index) => {
    const id = String(candidate?.id || `term-${index + 1}`);
    const definition = definitionById.get(id) || {};
    return {
      term: candidate?.term,
      left: candidate?.left,
      right: candidate?.right,
      title: definition?.title || candidate?.term,
      body: definition?.body,
      url: definition?.url,
      label: definition?.label
    };
  }));
}

export function applyGeneratedAnnotations(markdown, candidates) {
  let output = removeGeneratedAnnotations(markdown);
  const ranges = protectedRanges(output);
  const edits = [];
  normalizeGeneratedCandidates(candidates).forEach((candidate) => {
    const index = selectPosition(output, candidate, ranges);
    if (index < 0 || edits.some((edit) => index < edit.end && index + candidate.term.length > edit.start)) return;
    const href = encodePayload({
      type: "definition",
      title: candidate.title,
      body: candidate.body,
      url: candidate.url,
      label: candidate.label,
      origin: "glm"
    });
    edits.push({ start: index, end: index + candidate.term.length, value: `[${candidate.term}](${href})` });
  });
  edits.sort((a, b) => b.start - a.start).forEach((edit) => {
    output = `${output.slice(0, edit.start)}${edit.value}${output.slice(edit.end)}`;
  });
  return output;
}

function htmlTagName(token) {
  return /^<\/?\s*([a-z0-9-]+)/i.exec(token)?.[1]?.toLowerCase() || "";
}

function isClosingTag(token) {
  return /^<\//.test(token);
}

function isSelfClosingTag(token) {
  return /\/\s*>$/.test(token) || /^<\s*(?:br|hr|img|input|meta|link|source|wbr)\b/i.test(token);
}

function isProtectedHtmlTag(token, name) {
  if (["a", "code", "pre", "script", "style", "math", "annotation"].includes(name)) return true;
  return name === "span" && /\bclass\s*=\s*(["'])[^"']*\bkatex\b/i.test(token);
}

function htmlTextTokens(html) {
  const tokens = String(html || "").match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
  const stack = [];
  let visibleOffset = 0;
  return tokens.map((value) => {
    if (value.startsWith("<")) {
      const name = htmlTagName(value);
      if (name && isClosingTag(value)) {
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index].name !== name) continue;
          stack.splice(index, 1);
          break;
        }
      } else if (name && !isSelfClosingTag(value) && !value.startsWith("<!--")) {
        stack.push({ name, protected: isProtectedHtmlTag(value, name) || stack.some((item) => item.protected) });
      }
      return { value, tag: true, protected: true, start: visibleOffset, end: visibleOffset };
    }
    const protectedText = stack.some((item) => item.protected);
    const start = visibleOffset;
    visibleOffset += protectedText ? 0 : value.length;
    return { value, tag: false, protected: protectedText, start, end: visibleOffset };
  });
}

function generatedHtmlAnchorPattern() {
  return /<a\b([^>]*\bhref\s*=\s*(["'])(#michel-note-v1:[A-Za-z0-9_-]+)\2[^>]*)>([\s\S]*?)<\/a>/gi;
}

export function removeGeneratedHtmlAnnotations(html) {
  return String(html || "").replace(generatedHtmlAnchorPattern(), (match, _attrs, _quote, href, text) => {
    return decodePayload(href)?.origin === "glm" ? text : match;
  });
}

export function applyGeneratedAnnotationsToHtml(html, candidates) {
  const base = removeGeneratedHtmlAnnotations(html);
  const tokens = htmlTextTokens(base);
  const visibleText = tokens.filter((token) => !token.tag && !token.protected).map((token) => token.value).join("");
  const ranges = [];
  const editsByToken = new Map();

  normalizeGeneratedCandidates(candidates).forEach((candidate) => {
    const positions = candidatePositions(visibleText, candidate.term, []);
    const contextual = positions.filter((index) => {
      const before = visibleText.slice(Math.max(0, index - candidate.left.length), index);
      const after = visibleText.slice(index + candidate.term.length, index + candidate.term.length + candidate.right.length);
      return (!candidate.left || before === candidate.left) && (!candidate.right || after === candidate.right);
    });
    const usable = contextual.length === 1 ? contextual : positions.length === 1 ? positions : [];
    if (usable.length !== 1) return;
    const start = usable[0];
    const end = start + candidate.term.length;
    if (ranges.some(([left, right]) => start < right && end > left)) return;
    const tokenIndex = tokens.findIndex((token) => !token.tag && !token.protected && start >= token.start && end <= token.end);
    if (tokenIndex < 0) return;
    const token = tokens[tokenIndex];
    const href = encodePayload({
      type: "definition",
      title: candidate.title,
      body: candidate.body,
      url: candidate.url,
      label: candidate.label,
      origin: "glm"
    });
    const edits = editsByToken.get(tokenIndex) || [];
    edits.push({
      start: start - token.start,
      end: end - token.start,
      value: `<a href="${href}">${candidate.term}</a>`
    });
    editsByToken.set(tokenIndex, edits);
    ranges.push([start, end]);
  });

  editsByToken.forEach((edits, tokenIndex) => {
    edits.sort((a, b) => b.start - a.start).forEach((edit) => {
      const token = tokens[tokenIndex];
      token.value = `${token.value.slice(0, edit.start)}${edit.value}${token.value.slice(edit.end)}`;
    });
  });
  return tokens.map((token) => token.value).join("");
}

export { PREFIX as AUTO_ANNOTATION_PREFIX, decodePayload as decodeAnnotationPayload };
