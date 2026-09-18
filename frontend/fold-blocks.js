(function initMichelFoldBlocks(global) {
  "use strict";

  const BLOCK_RE = /^\$\$fold[ \t]*\n([\s\S]*?)\n\$\$(?=\n|$)/gm;
  const editors = new WeakMap();

  function serializePayload(title, markdown) {
    return JSON.stringify({ v: 1, title: String(title || '折叠内容').trim() || '折叠内容', markdown: String(markdown || '').replace(/\r\n?/g, '\n') });
  }

  function normalizeLegacyEscapedNewlines(markdown) {
    const source = String(markdown || '');
    if (source.includes('\n')) return source;
    const escapedNewlines = source.match(/\\{3}n/g);
    return escapedNewlines?.length >= 2 ? source.replace(/\\{3}n/g, '\n') : source;
  }

  function attachEditor(root, editor, hooks) {
    if (editors.has(root)) return;
    editors.set(root, { editor, hooks });
    root.addEventListener('click', event => {
      const img = event.target.closest?.('img');
      if (!img || img.closest('.fold-block__body')) return;
      const view = editor.wwEditor?.view;
      let selected;
      view?.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image') return;
        const dom = view.nodeDOM(pos);
        if (dom === img || dom?.contains(img)) selected = { node, pos };
      });
      if (!selected) return;
      const host = root.closest('dialog') || document.body;
      host.querySelector('.fold-image-size')?.remove();
      const panel = document.createElement('div');
      panel.className = 'fold-image-size';
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', '图片尺寸');
      panel.innerHTML = '<label>图片宽度 <input type="range" min="40" max="1600" step="10" aria-label="图片宽度"></label><output></output><button type="button" data-original>原始大小</button><button type="button" data-close aria-label="关闭图片尺寸">完成</button>';
      host.append(panel);
      const slider = panel.querySelector('input');
      slider.value = String(Math.max(40, Math.round(img.getBoundingClientRect().width)));
      const output = panel.querySelector('output');
      output.textContent = slider.value + 'px';
      const update = width => {
        const node = view.state.doc.nodeAt(selected.pos);
        if (node !== selected.node) { panel.remove(); return; }
        const holder = document.createElement('template');
        holder.innerHTML = '<' + (node.attrs.rawHTML || 'img') + '>';
        const element = holder.content.querySelector('img');
        if (!element) return;
        element.removeAttribute('src'); element.removeAttribute('alt');
        element.removeAttribute('height'); element.style.removeProperty('height');
        if (width) { element.setAttribute('width', String(width)); element.style.width = width + 'px'; }
        else { element.removeAttribute('width'); element.style.removeProperty('width'); }
        element.style.maxWidth = '100%'; element.style.height = 'auto';
        view.dispatch(view.state.tr.setNodeMarkup(selected.pos, null, { ...node.attrs, rawHTML: element.outerHTML.slice(1, -1) }));
        selected.node = view.state.doc.nodeAt(selected.pos);
        output.textContent = width ? width + 'px' : '原始大小';
      };
      slider.addEventListener('input', () => update(Number(slider.value)));
      panel.querySelector('[data-original]').addEventListener('click', () => update(null));
      panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
    });
  }

  function editFold(button) {
    let root = button;
    while (root && !editors.has(root)) root = root.parentElement;
    if (!root) return false;
    const { editor, hooks } = editors.get(root);
    const view = editor.wwEditor?.view;
    const block = button.closest('.toastui-editor-custom-block');
    let target;
    view?.state.doc.descendants((node, pos) => {
      if (node.type.name === 'customBlock' && view.nodeDOM(pos) === block) target = { node, pos };
    });
    if (!target) return true;
    const payload = parsePayload(target.node.textContent);
    if (payload.invalid) {
      global.alert('该折叠块的保存数据已损坏。请保留当前草稿，并从原始 Markdown 恢复；此处不会覆盖原文。');
      return true;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'fold-edit-dialog';
    dialog.innerHTML = '<form method="dialog"><h2>编辑折叠内容</h2><label>标题<input name="title" autocomplete="off"></label><div class="fold-edit-content"></div><p role="status"></p><footer><button type="button" data-parse>按 Markdown 解析</button><button value="cancel">取消</button><button type="button" data-save>保存</button></footer></form>';
    document.body.append(dialog);
    const title = dialog.querySelector('input');
    title.value = payload.title;
    const inner = new global.toastui.Editor({
      el: dialog.querySelector('.fold-edit-content'), height: 'min(55vh, 560px)',
      initialEditType: 'wysiwyg', initialValue: payload.markdown,
      usageStatistics: false, autofocus: false, hideModeSwitch: true,
      toolbarItems: [['heading', 'bold', 'italic'], ['quote'], ['ul', 'ol'], ['table', 'image', 'link'], ['code', 'codeblock']],
      customHTMLRenderer: { fold: toastRenderer }, hooks: hooks || {}
    });
    attachEditor(dialog.querySelector('.fold-edit-content'), inner, hooks);
    dialog.querySelector('[data-parse]').addEventListener('click', () => {
      // Explicit conversion only: never reinterpret escaped examples on load/save.
      let fence = null;
      const markdown = inner.getMarkdown().split('\n').map(line => {
        const marker = line.match(/^\s*(`{3,}|~{3,})/);
        if (marker) {
          if (!fence) fence = marker[1];
          else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
          return line;
        }
        if (fence || /^(?: {4}|\t)/.test(line)) return line;
        return line.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g, '$1');
      }).join('\n');
      inner.setMarkdown(markdown);
      dialog.querySelector('[role="status"]').textContent = '已按 Markdown 解析，请检查效果后保存；取消不会修改原文。';
    });
    dialog.querySelector('[data-save]').addEventListener('click', () => {
      if (view.state.doc.nodeAt(target.pos) !== target.node) {
        dialog.querySelector('[role="status"]').textContent = '原文已发生变化，请取消后重新打开。';
        return;
      }
      const literal = serializePayload(title.value, inner.getMarkdown());
      view.dispatch(view.state.tr.replaceWith(target.pos + 1, target.pos + target.node.nodeSize - 1, view.state.schema.text(literal)));
      dialog.close();
    });
    dialog.addEventListener('close', () => { inner.destroy(); dialog.remove(); editor.focus(); }, { once: true });
    dialog.showModal();
    title.focus();
    return true;
  }

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
          markdown: normalizeLegacyEscapedNewlines(parsed.markdown)
        };
      }
    } catch (_) {
      // Older/manual blocks remain readable instead of breaking the article.
    }
    if (/^\s*\{\s*"(?:v|title|markdown)"\s*:/.test(source)) {
      return { title: '折叠内容格式损坏', markdown: '', invalid: true };
    }
    const lines = source.split("\n");
    return {
      title: String(lines.shift() || "折叠内容").trim() || "折叠内容",
      markdown: lines.join("\n")
    };
  }

  function encode(title, markdown) {
    return `$$fold\n${serializePayload(title, markdown)}\n$$`;
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
    if (payload.invalid) return '<details class="fold-block" data-fold-block><summary><span>折叠内容格式损坏</span></summary><div class="fold-block__body">保存数据不完整，请从原始 Markdown 恢复。原始数据未被修改。</div></details>';
    const body = typeof markdownRenderer === "function"
      ? markdownRenderer(payload.markdown)
      : `<p>${escapeHtml(payload.markdown).replace(/\n/g, "<br>")}</p>`;
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
      const summary = details.querySelector(":scope > summary");
      if (!summary) return;
      const edit = details.closest(".toastui-editor-custom-block")?.querySelector(".tool button");
      if (edit) {
        const label = global.MichelLanguage?.en ? "Edit folded content" : "编辑折叠内容";
        edit.setAttribute("aria-label", label);
        edit.setAttribute("title", label);
      }
      let button = summary.querySelector(".fold-toggle");
      if (!button) {
        summary.querySelector("small")?.remove();
        button = document.createElement("span");
        button.className = "fold-toggle";
        button.setAttribute("aria-hidden", "true");
        summary.append(button);
      }
      const sync = () => {
        button.textContent = global.MichelLanguage?.en ? (details.open ? "Collapse" : "Expand") : (details.open ? "收起内容" : "展开内容");
        summary.setAttribute("aria-expanded", String(details.open));
      };
      if (details.dataset.foldReady !== "true") {
        details.dataset.foldReady = "true";
        details.addEventListener("toggle", sync);
      }
      sync();
    });
  }

  // Capture clicks before the rich-text editor handles a widget as a selection.
  document.addEventListener("click", event => {
    const edit = event.target.closest?.('.toastui-editor-custom-block .tool button');
    if (edit && edit.closest('.toastui-editor-custom-block')?.querySelector('.fold-block-editor-shell')) {
      if (editFold(edit)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
    const summary = event.target.closest?.("details.fold-block > summary");
    if (!summary) return;
    event.preventDefault();
    event.stopPropagation();
    const details = summary.parentElement;
    details.open = !details.open;
    enhance(details.parentElement);
  }, true);

  function initialize() {
    const style = document.createElement("style");
    style.textContent = `
      .toastui-editor-defaultUI{min-width:0!important}
      .toastui-editor-defaultUI-toolbar{box-sizing:border-box;width:100%;min-width:0;padding:0 8px!important;overflow-x:auto;overflow-y:hidden;overscroll-behavior-inline:contain;scroll-padding-inline:8px;scrollbar-width:thin;scrollbar-color:#c9c0b4 transparent}
      .toastui-editor-defaultUI-toolbar::-webkit-scrollbar{height:4px}
      .toastui-editor-defaultUI-toolbar::-webkit-scrollbar-thumb{border-radius:999px;background:#c9c0b4}
      .toastui-editor-toolbar-group{flex:0 0 auto}
      .toastui-editor-dropdown-toolbar{box-sizing:border-box;right:8px!important;max-width:calc(100% - 16px)!important;height:46px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-inline:contain;border:1px solid #d8d1c5;border-radius:7px;background:#fbfaf7;box-shadow:0 8px 24px rgba(54,48,40,.12);scrollbar-width:thin;scrollbar-color:#c9c0b4 transparent}
      .toastui-editor-dropdown-toolbar::-webkit-scrollbar{height:4px}
      .toastui-editor-dropdown-toolbar::-webkit-scrollbar-thumb{border-radius:999px;background:#c9c0b4}
      .toastui-editor-dropdown-toolbar .toastui-editor-toolbar-group:first-child button:first-child{margin-left:5px}
      .toastui-editor-dropdown-toolbar .toastui-editor-toolbar-group:last-child button:last-of-type{margin-right:5px}
      .toastui-editor-defaultUI-toolbar button{transition-property:background-color,border-color,scale;transition-duration:120ms}
      .toastui-editor-defaultUI-toolbar button:active{scale:.96}
      .toastui-editor-defaultUI-toolbar button:focus-visible{outline:2px solid #81745c;outline-offset:-2px}
      .toastui-editor-defaultUI-toolbar .toastui-editor-toolbar-icons.active{border-color:#c9c0b4;background-color:#eee9df}
      .toastui-editor-tooltip{display:none!important}
      .fold-image-size{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;align-items:center;gap:12px;max-width:90vw;padding:12px 16px;border:1px solid #d8d1c5;border-radius:8px;background:#fffaf2;color:#35332e;box-shadow:0 4px 20px #0001;font:13px/1.4 sans-serif}
      .fold-image-size label{display:flex;align-items:center;gap:8px;white-space:nowrap}
      .fold-image-size input[type=range]{width:150px;padding:0;accent-color:#81745c}
      .fold-image-size button{white-space:nowrap;padding:6px 10px;border:1px solid #d8d1c5;border-radius:4px;background:#eee9df;color:inherit;cursor:pointer}
      @media(max-width:540px){.fold-image-size{flex-wrap:wrap;width:85vw;bottom:12px}}
      .fold-edit-dialog{box-sizing:border-box;width:min(960px,94vw);max-height:94vh;padding:24px;border:1px solid #d8d1c5;border-radius:12px;background:#fffaf2;color:#35332e;overflow:auto}
      .fold-edit-dialog::backdrop{background:rgba(35,32,26,.3)}
      .fold-edit-dialog h2{margin:0 0 18px;font:600 20px/1.4 sans-serif}
      .fold-edit-dialog label{display:grid;gap:8px;font:14px/1.5 sans-serif}
      .fold-edit-dialog input{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #d8d1c5;border-radius:6px;background:transparent;color:inherit;font:inherit}
      .fold-edit-content{margin-top:16px}
      .fold-edit-dialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
      .fold-edit-dialog footer button{padding:9px 20px;border:1px solid #cfc6b7;border-radius:6px;background:#eee9df;color:#35332e;font:14px/1.5 sans-serif;cursor:pointer}
      .fold-edit-dialog .toastui-editor-contents{font-family:inherit;background:#fffaf2}
      details.fold-block{box-sizing:border-box;width:100%;min-width:0;margin:1.1em 0;border:1px solid #d8d1c5;border-radius:8px;background:transparent;overflow:hidden;color:#35332e}
      details.fold-block>summary{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:13px 16px;list-style:none;background:rgba(232,226,213,.35);color:inherit;font:500 15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;transition:background-color 150ms ease}
      details.fold-block>summary:hover{background:rgba(222,214,198,.5)}
      details.fold-block>summary:focus-visible{outline:2px solid #81745c;outline-offset:-3px}
      details.fold-block>summary::-webkit-details-marker{display:none}
      details.fold-block>summary>span:first-child{min-width:0;overflow-wrap:anywhere}
      details.fold-block>summary>.fold-toggle{display:inline-flex;align-items:center;gap:10px;flex:0 0 auto;white-space:nowrap;color:#787166;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      details.fold-block>summary>.fold-toggle:after{content:"";width:7px;height:7px;display:block;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform 150ms ease}
      details.fold-block[open]>summary>.fold-toggle:after{transform:rotate(225deg) translate(-2px,-1px)}
      details.fold-block[open]>summary{border-bottom:1px solid #ded7cc}
      /* Isolate compact fold typography from article/theme and editor rules. */
      details.fold-block>.fold-block__body{min-width:0;padding:8px 12px;border:0;overflow-wrap:anywhere;font-size:13px!important;line-height:1.4!important;letter-spacing:normal;white-space:normal}
      details.fold-block .fold-block__body :is(p,ul,ol,blockquote,pre,table){margin:3px 0!important;font-size:inherit;line-height:1.4!important;letter-spacing:normal}
      details.fold-block .fold-block__body li{margin:2px 0!important;line-height:1.4!important}
      details.fold-block .fold-block__body li>p{margin:0!important}
      details.fold-block .fold-block__body :is(h1,h2,h3,h4,h5,h6){margin:6px 0 3px!important;padding:0!important;line-height:1.25!important;letter-spacing:normal;border:0}
      details.fold-block .fold-block__body h1{font-size:17px!important}
      details.fold-block .fold-block__body h2{font-size:16px!important}
      details.fold-block .fold-block__body h3{font-size:15px!important}
      details.fold-block .fold-block__body :is(h4,h5,h6){font-size:14px!important}
      details.fold-block .fold-block__body pre{white-space:pre;overflow-x:auto}
      details.fold-block>.fold-block__body>:first-child{margin-top:0!important}
      details.fold-block>.fold-block__body>:last-child{margin-bottom:0!important}
      details.fold-block:not([open])>.fold-block__body{display:none!important}
      .toastui-editor-custom-block:has(.fold-block-editor-shell) .toastui-editor-custom-block-view{padding:0;border:0;border-radius:8px}
      .toastui-editor-custom-block:has(.fold-block-editor-shell).ProseMirror-selectednode .toastui-editor-custom-block-view{border:0;outline:none}
      .toastui-editor-custom-block:has(.fold-block-editor-shell) .tool{top:10px;right:8px;z-index:1}
      .toastui-editor-custom-block:has(.fold-block-editor-shell) .tool .info{display:none}
      .toastui-editor-custom-block:has(.fold-block-editor-shell) .tool button{box-sizing:border-box;width:32px;height:32px;margin:0;padding:0;border:1px solid #d8d1c5;border-radius:6px;background-color:#fffdf7;cursor:pointer}
      .toastui-editor-custom-block:has(.fold-block-editor-shell) .tool button:hover{background-color:#eee8dc}
      .toastui-editor-custom-block:has(.fold-block-editor-shell) summary{padding-right:52px}
      details.fold-block{container-type:inline-size}
      @container(max-width:260px){details.fold-block>summary{gap:8px;padding:12px}details.fold-block>summary>.fold-toggle{font-size:0;gap:0}details.fold-block>summary>span:first-child{flex:1}}
      @media(max-width:480px){details.fold-block>summary{gap:10px;padding-left:12px;padding-right:12px}details.fold-block>.fold-block__body{padding:8px 12px}}
      @media(prefers-reduced-motion:reduce){details.fold-block>summary,details.fold-block>summary>.fold-toggle:after{transition:none}}
    `;
    document.head.append(style);
    enhance(document);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.("details.fold-block")) enhance(node.parentElement);
        else if (node.querySelector?.("details.fold-block")) enhance(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, {once:true});
  else initialize();

  global.MichelFoldBlocks = {
    attachEditor,
    defaultTitle,
    encode,
    enhance,
    expand,
    locateSelection,
    normalizeLegacyEscapedNewlines,
    parsePayload,
    toastRenderer,
    wrapSelection
  };
})(window);
