(function initMichelFoldBlocks(global) {
  "use strict";

  const BLOCK_RE = /^\$\$fold[ \t]*\n([\s\S]*?)\n\$\$(?=\n|$)/gm;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parsePayload(literal) {
    const source = String(literal || "").trim();
    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === "object") {
        return {
          title: String(parsed.title || "折叠内容").trim() || "折叠内容",
          markdown: String(parsed.markdown || "")
        };
      }
    } catch (_) {
      // Older/manual blocks remain readable instead of breaking the article.
    }
    const lines = source.split("\n");
    return {
      title: String(lines.shift() || "折叠内容").trim() || "折叠内容",
      markdown: lines.join("\n")
    };
  }

  function encode(title, markdown) {
    return `$$fold\n${JSON.stringify({
      v: 1,
      title: String(title || "折叠内容").trim() || "折叠内容",
      markdown: String(markdown || "").replace(/\r\n?/g, "\n")
    })}\n$$`;
  }

  function defaultTitle(markdown) {
    const plain = String(markdown || "")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "图片")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return "折叠内容";
    const sentence = plain.split(/(?<=[。！？!?])/)[0] || plain;
    return sentence.length > 24 ? `${sentence.slice(0, 24)}…` : sentence;
  }

  function escapePattern(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function locateSelection(markdown, selectedText) {
    const source = String(markdown || "");
    const target = String(selectedText || "").trim();
    if (!target) return null;

    let start = source.indexOf(target);
    let end = start < 0 ? -1 : start + target.length;
    if (start < 0) {
      const chunks = target.split(/\s+/).filter(Boolean);
      if (!chunks.length) return null;
      const separator = "(?:\\s|[*_~`#>\\-\\[\\](){}])+?";
      const match = new RegExp(chunks.map(escapePattern).join(separator), "u").exec(source);
      if (!match) return null;
      start = match.index;
      end = start + match[0].length;
    }

    ["**", "__", "~~", "`"].some((marker) => {
      if (source.slice(Math.max(0, start - marker.length), start) !== marker) return false;
      if (source.slice(end, end + marker.length) !== marker) return false;
      start -= marker.length;
      end += marker.length;
      return true;
    });
    return { start, end };
  }

  function wrapSelection(markdown, selectedText) {
    const source = String(markdown || "");
    const located = locateSelection(source, selectedText);
    if (!located) return null;
    const selectedMarkdown = source.slice(located.start, located.end).trim();
    if (!selectedMarkdown) return null;

    const block = encode(defaultTitle(selectedMarkdown), selectedMarkdown);
    const beforeRaw = source.slice(0, located.start).replace(/[ \t]+$/g, "");
    const afterRaw = source.slice(located.end).replace(/^[ \t]+/g, "");
    const before = beforeRaw && !/\n\s*\n$/.test(beforeRaw)
      ? `${beforeRaw.replace(/\n?$/, "")}\n\n`
      : beforeRaw;
    const after = afterRaw && !/^\n\s*\n/.test(afterRaw)
      ? `\n\n${afterRaw.replace(/^\n?/, "")}`
      : afterRaw;
    return {
      markdown: `${before}${block}${after}`,
      selectedMarkdown,
      title: defaultTitle(selectedMarkdown),
      start: located.start,
      end: located.end
    };
  }

  function renderLiteral(literal, markdownRenderer) {
    const payload = parsePayload(literal);
    const body = typeof markdownRenderer === "function"
      ? markdownRenderer(payload.markdown)
      : `<p>${escapeHtml(payload.markdown)}</p>`;
    return `<details class="fold-block" data-fold-block><summary><span>${escapeHtml(payload.title)}</span><small aria-hidden="true">展开</small></summary><div class="fold-block__body">${body}</div></details>`;
  }

  function expand(markdown, md) {
    return String(markdown || "").replace(BLOCK_RE, (_match, literal) => {
      return `\n${renderLiteral(literal, (content) => md.render(content))}\n`;
    });
  }

  function toastRenderer(node) {
    const md = global.markdownit ? global.markdownit({ html: true, linkify: true, typographer: true, breaks: true }) : null;
    return [
      { type: "openTag", tagName: "div", classNames: ["fold-block-editor-shell"], outerNewLine: true },
      {
        type: "html",
        content: renderLiteral(node.literal, (content) => md ? md.render(expand(content, md)) : `<p>${escapeHtml(content)}</p>`)
      },
      { type: "closeTag", tagName: "div", outerNewLine: true }
    ];
  }

  function enhance(root) {
    root?.querySelectorAll("details.fold-block").forEach((details) => {
      if (details.dataset.foldReady === "true") return;
      details.dataset.foldReady = "true";
      const label = details.querySelector("summary small");
      const sync = () => {
        if (label) label.textContent = details.open ? "收起" : "展开";
      };
      details.addEventListener("toggle", sync);
      sync();
    });
  }

  global.MichelFoldBlocks = {
    defaultTitle,
    encode,
    enhance,
    expand,
    locateSelection,
    parsePayload,
    toastRenderer,
    wrapSelection
  };
})(window);
