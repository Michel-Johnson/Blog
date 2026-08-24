(function () {
  const panel = document.querySelector("[data-assistant-panel]");
  const launcher = document.querySelector("[data-assistant-launcher]");
  const closeButton = document.querySelector("[data-assistant-close]");
  const form = document.querySelector("[data-assistant-form]");
  const input = document.querySelector("[data-assistant-input]");
  const messagesEl = document.querySelector("[data-assistant-messages]");
  const sendButton = document.querySelector("[data-assistant-send]");
  const headerQuote = document.querySelector("[data-assistant-quote]");
  const initialResizeHandle = document.querySelector("[data-assistant-resize-handle]");
  if (!panel || !launcher || !form || !input || !messagesEl || !sendButton) return;

  const writerWorkbench = document.querySelector("[data-workbench]");
  const writerContext = writerWorkbench
    ? () => {
        const visibleEditor = (selector) => Array.from(document.querySelectorAll(selector))
          .find((node) => node.getClientRects().length && node.offsetParent !== null);
        const proseMirror = visibleEditor(".toastui-editor-ww-container .ProseMirror");
        const markdownEditor = visibleEditor(".toastui-editor-md-container .toastui-editor");
        const markdownField = document.querySelector("[data-markdown]");
        return {
          title: document.querySelector("[data-post-title]")?.value?.trim() || "Untitled draft",
          article: String(markdownField?.value || proseMirror?.innerText || ""),
          selectionRoot: proseMirror || markdownEditor || markdownField,
          url: window.location.href
        };
      }
    : null;
  const contextProvider = typeof window.MichelAssistantContext === "function"
    ? window.MichelAssistantContext
    : writerContext;
  const assistantMode = contextProvider ? "editor" : "reader";
  let messages = [];
  const messageById = new Map();
  const selectionAnchors = new Map();
  let messageSequence = 0;
  let anchorSequence = 0;
  let activeLeafId = null;
  let activeAnchorId = null;
  let controller = null;
  let inputIsComposing = false;
  let suppressEnterUntil = 0;
  let activeSelection = null;
  let pendingSelection = null;
  let pendingAnchorId = null;
  let selectionAction = null;
  let selectionHighlight = null;
  let selectionTimer = null;
  let selectionVisualFrame = 0;
  let selectionQuote = null;
  const nativeSelectionHighlights = Boolean(window.CSS?.highlights && typeof window.Highlight === "function");
  const nativeHighlightNames = {
    passive: "assistant-selection-passive",
    active: "assistant-selection-active",
    jump: "assistant-selection-jump"
  };
  let quoteJumpAnchorId = null;
  let quoteJumpTimer = 0;
  let sessionRevision = 0;
  const petFrame = launcher.querySelector("[data-assistant-pet-frame]");
  const petAnimations = {
    rest: { folder: "idle", frames: 6, interval: 260 },
    work: { folder: "typing", frames: 50, interval: 28 }
  };
  let petAnimationTimer = 0;
  let petAnimationState = "";
  let petAnimationFrame = 0;
  const assistantFrameKey = "michel.readerAssistantFrame.v1";
  const assistantDockKey = "michel.readerAssistantDock.v1";
  const assistantDockRatioKey = "michel.readerAssistantDockRatio.v1";
  const legacyAssistantWidthKey = "michel.readerAssistantWidth.v1";
  const desktopAssistantQuery = window.matchMedia("(min-width: 48rem) and (orientation: landscape) and (pointer: fine)");
  const assistantDockQuery = window.matchMedia("(min-width: 67.5rem) and (orientation: landscape) and (pointer: fine)");
  const assistantFrameMin = { width: 360, height: 340 };
  const assistantFrameDefault = { width: 520, height: 610 };
  const assistantFrameMargin = 16;
  const assistantDockEdge = 18;
  const assistantDockHold = 500;
  let assistantFrame = null;
  let assistantHeightFrame = 0;
  let assistantStreamActive = false;
  let dragState = null;
  let resizeState = null;
  let assistantDockTimer = 0;
  let assistantDocked = false;
  let assistantDockRatio = readAssistantDockRatio();
  let assistantViewport = { width: window.innerWidth, height: window.innerHeight };
  let assistantAutoFollow = true;
  let assistantTouchY = null;

  if (nativeSelectionHighlights) document.documentElement.classList.add("has-native-selection-highlights");

  function petFrameUrl(animation, frame) {
    return `./assets/jerry-pet/${animation.folder}/${String(frame).padStart(2, "0")}.png?v=jerrydeskpet-v3-20260811`;
  }

  function setPetState(state) {
    if (!petFrame || !petAnimations[state]) return;
    window.clearInterval(petAnimationTimer);
    petAnimationTimer = 0;
    petAnimationState = state;
    petAnimationFrame = 0;
    launcher.dataset.petState = state;
    petFrame.src = petFrameUrl(petAnimations[state], 0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    petAnimationTimer = window.setInterval(() => {
      if (petAnimationState !== state) return;
      petAnimationFrame = (petAnimationFrame + 1) % petAnimations[state].frames;
      petFrame.src = petFrameUrl(petAnimations[state], petAnimationFrame);
    }, petAnimations[state].interval);
  }

  if (petFrame) {
    Object.values(petAnimations).forEach((animation) => {
      for (let frame = 0; frame < animation.frames; frame += 1) {
        const image = new Image();
        image.src = petFrameUrl(animation, frame);
      }
    });
  }

  function ensureAssistantResizeHandles() {
    if (!initialResizeHandle) return [];
    initialResizeHandle.dataset.resizeEdge = "se";
    initialResizeHandle.classList.add("is-se");
    initialResizeHandle.setAttribute("aria-label", "Resize assistant from bottom right");

    const edges = ["n", "ne", "e", "s", "sw", "w", "nw"];
    edges.forEach((edge) => {
      if (panel.querySelector(`[data-assistant-resize-handle][data-resize-edge="${edge}"]`)) return;
      const handle = document.createElement("div");
      handle.className = `reader-assistant-resize-handle is-${edge}`;
      handle.dataset.assistantResizeHandle = "";
      handle.dataset.resizeEdge = edge;
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", `Resize assistant from ${edge}`);
      handle.setAttribute("aria-describedby", panel.id);
      handle.tabIndex = 0;
      panel.appendChild(handle);
    });
    return Array.from(panel.querySelectorAll("[data-assistant-resize-handle]"));
  }

  const resizeHandles = ensureAssistantResizeHandles();

  function assistantFrameBounds() {
    const maxWidth = Math.max(
      assistantFrameMin.width,
      window.innerWidth - assistantFrameMargin * 2
    );
    const maxHeight = Math.max(
      assistantFrameMin.height,
      window.innerHeight - assistantFrameMargin * 2
    );
    return { maxWidth, maxHeight };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeAssistantFrame(frame) {
    const bounds = assistantFrameBounds();
    const width = clamp(Math.round(frame.width || assistantFrameDefault.width), assistantFrameMin.width, bounds.maxWidth);
    const height = clamp(Math.round(frame.height || assistantFrameDefault.height), assistantFrameMin.height, bounds.maxHeight);
    const left = clamp(Math.round(frame.left || 0), assistantFrameMargin, Math.max(assistantFrameMargin, window.innerWidth - width - assistantFrameMargin));
    const top = clamp(Math.round(frame.top || 0), assistantFrameMargin, Math.max(assistantFrameMargin, window.innerHeight - height - assistantFrameMargin));
    return { left, top, width, height };
  }

  function defaultAssistantFrame() {
    const width = Math.min(assistantFrameDefault.width, Math.max(assistantFrameMin.width, window.innerWidth - assistantFrameMargin * 2));
    const height = Math.min(assistantFrameDefault.height, Math.max(assistantFrameMin.height, window.innerHeight - assistantFrameMargin * 2));
    return normalizeAssistantFrame({
      left: Math.max(assistantFrameMargin, window.innerWidth - width - 42),
      top: Math.max(assistantFrameMargin, window.innerHeight - height - 76),
      width,
      height
    });
  }

  function readAssistantFrame() {
    try {
      const saved = JSON.parse(localStorage.getItem(assistantFrameKey) || "null");
      if (saved && typeof saved === "object") return normalizeAssistantFrame(saved);
    } catch (_) {}
    try {
      const legacyWidth = Number.parseInt(localStorage.getItem(legacyAssistantWidthKey) || "", 10);
      if (Number.isFinite(legacyWidth)) {
        return normalizeAssistantFrame({ ...defaultAssistantFrame(), width: legacyWidth });
      }
    } catch (_) {}
    return defaultAssistantFrame();
  }

  function persistAssistantFrame() {
    if (!assistantFrame) return;
    try { localStorage.setItem(assistantFrameKey, JSON.stringify(assistantFrame)); } catch (_) {}
  }

  function readAssistantDock() {
    // Docking used to shift the whole article to the right. That makes images,
    // headings and selection actions jump when the assistant opens, so stale
    // persisted dock state is migrated to the non-destructive floating panel.
    try {
      const wasDocked = localStorage.getItem(assistantDockKey) === "left";
      localStorage.removeItem(assistantDockKey);
      if (wasDocked) localStorage.removeItem(assistantFrameKey);
    } catch (_) {}
    return false;
  }

  function persistAssistantDock() {
    try { localStorage.removeItem(assistantDockKey); } catch (_) {}
  }

  function readAssistantDockRatio() {
    try {
      const saved = Number.parseFloat(localStorage.getItem(assistantDockRatioKey) || "");
      if (Number.isFinite(saved)) return clamp(saved, .2, .72);
    } catch (_) {}
    return 1 / 3;
  }

  function assistantDockWidthBounds() {
    const min = Math.min(360, window.innerWidth * .45);
    const max = Math.max(min, Math.min(window.innerWidth - 420, window.innerWidth * .72));
    return { min, max };
  }

  function applyAssistantDockWidth(width = window.innerWidth * assistantDockRatio, { persist = false } = {}) {
    const bounds = assistantDockWidthBounds();
    const nextWidth = clamp(Math.round(width), bounds.min, bounds.max);
    assistantDockRatio = nextWidth / window.innerWidth;
    document.body.style.setProperty("--assistant-dock-width", `${nextWidth}px`);
    panel.querySelector('[data-resize-edge="e"]')?.setAttribute("aria-valuenow", String(Math.round(assistantDockRatio * 100)));
    if (persist) {
      try { localStorage.setItem(assistantDockRatioKey, String(assistantDockRatio)); } catch (_) {}
    }
    return nextWidth;
  }

  function cancelAssistantDockHold() {
    window.clearTimeout(assistantDockTimer);
    assistantDockTimer = 0;
    panel.classList.remove("is-dock-arming");
    document.body.classList.remove("is-assistant-dock-arming");
  }

  function shouldUseAssistantDock() {
    return (assistantDocked || assistantMode === "reader") && assistantDockQuery.matches;
  }

  function isAssistantDockActive() {
    return shouldUseAssistantDock() && !panel.hidden;
  }

  function syncAssistantDock() {
    const active = isAssistantDockActive();
    panel.classList.toggle("is-docked-left", active);
    document.body.classList.toggle("is-assistant-docked-left", active);
    if (active) {
      clearAssistantFrameStyles();
      applyAssistantDockWidth();
    }
  }

  function setAssistantDocked(docked, { persist = true } = {}) {
    cancelAssistantDockHold();
    assistantDocked = false;
    if (persist) persistAssistantDock();
    syncAssistantDock();
    if (desktopAssistantQuery.matches && !panel.hidden) ensureAssistantFrame();
    scheduleAssistantHeight();
  }

  function armAssistantDock() {
    cancelAssistantDockHold();
  }

  function clearAssistantFrameStyles() {
    panel.style.removeProperty("--reader-assistant-left");
    panel.style.removeProperty("--reader-assistant-top");
    panel.style.removeProperty("--reader-assistant-width");
    panel.style.removeProperty("--reader-assistant-height");
  }

  function applyAssistantFrame(frame = assistantFrame, { persist = false } = {}) {
    if (shouldUseAssistantDock()) {
      clearAssistantFrameStyles();
      return assistantFrame;
    }
    if (!desktopAssistantQuery.matches) {
      clearAssistantFrameStyles();
      return null;
    }
    assistantFrame = normalizeAssistantFrame(frame || readAssistantFrame());
    panel.style.setProperty("--reader-assistant-left", `${assistantFrame.left}px`);
    panel.style.setProperty("--reader-assistant-top", `${assistantFrame.top}px`);
    panel.style.setProperty("--reader-assistant-width", `${assistantFrame.width}px`);
    panel.style.setProperty("--reader-assistant-height", `${assistantFrame.height}px`);
    resizeHandles.forEach((handle) => {
      handle.setAttribute("aria-valuenow", `${assistantFrame.width} by ${assistantFrame.height}`);
      handle.setAttribute("aria-valuetext", `${assistantFrame.width} by ${assistantFrame.height} pixels`);
    });
    if (persist) persistAssistantFrame();
    return assistantFrame;
  }

  function ensureAssistantFrame() {
    if (!assistantFrame) assistantFrame = readAssistantFrame();
    return applyAssistantFrame(assistantFrame);
  }

  function preserveAssistantFrameViewportOffset() {
    const previous = assistantViewport;
    const current = { width: window.innerWidth, height: window.innerHeight };
    assistantViewport = current;
    if (!assistantFrame || shouldUseAssistantDock() || !desktopAssistantQuery.matches) return;
    const rightGap = previous.width - assistantFrame.left - assistantFrame.width;
    const bottomGap = previous.height - assistantFrame.top - assistantFrame.height;
    assistantFrame = normalizeAssistantFrame({
      ...assistantFrame,
      left: current.width - assistantFrame.width - rightGap,
      top: current.height - assistantFrame.height - bottomGap
    });
  }

  function setupAssistantFrameControls() {
    const header = panel.querySelector("header");
    if (header) {
      header.addEventListener("pointerdown", (event) => {
        if (!desktopAssistantQuery.matches || event.button !== 0) return;
        if (event.target.closest("button, a, input, textarea, select, [data-assistant-resize-handle]")) return;
        if (isAssistantDockActive()) return;
        event.preventDefault();
        if (assistantDocked) {
          const saved = assistantFrame || readAssistantFrame();
          dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            savedFrame: saved,
            startedDocked: true,
            atDockEdge: false,
            docked: false
          };
          panel.classList.add("is-dragging");
          document.body.classList.add("is-dragging-assistant");
          header.setPointerCapture?.(event.pointerId);
          return;
        }
        const current = ensureAssistantFrame();
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: current.left,
          top: current.top,
          atDockEdge: false,
          docked: false
        };
        panel.classList.add("is-dragging");
        document.body.classList.add("is-dragging-assistant");
        header.setPointerCapture?.(event.pointerId);
      });

      function finishDrag(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        header.releasePointerCapture?.(event.pointerId);
        const completedDock = dragState.docked;
        const remainedDocked = dragState.startedDocked;
        dragState = null;
        cancelAssistantDockHold();
        panel.classList.remove("is-dragging");
        document.body.classList.remove("is-dragging-assistant");
        if (!completedDock && !remainedDocked) persistAssistantFrame();
      }

      document.addEventListener("pointermove", (event) => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        if (dragState.docked) return;
        if (dragState.startedDocked) {
          if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 6) return;
          const saved = dragState.savedFrame;
          setAssistantDocked(false);
          assistantFrame = normalizeAssistantFrame({
            ...saved,
            left: event.clientX - Math.min(saved.width * .5, 180),
            top: event.clientY - 34
          });
          dragState.left = assistantFrame.left;
          dragState.top = assistantFrame.top;
          dragState.startX = event.clientX;
          dragState.startY = event.clientY;
          dragState.startedDocked = false;
        }
        const desiredLeft = dragState.left + event.clientX - dragState.startX;
        dragState.atDockEdge = desiredLeft <= assistantDockEdge;
        if (dragState.atDockEdge) armAssistantDock();
        else cancelAssistantDockHold();
        applyAssistantFrame({
          ...assistantFrame,
          left: desiredLeft,
          top: dragState.top + event.clientY - dragState.startY
        });
      });
      document.addEventListener("pointerup", finishDrag);
      document.addEventListener("pointercancel", finishDrag);
    }

    if (!resizeHandles.length) return;
    resizeHandles.forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (!desktopAssistantQuery.matches || event.button !== 0) return;
        const edge = handle.dataset.resizeEdge || "se";
        const docked = isAssistantDockActive();
        if (docked && edge !== "e") return;
        event.preventDefault();
        event.stopPropagation();
        const current = docked ? null : ensureAssistantFrame();
        resizeState = {
          pointerId: event.pointerId,
          edge,
          handle,
          startX: event.clientX,
          startY: event.clientY,
          docked,
          dockWidth: docked ? panel.getBoundingClientRect().width : 0,
          frame: current ? { ...current } : null
        };
        handle.setPointerCapture?.(event.pointerId);
        handle.classList.add("is-active");
        document.body.classList.add("is-resizing-assistant");
        document.body.dataset.assistantResizeEdge = resizeState.edge;
      });
    });

    document.addEventListener("pointermove", (event) => {
      if (!resizeState || event.pointerId !== resizeState.pointerId) return;
      const dx = event.clientX - resizeState.startX;
      const dy = event.clientY - resizeState.startY;
      if (resizeState.docked) {
        applyAssistantDockWidth(resizeState.dockWidth + dx);
        return;
      }
      const edge = resizeState.edge;
      const start = resizeState.frame;
      const right = start.left + start.width;
      const bottom = start.top + start.height;
      const next = { ...start };

      if (edge.includes("w")) {
        next.left = clamp(
          start.left + dx,
          assistantFrameMargin,
          right - assistantFrameMin.width
        );
        next.width = right - next.left;
      } else if (edge.includes("e")) {
        next.width = clamp(
          start.width + dx,
          assistantFrameMin.width,
          window.innerWidth - start.left - assistantFrameMargin
        );
      }

      if (edge.includes("n")) {
        next.top = clamp(
          start.top + dy,
          assistantFrameMargin,
          bottom - assistantFrameMin.height
        );
        next.height = bottom - next.top;
      } else if (edge.includes("s")) {
        next.height = clamp(
          start.height + dy,
          assistantFrameMin.height,
          window.innerHeight - start.top - assistantFrameMargin
        );
      }

      applyAssistantFrame(next);
    });

    function finishResize(event) {
      if (!resizeState || event.pointerId !== resizeState.pointerId) return;
      const wasDocked = resizeState.docked;
      resizeState.handle.releasePointerCapture?.(event.pointerId);
      resizeState.handle.classList.remove("is-active");
      resizeState = null;
      document.body.classList.remove("is-resizing-assistant");
      delete document.body.dataset.assistantResizeEdge;
      if (wasDocked) applyAssistantDockWidth(undefined, { persist: true });
      else persistAssistantFrame();
    }

    document.addEventListener("pointerup", finishResize);
    document.addEventListener("pointercancel", finishResize);
    resizeHandles.forEach((handle) => {
      handle.addEventListener("keydown", (event) => {
        if (!desktopAssistantQuery.matches) return;
        const edge = handle.dataset.resizeEdge || "se";
        const step = event.shiftKey ? 40 : 12;
        let dx = 0;
        let dy = 0;
        if (event.key === "ArrowLeft") dx = -step;
        if (event.key === "ArrowRight") dx = step;
        if (event.key === "ArrowUp") dy = -step;
        if (event.key === "ArrowDown") dy = step;
        if (!dx && !dy) return;
        event.preventDefault();

        if (isAssistantDockActive()) {
          if (edge === "e" && dx) applyAssistantDockWidth(panel.getBoundingClientRect().width + dx, { persist: true });
          return;
        }

        const current = ensureAssistantFrame();
        const next = { ...current };
        if (edge.includes("w") && dx) {
          next.left += dx;
          next.width -= dx;
        } else if (edge.includes("e") && dx) {
          next.width += dx;
        }
        if (edge.includes("n") && dy) {
          next.top += dy;
          next.height -= dy;
        } else if (edge.includes("s") && dy) {
          next.height += dy;
        }
        applyAssistantFrame(next, { persist: true });
      });
    });

    window.addEventListener("resize", () => {
      preserveAssistantFrameViewportOffset();
      syncAssistantDock();
      if (desktopAssistantQuery.matches && !shouldUseAssistantDock()) applyAssistantFrame(assistantFrame || readAssistantFrame(), { persist: true });
      else clearAssistantFrameStyles();
      scheduleAssistantHeight();
    });
    desktopAssistantQuery.addEventListener?.("change", () => {
      syncAssistantDock();
      if (desktopAssistantQuery.matches && !shouldUseAssistantDock()) ensureAssistantFrame();
      else clearAssistantFrameStyles();
      scheduleAssistantHeight();
    });
    assistantDockQuery.addEventListener?.("change", () => {
      cancelAssistantDockHold();
      syncAssistantDock();
      if (!assistantDockQuery.matches && desktopAssistantQuery.matches) ensureAssistantFrame();
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
    // Streaming replaces the answer DOM frequently. Keep the outer frame fixed
    // until the response is complete so the document never follows token-level
    // content growth.
    if (assistantStreamActive && !assistantFrame) return;
    if (assistantHeightFrame) return;
    assistantHeightFrame = requestAnimationFrame(() => {
      assistantHeightFrame = 0;
      if (assistantStreamActive && !assistantFrame) return;
      if (!desktopAssistantQuery.matches) {
        panel.style.removeProperty("--reader-assistant-height");
        return;
      }
      if (assistantFrame) {
        applyAssistantFrame(assistantFrame);
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

  function setAssistantStreamActive(active) {
    if (active && desktopAssistantQuery.matches && !assistantFrame && !panel.hidden) {
      const currentHeight = Math.round(panel.getBoundingClientRect().height);
      if (currentHeight > 0) {
        panel.style.setProperty("--reader-assistant-height", `${currentHeight}px`);
      }
    }
    assistantStreamActive = active;
    panel.classList.toggle("is-streaming", active);
    if (!active) scheduleAssistantHeight();
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

  function selectionPreview(value, limit = 24) {
    const text = compactText(value);
    if (!text) return "";
    const characters = Array.from(text);
    const preview = characters.slice(0, limit).join("");
    return characters.length > limit ? `${preview}…` : preview;
  }

  function currentAssistantContext() {
    let provided = null;
    try {
      provided = contextProvider?.() || null;
    } catch (error) {
      console.warn("[reader-assistant] context provider failed", error);
    }
    const fallbackRoot = document.getElementById("post-content");
    return {
      title: String(provided?.title || document.getElementById("post-title")?.textContent || document.title),
      article: String(provided?.article || fallbackRoot?.innerText || ""),
      selectionRoot: provided?.selectionRoot instanceof Element ? provided.selectionRoot : fallbackRoot,
      url: String(provided?.url || location.href)
    };
  }

  function clearSelectionVisuals({ keepContext = false } = {}) {
    selectionAction?.remove();
    selectionAction = null;
    pendingSelection = null;
    if (!keepContext) {
      if (pendingAnchorId) {
        const pendingAnchor = selectionAnchors.get(pendingAnchorId);
        if (pendingAnchor?.pending) removeSelectionAnchor(pendingAnchorId);
        pendingAnchorId = null;
      }
      activeSelection = null;
      activeAnchorId = null;
      selectionAnchors.forEach((anchor) => anchor.element?.classList.remove("is-active"));
      if (selectionQuote) {
        selectionQuote.textContent = "";
        selectionQuote.hidden = true;
      }
      input.placeholder = "";
      syncNativeSelectionHighlights();
    }
  }

  function ensureSelectionQuote() {
    if (selectionQuote?.isConnected) return selectionQuote;
    selectionQuote = headerQuote;
    if (!selectionQuote) return null;
    selectionQuote.setAttribute("aria-live", "polite");
    return selectionQuote;
  }

  function updateSelectionQuote(content) {
    const preview = selectionPreview(content, 72);
    const quote = ensureSelectionQuote();
    if (!quote) return null;
    if (!preview) {
      quote.hidden = true;
      return null;
    }
    quote.textContent = `“${preview}”`;
    quote.hidden = false;
    return quote;
  }

  function removeSelectionAnchor(anchorId) {
    if (!anchorId) return false;
    const anchor = selectionAnchors.get(anchorId);
    if (!anchor) return false;
    anchor.element?.remove();
    selectionAnchors.delete(anchorId);
    if (quoteJumpAnchorId === anchorId) quoteJumpAnchorId = null;
    if (selectionHighlight === anchor.element) selectionHighlight = null;
    syncNativeSelectionHighlights();
    return true;
  }

  function cancelActiveSelection({ focus = true } = {}) {
    const anchorId = activeAnchorId || activeSelection?.anchorId || null;
    window.getSelection?.()?.removeAllRanges();
    if (selectionAnchors.get(anchorId)?.pending) removeSelectionAnchor(anchorId);
    clearSelectionVisuals();
    refreshBranchVisibility();
    if (focus) focusComposer();
  }

  function isDockedAssistantVisible() {
    return isAssistantDockActive();
  }

  function applyActiveSelection(anchor, next, { focus = true } = {}) {
    activeAnchorId = anchor.id;
    activeSelection = anchor.selection;
    selectionAnchors.forEach((item) => item.element?.classList.toggle("is-active", item.id === anchor.id));
    syncNativeSelectionHighlights();
    selectionHighlight = anchor.element;
    activeLeafId = anchor.lastLeafId || anchor.sourceMessageId || null;
    updateSelectionQuote(next.text);
    clearSelectionVisuals({ keepContext: true });
    refreshBranchVisibility();
    input.placeholder = "";
    if (focus) openAndFocusComposer();
  }

  function activateSelection(next, { focus = true } = {}) {
    if (!next) return;
    const anchor = ensureSelectionAnchor(next);
    applyActiveSelection(anchor, next, { focus });
  }

  function activatePendingSelection(next, { focus = true } = {}) {
    if (!next) return;
    if (pendingAnchorId) {
      const previous = selectionAnchors.get(pendingAnchorId);
      if (previous?.pending) removeSelectionAnchor(pendingAnchorId);
      pendingAnchorId = null;
    }
    const anchor = ensureSelectionAnchor(next, { pending: true });
    pendingAnchorId = anchor.id;
    applyActiveSelection(anchor, next, { focus });
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

  function textRangeRects(range) {
    if (!range) return [];
    const ancestor = range.commonAncestorContainer;
    const root = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;
    if (!(root instanceof Element)) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const rects = [];
    let node = ancestor.nodeType === Node.TEXT_NODE ? ancestor : walker.nextNode();
    while (node) {
      if (range.intersectsNode(node)) {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.length;
        if (end > start && /\S/.test(node.data.slice(start, end))) {
          const fragment = document.createRange();
          fragment.setStart(node, start);
          fragment.setEnd(node, end);
          Array.from(fragment.getClientRects()).forEach((rect) => {
            if (rect.width > 1 && rect.height > 3) rects.push(rect);
          });
        }
      }
      if (ancestor.nodeType === Node.TEXT_NODE) break;
      node = walker.nextNode();
    }
    if (!rects.length) {
      const fallback = range.getBoundingClientRect();
      if (fallback.width > 1 && fallback.height > 3) rects.push(fallback);
    }
    return rects;
  }

  function clippedSelectionRects(rects, clipRect = null) {
    const clipped = rects.map((rect) => {
      if (!clipRect) return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      return {
        left: Math.max(rect.left, clipRect.left),
        top: Math.max(rect.top, clipRect.top),
        right: Math.min(rect.right, clipRect.right),
        bottom: Math.min(rect.bottom, clipRect.bottom)
      };
    }).filter((rect) => rect.right - rect.left > 1 && rect.bottom - rect.top > 3);

    clipped.sort((a, b) => Math.abs(a.top - b.top) < 2 ? a.left - b.left : a.top - b.top);
    return clipped.reduce((merged, rect) => {
      const previous = merged[merged.length - 1];
      const sameLine = previous
        && Math.abs(previous.top - rect.top) < 2
        && Math.abs(previous.bottom - rect.bottom) < 2;
      if (sameLine && rect.left <= previous.right + 3) {
        previous.right = Math.max(previous.right, rect.right);
        previous.bottom = Math.max(previous.bottom, rect.bottom);
      } else {
        merged.push({ ...rect });
      }
      return merged;
    }, []);
  }

  function selectionData() {
    const selection = window.getSelection?.();
    const context = currentAssistantContext();
    const article = context.selectionRoot;
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    if (!(container instanceof Element)) return null;
    const assistantAnswer = container.closest(".assistant-message:not(.is-user):not(.is-selection-preview)");
    const selectionRoot = assistantAnswer || article;
    if (!selectionRoot || !selectionRoot.contains(container)) return null;
    if (container.closest("button, input, textarea, a, [contenteditable='true']")) return null;
    const text = compactText(selection.toString()).slice(0, 4000);
    if (!text) return null;
    const rects = clippedSelectionRects(textRangeRects(range));
    if (!rects.length) return null;
    const nearby = selectionContextFor(selectionRoot.innerText, text);
    return {
      text,
      contextBefore: nearby.before,
      contextAfter: nearby.after,
      rects,
      range: range.cloneRange(),
      origin: assistantAnswer ? "assistant" : "article",
      sourceMessageId: assistantAnswer?.dataset.messageId || null
    };
  }

  function selectionAnchorKey(data) {
    return [data.origin, data.sourceMessageId || "article", data.text, data.contextBefore, data.contextAfter].join("\u241f");
  }

  function createSelectionLayer(anchor) {
    const layer = document.createElement("div");
    layer.className = "selection-ai-highlights is-persistent";
    layer.dataset.branchAnchorId = anchor.id;
    layer.addEventListener("pointerdown", (event) => event.preventDefault());
    layer.addEventListener("click", () => {
      if (anchor.pending) activatePendingSelection(anchor.selection);
      else activateSelection(anchor.selection);
    });
    document.body.appendChild(layer);
    anchor.element = layer;
    syncSelectionAnchor(anchor);
    return layer;
  }

  function ensureSelectionAnchor(data, { pending = false } = {}) {
    const referenced = data.anchorId ? selectionAnchors.get(data.anchorId) : null;
    if (referenced) {
      if (data.range) referenced.selection.range = data.range.cloneRange();
      referenced.selection.rects = data.rects || referenced.selection.rects;
      syncSelectionAnchor(referenced);
      return referenced;
    }
    const key = selectionAnchorKey(data);
    const existing = Array.from(selectionAnchors.values()).find((anchor) => anchor.key === key);
    if (existing) {
      if (data.range) existing.selection.range = data.range.cloneRange();
      existing.selection.rects = data.rects;
      syncSelectionAnchor(existing);
      return existing;
    }
    const anchor = {
      id: `anchor-${++anchorSequence}`,
      key,
      sourceMessageId: data.sourceMessageId || null,
      lastLeafId: null,
      selection: { ...data, range: data.range?.cloneRange?.() || data.range },
      element: null,
      pending
    };
    anchor.selection.anchorId = anchor.id;
    selectionAnchors.set(anchor.id, anchor);
    createSelectionLayer(anchor);
    return anchor;
  }

  function renderSelectionVisuals(data) {
    selectionAction?.remove();
    selectionAction = null;
    pendingSelection = data;

    // The writer supplies its own two-action selection toolbar.
    if (assistantMode === "editor" && data.origin !== "assistant") return;

    if (data.origin === "assistant") {
      activatePendingSelection(data, { focus: false });
      return;
    }

    // The selected passage can go straight into an already-visible docked
    // composer. A second floating action would only duplicate that workflow.
    if (isDockedAssistantVisible()) {
      activatePendingSelection(data, { focus: false });
      return;
    }

    const visibleRects = data.rects.filter((rect) => (
      rect.bottom >= 0
      && rect.top <= window.innerHeight
      && rect.right >= 0
      && rect.left <= window.innerWidth
    ));
    const anchor = visibleRects[visibleRects.length - 1] || data.rects[0];
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
      activatePendingSelection(pendingSelection);
    });
  }

  function liveSelectionRects(data) {
    if (!data?.range) return [];
    const ancestor = data.range.commonAncestorContainer;
    const anchor = ancestor?.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;
    if (!(anchor instanceof Element) || !anchor.isConnected) return [];
    const clipRect = data.origin === "assistant" ? messagesEl.getBoundingClientRect() : null;
    return clippedSelectionRects(textRangeRects(data.range), clipRect);
  }

  function syncSelectionAnchor(anchor) {
    const layer = anchor?.element;
    if (!layer?.isConnected) return;
    const rects = liveSelectionRects(anchor.selection);
    if (!rects.length) {
      layer.hidden = true;
      return;
    }
    const source = anchor.sourceMessageId ? messageById.get(anchor.sourceMessageId)?.node : null;
    layer.hidden = Boolean(source?.hidden);
    if (layer.hidden) return;
    while (layer.children.length < rects.length) {
      const mark = document.createElement("span");
      mark.setAttribute("role", "button");
      mark.tabIndex = 0;
      mark.setAttribute("aria-label", `Open branch for quoted text: ${selectionPreview(anchor.selection.text, 48)}`);
      mark.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateSelection(anchor.selection);
      });
      layer.appendChild(mark);
    }
    while (layer.children.length > rects.length) layer.lastElementChild?.remove();
    rects.forEach((rect, index) => {
      const mark = layer.children[index];
      mark.style.left = `${rect.left}px`;
      mark.style.top = `${rect.top}px`;
      mark.style.width = `${rect.right - rect.left}px`;
      mark.style.height = `${rect.bottom - rect.top}px`;
    });
  }

  function syncSelectionHighlightToText() {
    selectionVisualFrame = 0;
    selectionAnchors.forEach(syncSelectionAnchor);
    selectionHighlight = activeAnchorId ? selectionAnchors.get(activeAnchorId)?.element || null : null;
    syncNativeSelectionHighlights();
  }

  function setNativeHighlight(name, ranges) {
    if (!nativeSelectionHighlights) return;
    if (ranges.length) window.CSS.highlights.set(name, new window.Highlight(...ranges));
    else window.CSS.highlights.delete(name);
  }

  function syncNativeSelectionHighlights() {
    if (!nativeSelectionHighlights) return;
    const groups = { passive: [], active: [], jump: [] };
    selectionAnchors.forEach((anchor) => {
      const range = anchor.selection?.range;
      const ancestor = range?.commonAncestorContainer;
      const element = ancestor?.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;
      if (!range || !(element instanceof Element) || !element.isConnected) return;
      if (anchor.id === quoteJumpAnchorId) groups.jump.push(range);
      else if (anchor.id === activeAnchorId) groups.active.push(range);
      else groups.passive.push(range);
    });
    setNativeHighlight(nativeHighlightNames.passive, groups.passive);
    setNativeHighlight(nativeHighlightNames.active, groups.active);
    setNativeHighlight(nativeHighlightNames.jump, groups.jump);
  }

  function flashSelectionAnchor(anchorId) {
    window.clearTimeout(quoteJumpTimer);
    quoteJumpAnchorId = anchorId || null;
    selectionAnchors.get(anchorId)?.element?.classList.add("is-quote-jump");
    syncNativeSelectionHighlights();
    quoteJumpTimer = window.setTimeout(() => {
      selectionAnchors.get(anchorId)?.element?.classList.remove("is-quote-jump");
      if (quoteJumpAnchorId === anchorId) quoteJumpAnchorId = null;
      syncNativeSelectionHighlights();
    }, 1100);
  }

  function scheduleSelectionVisualSync() {
    if (!selectionAnchors.size || selectionVisualFrame) return;
    selectionVisualFrame = window.requestAnimationFrame(syncSelectionHighlightToText);
  }

  function handleAssistantMessageScroll() {
    scheduleSelectionVisualSync();
    assistantAutoFollow = assistantIsNearBottom();
  }

  function assistantIsNearBottom(threshold = 72) {
    return messagesEl.scrollHeight - messagesEl.clientHeight - messagesEl.scrollTop <= threshold;
  }

  function followAssistantBottom({ force = false } = {}) {
    if (!force && !assistantAutoFollow) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function pauseAssistantAutoFollow() {
    assistantAutoFollow = false;
  }

  function detectSelection() {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => {
      const data = selectionData();
      if (data) renderSelectionVisuals(data);
      else if (!pendingAnchorId) {
        selectionAction?.remove();
        selectionAction = null;
        pendingSelection = null;
      }
    }, 120);
  }

  document.addEventListener("scroll", scheduleSelectionVisualSync, true);
  window.addEventListener("resize", scheduleSelectionVisualSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleSelectionVisualSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleSelectionVisualSync, { passive: true });

  window.MichelAssistant = {
    activateSelection(next) {
      activateSelection(next, { focus: true });
    }
  };

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

  function findQuotedTextInAnswers(text, before = "", after = "") {
    const target = compactText(text);
    if (!target) return null;
    const answers = Array.from(messagesEl.querySelectorAll(".assistant-message:not(.is-user):not(.is-selection-preview)"));
    let best = null;
    answers.forEach((answer) => {
      const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const value = compactText(node.nodeValue);
        const index = value.indexOf(target);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const answerText = compactText(answer.innerText);
        const score = (before && answerText.includes(compactText(before).slice(-36)) ? 1 : 0)
          + (after && answerText.includes(compactText(after).slice(0, 36)) ? 1 : 0);
        if (!best || score > best.score) best = { range, score };
      }
    });
    return best?.range || null;
  }

  function jumpToMessageQuote(selection) {
    if (!selection?.text) return;
    const range = liveSelectionRects(selection).length
      ? selection.range
      : findQuotedTextInAnswers(selection.text, selection.contextBefore, selection.contextAfter);
    if (!range) return;
    const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    activeSelection = {
      ...selection,
      range: range.cloneRange(),
      origin: "assistant",
      sourceMessageId: ancestor?.closest?.(".assistant-message")?.dataset.messageId || selection.sourceMessageId || null
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      renderSelectionVisuals(activeSelection);
      window.requestAnimationFrame(() => {
        const sourceMessage = ancestor?.closest?.(".assistant-message");
        if (sourceMessage && messagesEl.contains(sourceMessage)) {
          const targetRect = range.getBoundingClientRect();
          const viewportRect = messagesEl.getBoundingClientRect();
          messagesEl.scrollTop = Math.max(0, messagesEl.scrollTop + targetRect.top - viewportRect.top - messagesEl.clientHeight / 2);
        } else {
          ancestor?.scrollIntoView({ behavior: "auto", block: "center" });
        }
        flashSelectionAnchor(activeSelection.anchorId);
        window.requestAnimationFrame(syncSelectionHighlightToText);
      });
    }));
  }

  function attachQuoteJump(node, selection) {
    if (!selection?.text || selection.origin !== "assistant") return;
    node.classList.add("has-quote-jump");
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "assistant-quote-jump";
    jump.setAttribute("aria-label", `Jump to quoted text: ${selectionPreview(selection.text, 40)}`);
    jump.setAttribute("title", "Jump to quoted text");
    jump.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 18 7 7M7 7v8M7 7h8"></path></svg>';
    jump.addEventListener("click", () => jumpToMessageQuote(selection));
    node.appendChild(jump);
  }

  function nextMessageId() {
    return `message-${++messageSequence}`;
  }

  function messagePath(leafId) {
    const path = [];
    const visited = new Set();
    let current = leafId ? messageById.get(leafId) : null;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parentId ? messageById.get(current.parentId) : null;
    }
    return path;
  }

  function branchPayload(leafId) {
    return messagePath(leafId).map(({ role, content }) => ({ role, content }));
  }

  function refreshBranchVisibility() {
    const visible = new Set(messagePath(activeLeafId).map((item) => item.id));
    messages.forEach((message) => {
      message.node.hidden = visible.size ? !visible.has(message.id) : true;
    });
    messagesEl.querySelectorAll("[data-assistant-intro]").forEach((node) => {
      node.hidden = visible.size > 0;
    });
    selectionAnchors.forEach(syncSelectionAnchor);
    scheduleAssistantHeight();
    window.requestAnimationFrame(scheduleSelectionVisualSync);
  }

  function addMessage(role, content, track = true, selection = null, parentId = activeLeafId) {
    const node = document.createElement("div");
    node.className = `assistant-message${role === "user" ? " is-user" : ""}`;
    renderMessageContent(node, content);
    if (role === "user") attachQuoteJump(node, selection);
    messagesEl.appendChild(node);
    if (track) {
      const message = {
        id: nextMessageId(),
        role,
        content,
        parentId: parentId || null,
        anchorId: selection?.anchorId || null,
        node,
        ...(selection?.origin === "assistant" ? {
          quote: {
            text: selection.text,
            contextBefore: selection.contextBefore,
            contextAfter: selection.contextAfter,
            origin: "assistant"
          }
        } : {})
      };
      node.dataset.messageId = message.id;
      messages.push(message);
      messageById.set(message.id, message);
      activeLeafId = message.id;
    }
    refreshBranchVisibility();
    followAssistantBottom();
    return node;
  }

  function addSelectionPreview(content) {
    return updateSelectionQuote(content);
  }

  function restore() {
    assistantAutoFollow = true;
    ensureSelectionQuote();
    messages = [];
    messageById.clear();
    const intro = addMessage("assistant", "Ask me about the article you are reading.", false);
    intro.dataset.assistantIntro = "";
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.hidden = open && !petFrame;
    launcher.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("is-reader-assistant-open", open);
    if (open) requestAnimationFrame(() => {
      syncAssistantDock();
      if (!shouldUseAssistantDock()) ensureAssistantFrame();
      scheduleAssistantHeight();
    });
    if (!open) {
      cancelAssistantDockHold();
      syncAssistantDock();
      clearSelectionVisuals();
      window.requestAnimationFrame(scheduleSelectionVisualSync);
    }
  }

  function focusComposer() {
    if (panel.hidden || input.disabled) return;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  function openAndFocusComposer() {
    setOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(focusComposer));
  }

  async function sendQuestion(question, selection = activeSelection) {
    if (!question || controller) return;
    assistantAutoFollow = true;
    const revision = sessionRevision;
    const anchor = selection?.anchorId ? selectionAnchors.get(selection.anchorId) : null;
    if (anchor && pendingAnchorId === anchor.id) {
      anchor.pending = false;
      pendingAnchorId = null;
    }
    const parentId = selection
      ? (anchor?.sourceMessageId || null)
      : activeLeafId;
    const history = branchPayload(parentId);
    const userNode = addMessage("user", question, true, selection, parentId);
    const userId = userNode.dataset.messageId;
    const answerNode = addMessage("assistant", "", true, null, userId);
    const answerId = answerNode.dataset.messageId;
    if (anchor) anchor.lastLeafId = answerId;
    answerNode.textContent = "Connecting...";
    const requestController = new AbortController();
    controller = requestController;
    setComposerBusy(true);
    setPetState("work");
    setAssistantStreamActive(true);
    let answer = "";
    let streamRenderFrame = 0;
    const renderStreamAnswer = () => {
      streamRenderFrame = 0;
      if (answer) renderMessageContent(answerNode, answer);
      followAssistantBottom();
    };
    const queueStreamRender = () => {
      if (streamRenderFrame) return;
      streamRenderFrame = requestAnimationFrame(renderStreamAnswer);
    };
    const flushStreamRender = () => {
      if (streamRenderFrame) cancelAnimationFrame(streamRenderFrame);
      streamRenderFrame = 0;
      if (answer) renderMessageContent(answerNode, answer);
      followAssistantBottom();
    };
    try {
      const context = currentAssistantContext();
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify({
          question,
          title: context.title,
          article: context.article,
          url: context.url,
          selectedText: selection?.text || "",
          contextBefore: selection?.contextBefore || "",
          contextAfter: selection?.contextAfter || "",
          selectionOrigin: selection?.origin || "article",
          branchPath: history
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
            if (!answer && payload.status === "connecting") answerNode.textContent = "Connecting...";
            if (!answer && payload.status === "generating") answerNode.textContent = "Reading the selected context...";
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
        queueStreamRender();
      }
      flushStreamRender();
      if (!answer) throw new Error("The assistant returned an empty response.");
      if (revision === sessionRevision) {
        const answerMessage = messageById.get(answerId);
        if (answerMessage) answerMessage.content = answer;
      }
    } catch (error) {
      if (streamRenderFrame) cancelAnimationFrame(streamRenderFrame);
      streamRenderFrame = 0;
      if (error.name !== "AbortError") console.warn("[reader-assistant] request failed", error);
      const errorText = error.name === "AbortError" ? "Stopped." : `Unable to answer: ${publicAssistantError(error)}`;
      answerNode.textContent = errorText;
      const answerMessage = messageById.get(answerId);
      if (answerMessage) answerMessage.content = errorText;
    } finally {
      if (streamRenderFrame) cancelAnimationFrame(streamRenderFrame);
      streamRenderFrame = 0;
      setAssistantStreamActive(false);
      if (controller === requestController) {
        controller = null;
        setComposerBusy(false);
        setPetState("rest");
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

  launcher.addEventListener("click", openAndFocusComposer);
  closeButton.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", submit);
  sendButton.addEventListener("click", () => {
    if (controller) controller.abort();
    else form.requestSubmit();
  });
  input.addEventListener("input", resizeInput);
  input.addEventListener("compositionstart", () => {
    inputIsComposing = true;
  });
  input.addEventListener("compositionend", () => {
    inputIsComposing = false;
    // Chromium may dispatch the Enter that confirmed an IME candidate just
    // after compositionend, when KeyboardEvent.isComposing is already false.
    suppressEnterUntil = Date.now() + 40;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeSelection) {
      event.preventDefault();
      cancelActiveSelection();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.isComposing || inputIsComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (Date.now() < suppressEnterUntil) {
      suppressEnterUntil = 0;
      return;
    }
    form.requestSubmit();
  });
  document.addEventListener("selectionchange", detectSelection);
  document.addEventListener("pointerdown", (event) => {
    if (!pendingAnchorId || event.button > 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-assistant-panel], .selection-ai-action, .selection-ai-highlights")) return;
    cancelActiveSelection({ focus: false });
  });
  messagesEl.addEventListener("scroll", handleAssistantMessageScroll, { passive: true });
  messagesEl.addEventListener("wheel", (event) => {
    if (event.deltaY < 0) pauseAssistantAutoFollow();
  }, { passive: true });
  messagesEl.addEventListener("touchstart", (event) => {
    assistantTouchY = event.touches[0]?.clientY ?? null;
  }, { passive: true });
  messagesEl.addEventListener("touchmove", (event) => {
    const nextY = event.touches[0]?.clientY;
    if (assistantTouchY !== null && nextY !== undefined && nextY > assistantTouchY + 2) {
      pauseAssistantAutoFollow();
    }
    if (nextY !== undefined) assistantTouchY = nextY;
  }, { passive: true });
  messagesEl.addEventListener("touchend", () => {
    assistantTouchY = null;
  }, { passive: true });
  new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === "class")) syncAssistantDock();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
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
  setPetState("rest");
  assistantDocked = readAssistantDock();
  setupAssistantFrameControls();
  syncAssistantDock();
  if (!shouldUseAssistantDock()) ensureAssistantFrame();
  resizeInput();
  restore();
})();
