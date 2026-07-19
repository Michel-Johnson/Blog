(function () {
  const panel = document.querySelector("[data-assistant-panel]");
  const launcher = document.querySelector("[data-assistant-launcher]");
  const closeButton = document.querySelector("[data-assistant-close]");
  const form = document.querySelector("[data-assistant-form]");
  const input = document.querySelector("[data-assistant-input]");
  const messagesEl = document.querySelector("[data-assistant-messages]");
  const sendButton = document.querySelector("[data-assistant-send]");
  const resizeHandle = document.querySelector("[data-assistant-resize-handle]");
  if (!panel || !launcher || !form || !input || !messagesEl || !sendButton) return;

  const key = `michel-reader-chat:${new URLSearchParams(location.search).get("slug") || "post"}`;
  let messages = [];
  let controller = null;
  let activeSelection = null;
  let pendingSelection = null;
  let selectionAction = null;
  let selectionHighlight = null;
  let selectionTimer = null;
  let sessionRevision = 0;
  const assistantWidthKey = "michel.readerAssistantWidth.v1";
  const assistantWidthMin = 360;
  const assistantWidthMax = 560;
  const assistantWidthDefault = 480;
  const desktopAssistantQuery = window.matchMedia("(min-width: 72rem)");
  const assistantHeightMin = 340;
  const assistantHeightMax = 720;
  let preferredAssistantWidth = assistantWidthDefault;
  let assistantHeightFrame = 0;

  try {
    const savedWidth = Number.parseInt(localStorage.getItem(assistantWidthKey) || "", 10);
    if (Number.isFinite(savedWidth)) preferredAssistantWidth = savedWidth;
  } catch (_) {}

  function availableAssistantWidth() {
    if (!desktopAssistantQuery.matches) return assistantWidthMax;
    const rail = panel.closest(".post-rail");
    const anchoredRight = (rail?.getBoundingClientRect().right || panel.getBoundingClientRect().right) + 12;
    return Math.max(assistantWidthMin, Math.min(assistantWidthMax, Math.floor(anchoredRight - 8)));
  }

  function applyAssistantWidth(value, { persist = false } = {}) {
    const requested = Math.max(assistantWidthMin, Math.min(assistantWidthMax, Math.round(value)));
    preferredAssistantWidth = requested;
    if (!desktopAssistantQuery.matches) {
      panel.style.removeProperty("--reader-assistant-width");
      return requested;
    }
    const applied = Math.min(requested, availableAssistantWidth());
    panel.style.setProperty("--reader-assistant-width", `${applied}px`);
    resizeHandle?.setAttribute("aria-valuenow", String(applied));
    resizeHandle?.setAttribute("aria-valuetext", `${applied} pixels wide`);
    if (persist) {
      try { localStorage.setItem(assistantWidthKey, String(requested)); } catch (_) {}
    }
    return applied;
  }

  function setupAssistantResize() {
    if (!resizeHandle) return;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (!desktopAssistantQuery.matches || event.button !== 0) return;
      event.preventDefault();
      startX = event.clientX;
      startWidth = panel.getBoundingClientRect().width;
      resizeHandle.setPointerCapture?.(event.pointerId);
      resizeHandle.classList.add("is-active");
      document.body.classList.add("is-resizing-assistant");
    });

    resizeHandle.addEventListener("pointermove", (event) => {
      if (!resizeHandle.classList.contains("is-active")) return;
      applyAssistantWidth(startWidth + startX - event.clientX);
    });

    function finishResize(event) {
      if (!resizeHandle.classList.contains("is-active")) return;
      resizeHandle.releasePointerCapture?.(event.pointerId);
      resizeHandle.classList.remove("is-active");
      document.body.classList.remove("is-resizing-assistant");
      applyAssistantWidth(panel.getBoundingClientRect().width, { persist: true });
    }

    resizeHandle.addEventListener("pointerup", finishResize);
    resizeHandle.addEventListener("pointercancel", finishResize);
    resizeHandle.addEventListener("keydown", (event) => {
      if (!desktopAssistantQuery.matches) return;
      const current = panel.getBoundingClientRect().width;
      let next = null;
      if (event.key === "ArrowLeft") next = current + (event.shiftKey ? 40 : 12);
      if (event.key === "ArrowRight") next = current - (event.shiftKey ? 40 : 12);
      if (event.key === "Home") next = assistantWidthMin;
      if (event.key === "End") next = assistantWidthMax;
      if (next === null) return;
      event.preventDefault();
      applyAssistantWidth(next, { persist: true });
    });

    window.addEventListener("resize", () => {
      applyAssistantWidth(preferredAssistantWidth);
      scheduleAssistantHeight();
    });
    desktopAssistantQuery.addEventListener?.("change", () => {
      applyAssistantWidth(preferredAssistantWidth);
      scheduleAssistantHeight();
    });
  }

  function outerHeight(node) {
    if (!node) return 0;
    const style = getComputedStyle(node);
    return node.getBoundingClientRect().height
      + (Number.parseFloat(style.marginTop) || 0)
      + (Number.parseFloat(style.marginBottom) || 0);
  }

  function messagesContentHeight() {
    const style = getComputedStyle(messagesEl);
    let height = (Number.parseFloat(style.paddingTop) || 0)
      + (Number.parseFloat(style.paddingBottom) || 0);
    Array.from(messagesEl.children).forEach((message) => {
      height += outerHeight(message);
    });
    return Math.ceil(height);
  }

  function scheduleAssistantHeight() {
    if (assistantHeightFrame) return;
    assistantHeightFrame = requestAnimationFrame(() => {
      assistantHeightFrame = 0;
      if (!desktopAssistantQuery.matches) {
        panel.style.removeProperty("--reader-assistant-height");
        return;
      }
      if (panel.hidden) return;
      const header = panel.querySelector("header");
      const availableHeight = Math.max(assistantHeightMin, window.innerHeight - 64);
      const desiredHeight = outerHeight(header)
        + outerHeight(form)
        + Math.max(88, messagesContentHeight())
        + 4;
      const appliedHeight = Math.min(
        assistantHeightMax,
        availableHeight,
        Math.max(assistantHeightMin, Math.ceil(desiredHeight))
      );
      panel.style.setProperty("--reader-assistant-height", `${appliedHeight}px`);
    });
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }

  function setComposerBusy(busy) {
    sendButton.classList.toggle("is-stopping", busy);
    sendButton.textContent = busy ? "" : "↑";
    sendButton.setAttribute("aria-label", busy ? "Stop generating" : "Send question");
    sendButton.title = busy ? "Stop generating" : "Send question";
  }

  async function assistantErrorMessage(response) {
    const fallback = `Request failed (${response.status})`;
    const text = await response.text().catch(() => "");
    if (!text) return fallback;
    try {
      const payload = JSON.parse(text);
      return payload?.error || fallback;
    } catch (_) {
      return text.slice(0, 180) || fallback;
    }
  }

  function publicAssistantError(error) {
    const message = String(error?.message || "").trim();
    if (!message || message === "Assistant request failed") {
      return "GLM is temporarily unavailable. Please try again in a moment.";
    }
    return message;
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function clearSelectionVisuals({ keepContext = false } = {}) {
    selectionAction?.remove();
    selectionHighlight?.remove();
    selectionAction = null;
    selectionHighlight = null;
    pendingSelection = null;
    if (!keepContext) {
      activeSelection = null;
      input.placeholder = "Ask about this article...";
    }
  }

  function selectionContextFor(articleText, selected) {
    const source = compactText(articleText);
    const target = compactText(selected);
    const index = source.indexOf(target);
    if (index < 0) return { before: source.slice(0, 280), after: source.slice(280, 560) };
    return {
      before: source.slice(Math.max(0, index - 280), index).trim(),
      after: source.slice(index + target.length, index + target.length + 280).trim()
    };
  }

  function selectionData() {
    const selection = window.getSelection?.();
    const article = document.getElementById("post-content");
    if (!selection || selection.isCollapsed || !selection.rangeCount || !article) return null;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    if (!(container instanceof Node) || !article.contains(container)) return null;
    const text = compactText(selection.toString()).slice(0, 4000);
    if (!text) return null;
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 3);
    const fallback = range.getBoundingClientRect();
    if (!rects.length && fallback.width > 1) rects.push(fallback);
    if (!rects.length) return null;
    const context = selectionContextFor(article.innerText, text);
    return { text, contextBefore: context.before, contextAfter: context.after, rects, range: range.cloneRange() };
  }

  function renderSelectionVisuals(data) {
    clearSelectionVisuals({ keepContext: true });
    pendingSelection = data;
    selectionHighlight = document.createElement("div");
    selectionHighlight.className = "selection-ai-highlights";
    data.rects.forEach((rect) => {
      const mark = document.createElement("span");
      mark.style.left = `${rect.left}px`;
      mark.style.top = `${rect.top}px`;
      mark.style.width = `${rect.width}px`;
      mark.style.height = `${rect.height}px`;
      selectionHighlight.appendChild(mark);
    });
    document.body.appendChild(selectionHighlight);

    const anchor = data.rects[data.rects.length - 1];
    selectionAction = document.createElement("button");
    selectionAction.type = "button";
    selectionAction.className = "selection-ai-action";
    selectionAction.textContent = "Ask AI";
    selectionAction.setAttribute("aria-label", "Ask AI about selected text");
    document.body.appendChild(selectionAction);
    const buttonRect = selectionAction.getBoundingClientRect();
    const left = Math.min(window.innerWidth - buttonRect.width - 12, Math.max(12, anchor.right - buttonRect.width));
    const above = anchor.top - buttonRect.height - 10;
    const top = above > 8 ? above : Math.min(window.innerHeight - buttonRect.height - 8, anchor.bottom + 10);
    selectionAction.style.left = `${left}px`;
    selectionAction.style.top = `${top}px`;
    selectionAction.addEventListener("pointerdown", (event) => event.preventDefault());
    selectionAction.addEventListener("click", () => {
      const next = pendingSelection;
      if (!next) return;
      const isNewSelection = !activeSelection
        || activeSelection.text !== next.text
        || activeSelection.contextBefore !== next.contextBefore
        || activeSelection.contextAfter !== next.contextAfter;
      activeSelection = next;
      if (isNewSelection) {
        sessionRevision += 1;
        controller?.abort();
        controller = null;
        setComposerBusy(false);
        messages = [];
        sessionStorage.removeItem(key);
        messagesEl.innerHTML = "";
        addMessage("assistant", "New selected passage ready. Enter your question.", false);
      }
      clearSelectionVisuals({ keepContext: true });
      input.placeholder = "Ask a question about the selected passage...";
      setOpen(true);
    });
  }

  function detectSelection() {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => {
      const data = selectionData();
      if (data) renderSelectionVisuals(data);
      else if (!activeSelection) clearSelectionVisuals();
    }, 120);
  }

  function normalizeAssistantMarkdown(value) {
    const strongValues = [];

    function strongToken(content) {
      const index = strongValues.push(content) - 1;
      return `MICHELSTRONGTOKEN${index}ZXQ`;
    }

    function normalizeStrong(text) {
      return text
        .replace(/\*\*([^*\n]+?)\*\*/g, (match, content) => {
          const normalized = content.trim();
          return normalized ? strongToken(normalized) : match;
        })
        .replace(/__([^_\n]+?)__/g, (match, content) => {
          const normalized = content.trim();
          return normalized ? strongToken(normalized) : match;
        });
    }

    function normalizeOutsideInlineCode(line) {
      let output = "";
      let cursor = 0;
      const inlineCode = /(`+)(.*?)\1/g;
      let match;
      while ((match = inlineCode.exec(line))) {
        output += normalizeStrong(line.slice(cursor, match.index));
        output += match[0];
        cursor = match.index + match[0].length;
      }
      return output + normalizeStrong(line.slice(cursor));
    }

    let fence = "";
    const source = String(value || "").split("\n").map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        const markerType = marker[1][0];
        if (!fence) fence = markerType;
        else if (fence === markerType) fence = "";
        return line;
      }
      return fence ? line : normalizeOutsideInlineCode(line);
    }).join("\n");
    return { source, strongValues };
  }

  const markdown = window.markdownit ? window.markdownit({
    breaks: true,
    linkify: true,
    highlight(source, language) {
      if (window.hljs && language && window.hljs.getLanguage(language)) {
        try { return window.hljs.highlight(source, { language }).value; } catch (_) {}
      }
      return markdown?.utils?.escapeHtml(source) || source;
    }
  }) : null;

  function safeMarkdown(value) {
    if (!markdown) return document.createTextNode(value);
    const normalized = normalizeAssistantMarkdown(value);
    let raw = markdown.render(normalized.source);
    normalized.strongValues.forEach((content, index) => {
      const token = `MICHELSTRONGTOKEN${index}ZXQ`;
      raw = raw.replaceAll(token, `<strong>${markdown.utils.escapeHtml(content)}</strong>`);
    });
    const template = document.createElement("template");
    template.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
    return template.content;
  }

  function renderMessageContent(node, content) {
    node.replaceChildren(safeMarkdown(content));
    node.querySelectorAll("a[href]").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(node, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false }
          ],
          throwOnError: false,
          ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
        });
      } catch (_) {}
    }
  }

  function addMessage(role, content, persist = true) {
    const node = document.createElement("div");
    node.className = `assistant-message${role === "user" ? " is-user" : ""}`;
    renderMessageContent(node, content);
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    scheduleAssistantHeight();
    if (persist) {
      messages.push({ role, content });
      sessionStorage.setItem(key, JSON.stringify(messages.slice(-12)));
    }
    return node;
  }

  function restore() {
    try { messages = JSON.parse(sessionStorage.getItem(key) || "[]"); } catch (_) { messages = []; }
    messages.forEach((item) => addMessage(item.role, item.content, false));
    if (!messages.length) addMessage("assistant", "Ask me about the article you are reading.", false);
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.hidden = open;
    launcher.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("is-reader-assistant-open", open);
    if (open) requestAnimationFrame(() => {
      applyAssistantWidth(preferredAssistantWidth);
      scheduleAssistantHeight();
    });
    if (!open) clearSelectionVisuals();
  }

  async function sendQuestion(question, selection = activeSelection) {
    if (!question || controller) return;
    const revision = sessionRevision;
    addMessage("user", question);
    const answerNode = addMessage("assistant", "", false);
    answerNode.textContent = "Connecting to GLM-5.2...";
    const requestController = new AbortController();
    controller = requestController;
    setComposerBusy(true);
    let answer = "";
    try {
      const article = document.getElementById("post-content");
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify({
          question,
          title: document.getElementById("post-title")?.textContent || document.title,
          article: article?.innerText || "",
          url: location.href,
          selectedText: selection?.text || "",
          contextBefore: selection?.contextBefore || "",
          contextAfter: selection?.contextAfter || "",
          messages: messages.slice(-10, -1)
        })
      });
      if (!response.ok) throw new Error(await assistantErrorMessage(response));
      if (!response.body) throw new Error(`Request failed (${response.status})`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) throw new Error(payload.error);
            answer += payload.content || "";
            if (!answer && payload.status === "connecting") answerNode.textContent = "Connecting to GLM-5.2...";
            if (!answer && payload.status === "generating") answerNode.textContent = "Reading the selected context...";
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
        if (answer) renderMessageContent(answerNode, answer);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      if (!answer) throw new Error("The assistant returned an empty response.");
      if (revision === sessionRevision) {
        messages.push({ role: "assistant", content: answer });
        sessionStorage.setItem(key, JSON.stringify(messages.slice(-12)));
      }
    } catch (error) {
      if (error.name !== "AbortError") console.warn("[reader-assistant] request failed", error);
      answerNode.textContent = error.name === "AbortError" ? "Stopped." : `Unable to answer: ${publicAssistantError(error)}`;
    } finally {
      if (controller === requestController) {
        controller = null;
        setComposerBusy(false);
      }
    }
  }

  function submit(event) {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || controller) return;
    input.value = "";
    resizeInput();
    sendQuestion(question, activeSelection);
  }

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  closeButton.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", submit);
  sendButton.addEventListener("click", () => {
    if (controller) controller.abort();
    else form.requestSubmit();
  });
  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.addEventListener("selectionchange", detectSelection);
  window.addEventListener("scroll", () => {
    if (selectionAction) clearSelectionVisuals({ keepContext: true });
  }, { passive: true });
  new MutationObserver(scheduleAssistantHeight).observe(messagesEl, {
    childList: true,
    subtree: true,
    characterData: true
  });
  document.fonts?.ready?.then(scheduleAssistantHeight);
  setComposerBusy(false);
  setupAssistantResize();
  applyAssistantWidth(preferredAssistantWidth);
  resizeInput();
  restore();
})();
