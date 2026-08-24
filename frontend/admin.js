(function () {
  const loginPanel = document.querySelector("[data-login-panel]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const draftInbox = document.querySelector("[data-draft-inbox]");
  const draftInboxListEl = document.querySelector("[data-draft-inbox-list]");
  const writerModeEl = document.querySelector("[data-writer-mode]");
  const workbench = document.querySelector("[data-workbench]");
  const logoutButton = document.querySelector("[data-logout]");
  const saveStatus = document.querySelector("[data-save-status]");
  const dropZone = document.querySelector("[data-drop-zone]");
  const richEditorEl = document.querySelector("[data-rich-editor]");
  const htmlVisualEditor = document.querySelector("[data-html-visual-editor]");
  const undoButton = document.querySelector("[data-undo]");
  const unpublishButton = document.querySelector("[data-unpublish]");
  const publishButton = document.querySelector("[data-publish]");
  const unpublishDialog = document.querySelector("[data-unpublish-dialog]");
  const deletePostButton = document.querySelector("[data-delete-post]");
  const deleteDialog = document.querySelector("[data-delete-dialog]");
  const deleteDialogTitle = document.querySelector("[data-delete-dialog-title]");
  const deleteDialogCopy = document.querySelector("[data-delete-dialog-copy]");
  const annotationDialog = document.querySelector("[data-annotation-dialog]");
  const annotationForm = document.querySelector("[data-annotation-form]");
  const annotationHeading = document.querySelector("[data-annotation-heading]");
  const annotationSelected = document.querySelector("[data-annotation-selected]");
  const annotationRemoveButton = document.querySelector("[data-annotation-remove]");
  const annotationCancelButton = document.querySelector("[data-annotation-cancel]");
  const annotationBody = annotationForm?.elements.body;
  const newDraftButton = document.querySelector("[data-new-draft]");
  const refreshDraftsButton = document.querySelector("[data-refresh-drafts]");
  const draftListEl = document.querySelector("[data-draft-list]");
  const excerptModeEl = document.querySelector("[data-excerpt-mode]");
  const generateSummaryButton = document.querySelector("[data-generate-summary]");
  const leaseTakeoverButton = document.querySelector("[data-lease-takeover]");
  const postViewCountEl = document.querySelector("[data-post-view-count]");
  const mobileViewButtons = Array.from(document.querySelectorAll("[data-mobile-view-button]"));
  const fields = {
    title: document.querySelector("[data-post-title]"),
    slug: document.querySelector("[data-post-slug]"),
    category: document.querySelector("[data-post-category]"),
    date: document.querySelector("[data-post-date]"),
    tags: document.querySelector("[data-post-tags]"),
    excerpt: document.querySelector("[data-post-excerpt]"),
    markdown: document.querySelector("[data-markdown]"),
    preview: document.querySelector("[data-preview]"),
    image: document.querySelector("[data-image-input]")
  };
  const adminParams = new URLSearchParams(window.location.search);
  const editSlug = adminParams.get("edit") || "";
  const returnUrl = adminParams.get("return") || "";
  const openDraftInbox = !editSlug && adminParams.get("drafts") === "1";
  const createBlankPost = !editSlug && adminParams.get("new") === "1";
  let csrfToken = "";
  let richEditor = null;
  let syncingEditor = false;
  let selectedImage = null;
  let selectedImageNode = null;
  let imageOverlay = null;
  let imageDrag = null;
  let pendingImagePlacement = null;
  let selectedLayoutSpacerId = "";
  let activeDraftId = "";
  let activeDraftSlug = editSlug || "";
  let activeRevision = 0;
  let activeLeaseHeld = false;
  let leaseHeartbeatTimer = null;
  let draftEventSource = null;
  let applyingRemoteDraft = false;
  let autosaveTimer = null;
  let editorMathTimer = null;
  let mathOverlayLayer = null;
  let mathOverlayHitboxes = [];
  let activeMathEditUntil = 0;
  let suppressMathEditPointerUntil = 0;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let deleteInProgress = false;
  let suppressLocalDraftSave = false;
  let publishInProgress = false;
  let unpublishInProgress = false;
  let activePostStatus = "draft";
  let lastSavedSignature = "";
  let draftList = [];
  let activeOriginalSlug = "";
  let activeLegacySource = "";
  let activeImportedFromLegacy = false;
  let activeSourceMarkdownPath = "";
  let activeImportedFromMarkdown = false;
  let activeContentFormat = "markdown";
  let syncingHtmlEditor = false;
  let htmlEditorResizeObserver = null;
  let htmlEditorResizeFrame = 0;
  const initializedHtmlEditorDocuments = new WeakSet();
  const htmlEditorFontSize = 16.8;
  const htmlEditorLineHeight = 32 / htmlEditorFontSize;
  const htmlEditorContentWidth = 860;
  let excerptMode = "auto";
  let summaryGenerationInProgress = false;
  let pendingAnnotation = null;
  let pendingAnnotationOrigin = "author";
  let lastEditorSelection = null;
  let editorSelectionActions = null;
  let selectionExplainInProgress = false;
  let lastKnownMarkdown = "";
  const placedImages = new Map();

  function resizeTitleField() {
    if (!fields.title) return;
    fields.title.style.height = "auto";
    fields.title.style.height = `${Math.max(fields.title.scrollHeight, 1)}px`;
  }
  const draftKey = "michel-sketch-admin-draft";
  const draftSessionKey = `${draftKey}:session`;
  const draftActiveKey = `${draftKey}:active`;
  const publishedBackupKey = `${draftKey}:last-published`;
  const writerClientKey = `${draftKey}:client-id`;
  const writerClientId = window.sessionStorage.getItem(writerClientKey) || createDraftId();
  window.sessionStorage.setItem(writerClientKey, writerClientId);
  const draftChannel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel("michel-writer-draft-sync-v1")
    : null;
  const stableFlowImageMode = true;
  const writerVersion = "stable-flow-images-local-v1-20260822";
  const defaultImageWidth = 42;
  const imageMoveSensitivity = 1;
  const imageResizeSensitivity = 0.75;
  const imageDragThreshold = 2;
  const imageOffsetLimit = 1000000;
  const defaultImageLayer = 2;
  const acceptedUploadTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const imageNamePattern = /\.(png|jpe?g|gif|webp|tiff?|heic|heif|bmp)$/i;
  let pendingImageViewport = null;
  let imageRestoreQueued = false;
  window.MICHEL_WRITER_VERSION = writerVersion;
  document.documentElement.dataset.writerVersion = writerVersion;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\u3400-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function setStatus(node, text) {
    if (node) node.textContent = text || "";
  }

  function syncPostActions() {
    if (unpublishButton) unpublishButton.hidden = activePostStatus !== "published";
    if (publishButton) {
      publishButton.hidden = false;
      publishButton.textContent = activePostStatus === "published" ? "Update" : "Publish";
      publishButton.setAttribute(
        "aria-label",
        activePostStatus === "published" ? "Update published article" : "Publish article"
      );
    }
  }

  function setExcerptMode(mode) {
    excerptMode = mode === "manual" ? "manual" : "auto";
    if (excerptModeEl) excerptModeEl.textContent = excerptMode === "manual" ? "Your summary" : "Auto summary";
  }

  function setPostViewCount(value, visible = true) {
    if (!postViewCountEl) return;
    const count = Math.max(0, Number(value || 0));
    postViewCountEl.textContent = `${count.toLocaleString()} ${count === 1 ? "view" : "views"}`;
    postViewCountEl.hidden = !visible;
  }

  function clockTime(value = new Date()) {
    return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function createDraftId() {
    return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function ensureDraftId() {
    if (!activeDraftId) activeDraftId = createDraftId();
    return activeDraftId;
  }

  function draftSlotKey(draftId) {
    return `${draftKey}:item:${draftId || "scratch"}`;
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeMarkdownImageText(value) {
    return String(value || "image").replace(/[\[\]\\]/g, "\\$&").replace(/\n+/g, " ").trim() || "image";
  }

  function markdownImage(src, alt = "image") {
    return `![${escapeMarkdownImageText(alt)}](${src})`;
  }

  function htmlImageTagToMarkdown(tag) {
    const src = /\bsrc=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    if (!src) return tag;
    const alt = /\balt=(["'])(.*?)\1/i.exec(tag)?.[2] || "image";
    const style = /\bstyle=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const editorWidth = /\bdata-editor-width=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const reserve = imageReserve(/\bdata-image-reserve=(["'])(.*?)\1/i.exec(tag)?.[2] || 0);
    const layer = imageLayer(/\bdata-image-layer=(["'])(.*?)\1/i.exec(tag)?.[2] || defaultImageLayer);
    const settings = { ...imageSettingsFromStyleText(style, editorWidth), reserve, layer };
    if (!stableFlowImageMode && (settings.align === "free" || reserve || layer !== defaultImageLayer)) {
      rememberPlacedImage(src, { ...settings, alt });
    }
    const image = markdownImage(src, alt);
    return stableFlowImageMode ? `\n\n${image}\n\n` : image;
  }

  function imageMarkdownSrc(line) {
    return /^\s*!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line || "")?.[1] || "";
  }

  function collapseAdjacentDuplicateImages(markdown) {
    const lines = String(markdown || "").split("\n");
    const kept = [];
    let lastImageSrc = "";
    lines.forEach((line) => {
      const src = imageMarkdownSrc(line);
      if (src && src === lastImageSrc) return;
      kept.push(line);
      lastImageSrc = src || "";
    });
    return kept.join("\n");
  }

  function normalizeMathDelimitersForRichEditor(markdown) {
    const protectLineBreaks = (tex) => String(tex || "").replace(/\\{2}(?!\\)/g, (match) => match + match);
    return String(markdown || "")
      .replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => `$$${protectLineBreaks(tex)}$$`)
      .replace(/\\\[([\s\S]+?)\\\]/g, (_match, tex) => `$$\n${protectLineBreaks(tex.trim())}\n$$`)
      .replace(/\\\(([^\n]+?)\\\)/g, (_match, tex) => `$${tex.trim()}$`);
  }

  function markdownForRichEditor(markdown) {
    const withSpacerMarkers = String(markdown || "").replace(
      /<div\b[^>]*data-writer-spacer=(["'])(.*?)\1[^>]*>\s*<\/div>/gi,
      (tag) => stableFlowImageMode ? "" : layoutSpacerTagToEditorMarkdown(tag)
    );
    const normalized = withSpacerMarkers.replace(/<img\b[^>]*>/gi, (tag) => htmlImageTagToMarkdown(tag));
    return preserveVisualIndentation(normalizeMathDelimitersForRichEditor(
      separateStandaloneHtmlBreaks(collapseAdjacentDuplicateImages(normalized))
    ));
  }

  function encodeIntentionalParagraphIndents(markdown) {
    let fenced = false;
    return String(markdown || "").split("\n").map((line) => {
      const fence = /^\s*(```|~~~)/.test(line);
      if (fence) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line.replace(/^\u3000{2}/, "&#12288;&#12288;");
    }).join("\n");
  }

  function separateIntentionalParagraphs(markdown) {
    let fenced = false;
    const output = [];
    String(markdown || "").split("\n").forEach((line) => {
      const fence = /^\s*(```|~~~)/.test(line);
      const intentionalParagraph = /^(?:(?:&#12288;|&#x3000;|\u3000)){2}/i.test(line);
      if (!fenced && !fence && intentionalParagraph && output.length && output[output.length - 1].trim()) {
        output.push("");
      }
      output.push(line);
      if (fence) fenced = !fenced;
    });
    return output.join("\n");
  }

  function separateStandaloneHtmlBreaks(markdown) {
    let fenced = false;
    const lines = String(markdown || "").split("\n");
    const output = [];
    lines.forEach((line, index) => {
      const fence = /^\s*(```|~~~)/.test(line);
      output.push(line);
      if (!fenced && !fence && /^\s*<br\s*\/?>\s*$/i.test(line)) {
        const next = lines[index + 1] || "";
        if (next.trim()) output.push("");
      }
      if (fence) fenced = !fenced;
    });
    return output.join("\n");
  }

  function separateLooseTextLines(markdown) {
    let fenced = false;
    let displayMath = false;
    const lines = String(markdown || "").split("\n");
    const output = [];
    const isBlockLine = (line) => /^(?:\s*$|\s{4,}|\s*(?:#{1,6}\s|[-+*]\s|\d+[.)]\s|>|\|)|\s*<(?:\/?[a-z][^>]*|!--)|\s*(?:-{3,}|\*{3,}|_{3,})\s*$)/i.test(line);
    lines.forEach((line) => {
      const fence = /^\s*(```|~~~)/.test(line);
      const mathFence = /^\s*\$\$\s*$/.test(line);
      const previous = output[output.length - 1] || "";
      const previousIsExplicitBreak = /(?: {2,}|\\)$/.test(previous);
      if (
        !fenced
        && !displayMath
        && !fence
        && !mathFence
        && line.trim()
        && previous.trim()
        && !previousIsExplicitBreak
        && !isBlockLine(previous)
        && !isBlockLine(line)
      ) {
        output.push("");
      }
      output.push(line);
      if (fence) fenced = !fenced;
      if (!fenced && mathFence) displayMath = !displayMath;
    });
    return output.join("\n");
  }

  function trimTrailingEmptyContent(value) {
    let output = String(value || "").replace(/\r\n?/g, "\n");
    let previous = "";
    const trailingBreakLine = /(?:^|\n)[ \t]*(?:<br\s*\/?>|<(p|div)>[ \t]*(?:<br\s*\/?>)?[ \t]*<\/\1>)[ \t]*$/i;
    while (output !== previous) {
      previous = output;
      output = output.replace(/[ \t]+$/gm, "").replace(/\n+$/, "");
      output = output.replace(trailingBreakLine, "");
    }
    return output;
  }

  function preserveVisualIndentation(markdown) {
    let fenced = false;
    return String(markdown || "").split("\n").map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      let next = line.replace(/^(?:&#(?:8288|x2060);)?(?:&nbsp;)+/i, "");
      const leadingWhitespace = /^[ \t\u00a0\u200b\u2060]+(?=\S)/.exec(next)?.[0] || "";
      const content = next.slice(leadingWhitespace.length);
      const isMarkdownBlock = /^(?:[-+*]\s|\d+[.)]\s|#{1,6}\s|>|\||<)/.test(content);
      if (leadingWhitespace && !isMarkdownBlock) {
        next = content;
      }
      return next.replace(/(?<=\S)[ \u00a0]{2,}(?=\S)/g, (spaces) => "&nbsp;".repeat(spaces.length));
    }).join("\n");
  }

  function preserveTypedVisualWhitespace(event) {
    if (event.inputType !== "insertText" || event.data !== " " || event.isComposing) return;
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.anchorNode) return;
    const element = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    if (!element?.closest(".ProseMirror") || element.closest("pre, code")) return;
    const beforeCaret = selection.anchorNode.nodeType === Node.TEXT_NODE
      ? selection.anchorNode.nodeValue.slice(0, selection.anchorOffset)
      : "";
    if (beforeCaret && !/[ \u00a0]$/.test(beforeCaret)) return;
    event.preventDefault();
    document.execCommand("insertText", false, "\u00a0");
  }

  function textBeforeEditorCaret(block, selection) {
    if (!block || !selection?.isCollapsed || !selection.anchorNode || !block.contains(selection.anchorNode)) return "";
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().replace(/\u00a0/g, " ");
  }

  function removeEditorShortcutMarker(block, selection) {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false);
  }

  function convertTypedMarkdownList(event) {
    const isSpaceInput = (event.type === "beforeinput" && event.inputType === "insertText" && event.data === " ")
      || (event.type === "keydown" && event.key === " " && !event.repeat);
    if (!isSpaceInput || event.isComposing || !richEditor) return false;
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.anchorNode) return false;
    const element = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    const block = element?.closest("p");
    if (!block?.closest(".ProseMirror") || block.closest("pre, code, blockquote, td, th")) return false;

    const beforeCaret = textBeforeEditorCaret(block, selection);
    const inListItem = Boolean(block.closest("li"));
    let command = "";
    if (inListItem && /^\s*\[(?: |x|X)\]$/.test(beforeCaret)) {
      command = "taskList";
    } else if (!inListItem && /^\s{0,3}[-+*]$/.test(beforeCaret)) {
      command = "bulletList";
    } else if (!inListItem && /^\s{0,3}\d+[.)]$/.test(beforeCaret)) {
      command = "orderedList";
    }
    if (!command) return false;

    event.preventDefault();
    removeEditorShortcutMarker(block, selection);
    window.queueMicrotask(() => {
      richEditor.exec(command);
      syncFromRichEditor();
      scheduleEditorMathRender(16);
    });
    return true;
  }

  function handleRichEditorBeforeInput(event) {
    if (convertTypedMarkdownList(event)) return;
    preserveTypedVisualWhitespace(event);
  }

  function handleRichEditorKeydown(event) {
    if (
      event.key === "Tab"
      && !event.shiftKey
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.isComposing
      && event.target?.closest?.(".ProseMirror")
      && !event.target?.closest?.("pre, code")
    ) {
      event.preventDefault();
      event.stopPropagation();
      document.execCommand("insertText", false, "\u3000\u3000");
      window.queueMicrotask(() => {
        syncFromRichEditor();
        scheduleEditorMathRender(16);
      });
      return;
    }
    convertTypedMarkdownList(event);
  }

  function imageMarkupForStorage(src, alt, widthValue, align, xValue, yValue, reserveValue = 0, layerValue = defaultImageLayer) {
    if (stableFlowImageMode) return markdownImage(src, alt || "image");
    const reserve = imageReserve(reserveValue);
    const layer = imageLayer(layerValue);
    if (align === "flow" && reserve === 0 && layer === defaultImageLayer) return markdownImage(src, alt || "image");
    return htmlImage(src, alt, widthValue, align, xValue, yValue, reserve, layer);
  }

  function imageHtmlTagForStorage(tag) {
    const src = /\bsrc=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    if (!src) return tag;
    const alt = /\balt=(["'])(.*?)\1/i.exec(tag)?.[2] || "image";
    const style = /\bstyle=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const editorWidth = /\bdata-editor-width=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const reserve = imageReserve(/\bdata-image-reserve=(["'])(.*?)\1/i.exec(tag)?.[2] || 0);
    const layer = imageLayer(/\bdata-image-layer=(["'])(.*?)\1/i.exec(tag)?.[2] || defaultImageLayer);
    const settings = { ...imageSettingsFromStyleText(style, editorWidth), reserve, layer };
    if (stableFlowImageMode) return `\n\n${markdownImage(src, alt)}\n\n`;
    if (settings.align === "free" || settings.reserve || settings.layer !== defaultImageLayer) {
      rememberPlacedImage(src, { ...settings, alt });
      return htmlImage(src, alt, settings.width, settings.align, settings.x, settings.y, settings.reserve, settings.layer);
    }
    return markdownImage(src, alt);
  }

  function normalizeImageMarkupForStorage(markdown) {
    const withoutSpacers = stableFlowImageMode
      ? String(markdown || "").replace(/<div\b[^>]*data-writer-spacer=(["'])(.*?)\1[^>]*>\s*<\/div>/gi, "")
      : normalizeLayoutSpacersForStorage(markdown);
    const normalized = String(withoutSpacers || "").replace(/<img\b[^>]*>/gi, (tag) => imageHtmlTagForStorage(tag));
    return collapseAdjacentDuplicateImages(normalized);
  }

  function cleanExcerptText(value) {
    const withoutImages = String(value || "")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ");
    const html = window.DOMPurify
      ? window.DOMPurify.sanitize(withoutImages, { ALLOWED_TAGS: [] })
      : withoutImages.replace(/<[^>]+>/g, " ");
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || html)
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeExcerptField() {
    const cleaned = cleanExcerptText(fields.excerpt.value);
    if (cleaned !== fields.excerpt.value.trim()) fields.excerpt.value = cleaned;
    return cleaned;
  }

  function showWorkbench() {
    loginPanel.hidden = true;
    connectDraftEvents();
    if (openDraftInbox) {
      workbench.hidden = true;
      if (draftInbox) draftInbox.hidden = false;
      document.body.classList.add("is-authenticated", "is-draft-inbox");
      if (writerModeEl) writerModeEl.textContent = "Drafts";
      if (logoutButton) logoutButton.hidden = false;
      setStatus(saveStatus, "");
      loadDrafts({ quiet: true });
      return;
    }
    if (draftInbox) draftInbox.hidden = true;
    workbench.hidden = false;
    document.body.classList.add("is-authenticated");
    document.body.classList.remove("is-draft-inbox");
    if (writerModeEl) writerModeEl.textContent = "Editing";
    if (logoutButton) logoutButton.hidden = false;
    setSidebarOpen(true);
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileView(workbench.dataset.mobileView || "write", { focus: false });
    } else {
      setPreviewOpen(workbench.classList.contains("is-preview-open"));
    }
    if (!fields.date.value) fields.date.value = today();
    syncPostActions();
    ensureRichEditor();
    if (editSlug) {
      loadPostForEditing(editSlug);
    } else if (!createBlankPost) {
      restoreDraft();
    } else {
      ensureDraftId();
      acquireDraftLease().catch((error) => setStatus(saveStatus, error.message));
    }
    renderPreview();
    setStatus(saveStatus, editSlug ? "Loading post..." : "Ready");
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 820px)").matches) focusEditor();
      else if (!fields.title.value.trim()) fields.title.focus();
      else focusEditor();
    });
  }

  function showLogin() {
    loginPanel.hidden = false;
    if (draftInbox) draftInbox.hidden = true;
    workbench.hidden = true;
    document.body.classList.remove("is-authenticated", "is-draft-inbox");
    if (logoutButton) logoutButton.hidden = true;
    setStatus(saveStatus, "Locked");
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    let response;
    try {
      response = await fetch(path, {
        ...options,
        headers,
        credentials: "same-origin"
      });
    } catch (error) {
      const localWriter = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      throw new Error(localWriter
        ? "Writing service is offline. Reopen http://127.0.0.1:8787/admin.html"
        : "Cannot reach the writing service. Please retry in a moment.", { cause: error });
    }
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(body && body.error ? body.error : `Request failed: ${response.status}`);
      error.status = response.status;
      error.payload = body && typeof body === "object" ? body : {};
      throw error;
    }
    return body;
  }

  function openDraftDatabase() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = window.indexedDB.open("michel-writer-sync-v1", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("drafts")) {
          database.createObjectStore("drafts", { keyPath: "draftId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function writeIndexedDraft(draft, options = {}) {
    if (!draft?.draftId) return;
    const database = await openDraftDatabase();
    if (!database) return;
    await new Promise((resolve) => {
      const transaction = database.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put({
        ...draft,
        revision: Math.max(0, Number(options.revision ?? draft.revision ?? activeRevision)),
        baseRevision: Math.max(0, Number(options.baseRevision ?? activeRevision)),
        pending: options.pending !== false,
        savedAt: draft.savedAt || new Date().toISOString()
      });
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
    database.close();
  }

  async function readIndexedDraft(draftId) {
    if (!draftId) return null;
    const database = await openDraftDatabase();
    if (!database) return null;
    const result = await new Promise((resolve) => {
      const request = database.transaction("drafts", "readonly").objectStore("drafts").get(draftId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    database.close();
    return result;
  }

  function setMirrorMode(isMirror, message = "") {
    activeLeaseHeld = !isMirror;
    document.body.classList.toggle("is-draft-mirror", isMirror);
    if (leaseTakeoverButton) leaseTakeoverButton.hidden = !isMirror;
    [fields.title, fields.slug, fields.category, fields.date, fields.tags, fields.excerpt, fields.markdown]
      .filter(Boolean)
      .forEach((field) => { field.readOnly = isMirror; });
    if (richEditorEl) richEditorEl.inert = isMirror;
    if (htmlVisualEditor) htmlVisualEditor.inert = isMirror;
    if (generateSummaryButton) generateSummaryButton.disabled = isMirror;
    [undoButton, unpublishButton, publishButton, deletePostButton]
      .filter(Boolean)
      .forEach((button) => { button.disabled = isMirror; });
    if (message) setStatus(saveStatus, message);
  }

  function clearLeaseHeartbeat() {
    window.clearInterval(leaseHeartbeatTimer);
    leaseHeartbeatTimer = null;
  }

  async function acquireDraftLease(options = {}) {
    if (!csrfToken || !activeDraftId || workbench.hidden) return false;
    try {
      const result = await api(`/api/admin/draft-leases/${encodeURIComponent(activeDraftId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: writerClientId, takeover: options.takeover === true })
      });
      setMirrorMode(false, options.takeover ? "Editing moved to this page" : "Ready");
      clearLeaseHeartbeat();
      leaseHeartbeatTimer = window.setInterval(() => {
        acquireDraftLease().catch(() => setMirrorMode(true, "Editing connection paused"));
      }, 5_000);
      if (hasDraftContent()) scheduleAutosave();
      return Boolean(result.lease?.acquired);
    } catch (error) {
      if (error.status === 423) {
        clearLeaseHeartbeat();
        setMirrorMode(true, "Live mirror · another page is editing");
        return false;
      }
      throw error;
    }
  }

  function releaseDraftLease() {
    clearLeaseHeartbeat();
    if (!activeDraftId || !activeLeaseHeld) return;
    fetch(`/api/admin/draft-leases/${encodeURIComponent(activeDraftId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ clientId: writerClientId })
    }).catch(() => {});
    activeLeaseHeld = false;
  }

  async function applyRemotePost(post, message = "Synced from another page") {
    if (!post || !postMatchesActive(post)) return;
    applyingRemoteDraft = true;
    try {
      setDraftFields(post);
      saveLocalDraft({ quiet: true, broadcast: false, pending: false });
      await writeIndexedDraft({ ...readDraft(), savedAt: new Date().toISOString() }, {
        pending: false,
        revision: activeRevision
      });
      setStatus(saveStatus, message);
    } finally {
      applyingRemoteDraft = false;
    }
  }

  function postMatchesActive(post) {
    const identities = new Set([post?.draftId, post?.slug, post?.originalSlug].filter(Boolean));
    return identities.has(activeDraftId) || identities.has(activeDraftSlug);
  }

  async function refreshActiveDraftFromServer(identity = activeDraftId || activeDraftSlug) {
    if (!identity || activeLeaseHeld) return;
    try {
      const result = await api(`/api/admin/posts/${encodeURIComponent(identity)}`);
      await applyRemotePost(result.post || {});
    } catch (_) {
      // The draft may have been deleted or moved while this mirror was open.
    }
  }

  function connectDraftEvents() {
    if (draftEventSource) draftEventSource.close();
    draftEventSource = new EventSource(`/api/admin/draft-events?clientId=${encodeURIComponent(writerClientId)}`);
    draftEventSource.addEventListener("draft-sync", (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch (_) { return; }
      if (!payload || payload.clientId === writerClientId) return;
      if (payload.type === "lease" && payload.draftId === activeDraftId) {
        if (["takeover", "acquired"].includes(payload.action)) {
          setMirrorMode(true, "Live mirror · editing moved to another page");
        }
        return;
      }
      if (payload.type === "draft-updated" && postMatchesActive(payload) && !activeLeaseHeld) {
        refreshActiveDraftFromServer(payload.draftId || payload.slug);
      }
      if (payload.type === "draft-deleted" && postMatchesActive(payload)) {
        setMirrorMode(true, "This draft was deleted in another page");
      }
    });
  }

  function isVisibleEditorRoot(node) {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
  }

  function editorContentRoot() {
    if (!richEditorEl) return null;
    const proseMirrorRoots = Array.from(richEditorEl.querySelectorAll(".toastui-editor-ww-container .ProseMirror, .ProseMirror"));
    return proseMirrorRoots.find((node) => node.getAttribute("contenteditable") === "true" && isVisibleEditorRoot(node))
      || proseMirrorRoots.find(isVisibleEditorRoot)
      || richEditorEl.querySelector(".toastui-editor-contents")
      || richEditorEl.querySelector(".cm-content");
  }

  function editorHasRenderedContent() {
    const root = editorContentRoot();
    if (!root) return false;
    return Boolean(
      root.textContent.trim()
      || root.querySelector("img, table, pre, code, blockquote, ul, ol")
    );
  }

  function readRichEditorMarkdown() {
    if (richEditor) {
      let markdown = "";
      try {
        markdown = String(richEditor.getMarkdown?.() || "");
      } catch (_) {
        markdown = "";
      }
      if (markdown.trim() || !editorHasRenderedContent()) return markdownForRichEditor(markdown);
      return markdownForRichEditor(fields.markdown.value || lastKnownMarkdown || markdown);
    }
    return fields.markdown.value || "";
  }

  function getMarkdown() {
    if (activeContentFormat === "html") return fields.markdown.value || lastKnownMarkdown || "";
    if (stableFlowImageMode) return normalizeImageMarkupForStorage(readRichEditorMarkdown());
    return normalizeLayoutSpacersForStorage(applyRememberedImageStyles(readRichEditorMarkdown()));
  }

  function htmlEditorDocument() {
    return htmlVisualEditor?.contentDocument || null;
  }

  function scheduleHtmlVisualEditorResize() {
    if (!htmlVisualEditor || activeContentFormat !== "html") return;
    if (htmlEditorResizeFrame) window.cancelAnimationFrame(htmlEditorResizeFrame);
    htmlEditorResizeFrame = window.requestAnimationFrame(() => {
      htmlEditorResizeFrame = 0;
      const doc = htmlEditorDocument();
      if (!doc?.body) return;
      const minimumHeight = 180;
      const contentHeight = Math.ceil(Math.max(
        doc.body.scrollHeight,
        doc.body.getBoundingClientRect().height
      ));
      const nextHeight = Math.max(minimumHeight, contentHeight);
      if (Math.abs(htmlVisualEditor.offsetHeight - nextHeight) > 1) {
        htmlVisualEditor.style.height = `${nextHeight}px`;
      }
    });
  }

  function syncHtmlEditorFromVisual() {
    if (syncingHtmlEditor || activeContentFormat !== "html") return;
    const body = htmlEditorDocument()?.body;
    if (!body) return;
    fields.markdown.value = body.innerHTML;
    lastKnownMarkdown = fields.markdown.value;
    saveLocalDraft({ quiet: true });
    renderPreview();
    scheduleAutosave();
    scheduleHtmlVisualEditorResize();
  }

  function prepareHtmlVisualEditor(doc) {
    if (!doc?.body) return;
    doc.documentElement.style.minHeight = "0";
    doc.documentElement.style.background = "#fffefa";
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.boxSizing = "border-box";
    doc.body.style.minHeight = "0";
    doc.body.style.margin = "0";
    doc.body.style.padding = "44px 0 80px";
    doc.body.style.outline = "none";
    doc.body.style.overflow = "hidden";
    doc.body.style.maxWidth = `${htmlEditorContentWidth}px`;
    doc.body.style.marginInline = "auto";
    doc.body.style.fontFamily = '"Michel Noto Serif SC", Georgia, serif';
    doc.body.style.fontSize = `${htmlEditorFontSize}px`;
    doc.body.style.lineHeight = String(htmlEditorLineHeight);
    doc.body.style.letterSpacing = "normal";
    doc.body.contentEditable = "true";
    doc.body.spellcheck = true;
    let readerTypography = doc.getElementById("michel-html-reader-typography");
    if (!readerTypography) {
      readerTypography = doc.createElement("style");
      readerTypography.id = "michel-html-reader-typography";
      doc.head.appendChild(readerTypography);
    }
    const serifRegular = new URL("./assets/fonts/noto-serif-sc-400.woff2", window.location.href).href;
    const serifBold = new URL("./assets/fonts/noto-serif-sc-700.woff2", window.location.href).href;
    readerTypography.textContent = `
      @font-face {
        font-family: "Michel Noto Serif SC";
        src: url("${serifRegular}") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Michel Noto Serif SC";
        src: url("${serifBold}") format("woff2");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
      body > :is(article, main, section, div) {
        font-family: inherit !important;
        font-size: ${htmlEditorFontSize}px !important;
        line-height: ${htmlEditorLineHeight} !important;
        letter-spacing: normal !important;
      }
      body :is(.lead, .figure-intro) {
        font-size: 1.05em !important;
      }
      body figcaption {
        font-size: .87em !important;
      }
      body h1 { font-size: 33.68px !important; }
      body h2 { font-size: 25.26px !important; }
      body h3 { font-size: 19.65px !important; }
      body h4 { font-size: 16.84px !important; }
      body :is(p, li, blockquote, td, th) { line-height: ${htmlEditorLineHeight} !important; }
    `;
    if (initializedHtmlEditorDocuments.has(doc)) return;
    initializedHtmlEditorDocuments.add(doc);
    doc.addEventListener("input", syncHtmlEditorFromVisual);
    doc.addEventListener("load", scheduleHtmlVisualEditorResize, true);
    doc.addEventListener("click", (event) => {
      if (event.target?.closest?.("a[href]")) event.preventDefault();
    });
    htmlEditorResizeObserver?.disconnect();
    const ResizeObserverCtor = doc.defaultView?.ResizeObserver || window.ResizeObserver;
    htmlEditorResizeObserver = new ResizeObserverCtor(scheduleHtmlVisualEditorResize);
    htmlEditorResizeObserver.observe(doc.body);
    doc.fonts?.ready?.then(scheduleHtmlVisualEditorResize).catch(() => {});
  }

  function renderHtmlVisualEditor(value) {
    const doc = htmlEditorDocument();
    if (!doc?.body) return;
    prepareHtmlVisualEditor(doc);
    syncingHtmlEditor = true;
    doc.body.innerHTML = String(value || "");
    syncingHtmlEditor = false;
    scheduleHtmlVisualEditorResize();
  }

  function nodePathFromRoot(root, node) {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return current === root ? path : null;
  }

  function nodeFromRootPath(root, path) {
    let current = root;
    for (const index of path || []) {
      if (!current?.childNodes?.length) return null;
      current = current.childNodes[Math.min(index, current.childNodes.length - 1)];
    }
    return current;
  }

  function clampSelectionOffset(node, offset) {
    if (!node) return 0;
    return Math.max(0, Math.min(
      Number(offset) || 0,
      node.nodeType === Node.TEXT_NODE ? node.data.length : node.childNodes.length
    ));
  }

  function captureEditorCaret() {
    const root = editorContentRoot();
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const startPath = nodePathFromRoot(root, range.startContainer);
    const endPath = nodePathFromRoot(root, range.endContainer);
    if (!startPath || !endPath) return null;
    return {
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset,
      scrollTop: root.closest(".toastui-editor-ww-container")?.scrollTop || 0
    };
  }

  function restoreEditorCaret(bookmark) {
    if (!bookmark) return;
    window.requestAnimationFrame(() => {
      const root = editorContentRoot();
      const selection = window.getSelection();
      if (!root || !selection) return;
      const startNode = nodeFromRootPath(root, bookmark.startPath);
      const endNode = nodeFromRootPath(root, bookmark.endPath);
      if (!startNode || !endNode) return;
      const range = document.createRange();
      try {
        range.setStart(startNode, clampSelectionOffset(startNode, bookmark.startOffset));
        range.setEnd(endNode, clampSelectionOffset(endNode, bookmark.endOffset));
      } catch (_) {
        return;
      }
      root.focus({ preventScroll: true });
      selection.removeAllRanges();
      selection.addRange(range);
      const scroller = root.closest(".toastui-editor-ww-container");
      if (scroller) scroller.scrollTop = bookmark.scrollTop;
    });
  }

  function markdownEquivalentForEditor(left, right) {
    const comparable = (value) => markdownForRichEditor(normalizeImageMarkupForStorage(String(value || "")))
      .replace(/\r\n?/g, "\n")
      .replace(/\n+$/g, "");
    return comparable(left) === comparable(right);
  }

  window.MichelAssistantContext = function MichelAssistantContext() {
    const proseMirror = richEditorEl?.querySelector(".toastui-editor-ww-container .ProseMirror");
    const markdownEditor = richEditorEl?.querySelector(".toastui-editor-md-container .toastui-editor");
    const selectionRoot = activeContentFormat === "html"
      ? (htmlEditorDocument()?.body || fields.markdown)
      : (proseMirror?.getClientRects().length ? proseMirror : markdownEditor);
    return {
      title: fields.title?.value?.trim() || "Untitled draft",
      article: getMarkdown(),
      selectionRoot: selectionRoot || fields.markdown,
      url: window.location.href
    };
  };

  function setMarkdown(value, options = {}) {
    const caret = options.preserveCaret ? captureEditorCaret() : null;
    const markdown = trimTrailingEmptyContent(value);
    if (activeContentFormat === "html") {
      fields.markdown.value = markdown;
      lastKnownMarkdown = markdown;
      renderHtmlVisualEditor(markdown);
      return;
    }
    rememberPlacedImagesFromMarkdown(markdown);
    const storageMarkdown = normalizeImageMarkupForStorage(markdown);
    fields.markdown.value = storageMarkdown;
    lastKnownMarkdown = storageMarkdown;
    const editorMarkdown = markdownForRichEditor(storageMarkdown);
    if (richEditor && richEditor.getMarkdown() !== editorMarkdown) {
      syncingEditor = true;
      richEditor.setMarkdown(editorMarkdown, false);
      syncingEditor = false;
      window.setTimeout(() => {
        capturePlacedImageNodes();
        schedulePlacedImageRestore();
        scheduleEditorMathRender();
        restoreEditorCaret(caret);
      }, 80);
    }
  }

  function focusEditor() {
    if (activeContentFormat === "html") {
      htmlEditorDocument()?.body?.focus();
      return;
    }
    if (richEditor) {
      richEditor.focus();
      return;
    }
    fields.markdown.focus();
  }

  function ensureRichEditor() {
    if (richEditor || !richEditorEl || !window.toastui?.Editor) return;
    document.body.classList.add("has-rich-editor");
    richEditor = new window.toastui.Editor({
      el: richEditorEl,
      height: "100%",
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      initialValue: fields.markdown.value || "",
      usageStatistics: false,
      autofocus: false,
      hideModeSwitch: false,
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol", "task"],
        ["table", "image", "link"],
        ["code", "codeblock"]
      ],
      hooks: {
        addImageBlobHook: (blob, callback) => {
          uploadImageFile(blob)
            .then((result) => {
              callback(result.url, result.alt || "image");
              syncFromRichEditor();
              window.setTimeout(() => selectImageBySrc(result.url), 160);
            })
            .catch((error) => setStatus(saveStatus, error.message));
          return false;
        }
      }
    });
    richEditor.on("change", () => {
      if (syncingEditor) return;
      syncFromRichEditor();
      window.setTimeout(decorateEditorAnnotations, 30);
    });
    richEditorEl.addEventListener("beforeinput", handleRichEditorBeforeInput, true);
    richEditorEl.addEventListener("keydown", handleRichEditorKeydown, true);
    richEditorEl.addEventListener("pointerdown", handleEditableMathPointer, true);
    richEditorEl.addEventListener("mousedown", handleEditableMathPointer, true);
    richEditorEl.addEventListener("click", handleEditableMathPointer, true);
    ["pointerup", "mouseup", "click"].forEach((eventName) => {
      richEditorEl.addEventListener(eventName, suppressResidualMathEditPointer, true);
    });
    ["input", "keydown", "keyup", "paste", "compositionend"].forEach((eventName) => {
      document.addEventListener(eventName, (event) => {
        if (richEditorEl.contains(event.target)) {
          if (eventName === "input" || eventName === "paste" || eventName === "compositionend") {
            lastEditorSelection = null;
          } else if (eventName === "keyup") {
            rememberEditorSelection();
          }
          scheduleEditorMathRender();
        }
      }, true);
    });
    document.addEventListener("selectionchange", () => {
      if (!workbench.hidden) {
        rememberEditorSelection();
        scheduleEditorMathRender(40);
      }
    });
    [richEditorEl.querySelector(".toastui-editor-main"), richEditorEl.querySelector(".toastui-editor-ww-container")]
      .filter(Boolean)
      .forEach((node) => {
        node.addEventListener("scroll", () => scheduleEditorMathRender(16), { passive: true });
      });
    window.setTimeout(() => {
      installAnnotationToolbarButton();
      decorateEditorAnnotations();
      disableNativeImageDrag();
      capturePlacedImageNodes();
      schedulePlacedImageRestore();
      scheduleEditorMathRender();
    }, 120);
  }

  function annotationHrefFromNode(node) {
    const link = node?.closest?.("a[href]");
    const href = link?.getAttribute("href") || "";
    return href.includes(window.MichelAnnotations?.PREFIX || "#michel-note-v1:") ? href.slice(href.indexOf("#michel-note-v1:")) : "";
  }

  function decorateEditorAnnotations() {
    const root = editorContentRoot();
    if (!root || !window.MichelAnnotations) return;
    root.querySelectorAll(`a[href*="${window.MichelAnnotations.PREFIX}"]`).forEach((link) => {
      link.title = "点击预览、编辑或删除解释";
      link.dataset.inlineAnnotation = "true";
      link.dataset.annotationOrigin = window.MichelAnnotations.decode(link.getAttribute("href"))?.origin || "author";
    });
  }

  function installAnnotationToolbarButton() {
    if (!richEditorEl || richEditorEl.querySelector("[data-annotation-tool]")) return;
    const groups = Array.from(richEditorEl.querySelectorAll(".toastui-editor-toolbar-group"));
    const group = groups.filter((candidate) => candidate.style.display !== "none").at(-1);
    if (!group) {
      window.setTimeout(installAnnotationToolbarButton, 120);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "annotation-toolbar-button";
    button.dataset.annotationTool = "";
    button.title = "Add or edit hover annotation";
    button.setAttribute("aria-label", "Add or edit hover annotation");
    button.textContent = "※";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => openAnnotationDialog());
    group.appendChild(button);
  }

  function editorSelectionSnapshot() {
    const root = editorContentRoot();
    const selection = window.getSelection();
    if (!root || !selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const anchorNode = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const existingHref = annotationHrefFromNode(anchorNode);
    const existingLink = existingHref ? anchorNode.closest("a[href]") : null;
    const text = (existingLink?.textContent || selection.toString()).trim();
    if (!text) return null;
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 3);
    const rect = rects.at(-1) || range.getBoundingClientRect();
    return { range: range.cloneRange(), text, oldHref: existingHref, rect };
  }

  function removeEditorSelectionActions() {
    editorSelectionActions?.remove();
    editorSelectionActions = null;
  }

  function editorSelectionContext(snapshot) {
    const root = editorContentRoot();
    const source = String(root?.innerText || "").replace(/\s+/g, " ").trim();
    const target = String(snapshot?.text || "").replace(/\s+/g, " ").trim();
    const index = source.indexOf(target);
    return index < 0
      ? { contextBefore: source.slice(0, 500), contextAfter: source.slice(500, 1000) }
      : {
          contextBefore: source.slice(Math.max(0, index - 500), index),
          contextAfter: source.slice(index + target.length, index + target.length + 500)
        };
  }

  function askAiAboutSelection(snapshot) {
    removeEditorSelectionActions();
    const context = editorSelectionContext(snapshot);
    window.MichelAssistant?.activateSelection?.({
      text: snapshot.text,
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
      range: snapshot.range,
      rects: snapshot.rect ? [snapshot.rect] : []
    });
  }

  async function explainEditorSelection(snapshot, button) {
    if (selectionExplainInProgress) return;
    selectionExplainInProgress = true;
    const originalLabel = button.textContent;
    button.textContent = "正在简释...";
    button.disabled = true;
    const context = editorSelectionContext(snapshot);
    try {
      const result = await api("/api/admin/explain-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.title.value,
          markdown: getMarkdown(),
          selectedText: snapshot.text,
          ...context
        })
      });
      removeEditorSelectionActions();
      openAnnotationDialog(snapshot, result.explanation);
    } catch (error) {
      setStatus(saveStatus, error.message);
    } finally {
      selectionExplainInProgress = false;
      button.textContent = originalLabel;
      button.disabled = false;
    }
  }

  function showEditorSelectionActions(snapshot) {
    if (!snapshot?.rect || snapshot.oldHref || annotationDialog?.open) {
      removeEditorSelectionActions();
      return;
    }
    removeEditorSelectionActions();
    const actions = document.createElement("div");
    actions.className = "editor-selection-actions";
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", "Selected text actions");
    const askButton = document.createElement("button");
    askButton.type = "button";
    askButton.textContent = "问 AI";
    const explainButton = document.createElement("button");
    explainButton.type = "button";
    explainButton.textContent = "AI 搜索并简释";
    actions.append(askButton, explainButton);
    document.body.appendChild(actions);
    const box = actions.getBoundingClientRect();
    const left = Math.min(window.innerWidth - box.width - 12, Math.max(12, snapshot.rect.left));
    const above = snapshot.rect.top - box.height - 10;
    const top = above > 8 ? above : Math.min(window.innerHeight - box.height - 8, snapshot.rect.bottom + 10);
    actions.style.left = `${left}px`;
    actions.style.top = `${top}px`;
    actions.addEventListener("pointerdown", (event) => event.preventDefault());
    askButton.addEventListener("click", () => askAiAboutSelection(snapshot));
    explainButton.addEventListener("click", () => explainEditorSelection(snapshot, explainButton));
    editorSelectionActions = actions;
  }

  function rememberEditorSelection() {
    const snapshot = editorSelectionSnapshot();
    if (snapshot) {
      lastEditorSelection = snapshot;
      showEditorSelectionActions(snapshot);
    } else {
      removeEditorSelectionActions();
    }
  }

  function resizeAnnotationBody() {
    if (!annotationBody) return;
    annotationBody.style.height = "0";
    annotationBody.style.height = `${Math.max(72, annotationBody.scrollHeight)}px`;
  }

  function openAnnotationDialog(snapshot = editorSelectionSnapshot() || lastEditorSelection, initialPayload = null) {
    if (!annotationDialog || !annotationForm || !window.MichelAnnotations) return;
    if (!snapshot) {
      setStatus(saveStatus, "Select text in WYSIWYG mode, then choose the annotation tool");
      focusEditor();
      return;
    }
    const payload = initialPayload || (snapshot.oldHref ? window.MichelAnnotations.decode(snapshot.oldHref) : null);
    removeEditorSelectionActions();
    lastEditorSelection = snapshot;
    pendingAnnotation = { ...snapshot, markdownBefore: getMarkdown() };
    pendingAnnotationOrigin = payload?.origin || "author";
    annotationHeading.textContent = payload ? "Edit hover annotation" : "Explain selected text";
    annotationSelected.textContent = snapshot.text;
    annotationForm.elements.type.value = payload?.type || "note";
    annotationForm.elements.title.value = payload?.title || "";
    annotationForm.elements.body.value = payload?.body || "";
    annotationForm.elements.label.value = payload?.label || "";
    annotationForm.elements.url.value = payload?.url || "";
    annotationRemoveButton.hidden = !snapshot.oldHref;
    annotationDialog.showModal();
    window.setTimeout(() => {
      resizeAnnotationBody();
      annotationForm.elements.body.focus();
    }, 40);
  }

  function replaceAnnotationHref(markdown, oldHref, newHref) {
    return String(markdown || "").split(oldHref).join(newHref);
  }

  function applyAnnotation(payload) {
    if (!pendingAnnotation || !window.MichelAnnotations) return;
    const nextHref = window.MichelAnnotations.encode(payload);
    if (pendingAnnotation.oldHref) {
      setMarkdown(replaceAnnotationHref(getMarkdown(), pendingAnnotation.oldHref, nextHref));
    } else {
      const before = getMarkdown();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(pendingAnnotation.range);
      richEditor.focus();
      richEditor.exec("addLink", { linkUrl: nextHref, linkText: pendingAnnotation.text });
      const after = getMarkdown();
      if (after === before) {
        const marker = pendingAnnotation.text;
        const index = before.indexOf(marker);
        if (index >= 0) {
          setMarkdown(`${before.slice(0, index)}[${marker}](${nextHref})${before.slice(index + marker.length)}`);
        }
      }
    }
    pendingAnnotation = null;
    syncFromRichEditor();
    renderPreview();
    window.setTimeout(decorateEditorAnnotations, 40);
    setStatus(saveStatus, "Hover annotation saved");
  }

  function removeAnnotation() {
    if (!pendingAnnotation?.oldHref) return;
    const oldHref = pendingAnnotation.oldHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const markdown = getMarkdown().replace(new RegExp(`\\[([^\\]]+)\\]\\(${oldHref}\\)`, "g"), "$1");
    pendingAnnotation = null;
    setMarkdown(markdown);
    syncFromRichEditor();
    renderPreview();
    annotationDialog.close();
    setStatus(saveStatus, "Hover annotation removed");
  }

  function syncFromRichEditor() {
    if (!richEditor || activeContentFormat === "html") return;
    if (sanitizeRichEditorImageHtmlText()) return;
    if (!stableFlowImageMode) {
      capturePlacedImageNodes();
      restorePlacedImageNodes();
    }
    fields.markdown.value = getMarkdown();
    lastKnownMarkdown = fields.markdown.value;
    disableNativeImageDrag();
    if (!stableFlowImageMode) schedulePlacedImageRestore();
    saveLocalDraft({ quiet: true });
    renderPreview();
    scheduleEditorMathRender();
    scheduleAutosave();
  }

  function sanitizeRichEditorImageHtmlText() {
    if (!richEditor || syncingEditor) return false;
    let markdown = "";
    try {
      markdown = String(richEditor.getMarkdown?.() || "");
    } catch (_) {
      markdown = "";
    }
    if (!/<img\b/i.test(markdown)) return false;
    const safeMarkdown = markdownForRichEditor(markdown);
    if (safeMarkdown === markdown) return false;
    const caret = captureEditorCaret();
    fields.markdown.value = normalizeImageMarkupForStorage(applyRememberedImageStyles(safeMarkdown));
    lastKnownMarkdown = fields.markdown.value;
    syncingEditor = true;
    richEditor.setMarkdown(safeMarkdown, false);
    syncingEditor = false;
    window.setTimeout(() => {
      capturePlacedImageNodes();
      schedulePlacedImageRestore();
      disableNativeImageDrag();
      renderPreview();
      scheduleEditorMathRender();
      restoreEditorCaret(caret);
    }, 80);
    return true;
  }

  function mathDelimiters() {
    return [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false }
    ];
  }

  function markdownHasMath(markdown) {
    const value = String(markdown || "");
    return /\$\$[\s\S]+?\$\$/.test(value)
      || /\\\[[\s\S]+?\\\]/.test(value)
      || /(^|[^\\$])\$[^$\n]+?\$/.test(value)
      || /\\\(.+?\\\)/.test(value);
  }

  function normalizeMathTexShortcuts(tex) {
    const greekMacros = "alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega";
    const macroPattern = new RegExp(`(^|[\\s({[=+\\-*,;:])\\/(${greekMacros})\\b`, "g");
    return String(tex || "").replace(macroPattern, (_match, prefix, name) => `${prefix}\\${name}`);
  }

  function normalizeMathShortcutsInMarkdown(markdown) {
    return String(markdown || "")
      .replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => `$$${normalizeMathTexShortcuts(tex)}$$`)
      .replace(/\\\[([\s\S]+?)\\\]/g, (_match, tex) => `\\[${normalizeMathTexShortcuts(tex)}\\]`)
      .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_match, prefix, tex) => `${prefix}$${normalizeMathTexShortcuts(tex)}$`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_match, tex) => `\\(${normalizeMathTexShortcuts(tex)}\\)`);
  }

  function ensureMathOverlayLayer() {
    if (!richEditorEl) return null;
    const host = richEditorEl.querySelector(".toastui-editor-main") || richEditorEl.closest(".markdown-pane") || richEditorEl;
    if (mathOverlayLayer && mathOverlayLayer.parentElement === host) return mathOverlayLayer;
    if (mathOverlayLayer) mathOverlayLayer.remove();
    mathOverlayLayer = document.createElement("div");
    mathOverlayLayer.className = "writer-math-layer";
    mathOverlayLayer.setAttribute("aria-hidden", "true");
    host.appendChild(mathOverlayLayer);
    return mathOverlayLayer;
  }

  function clearEditorMathOverlays() {
    mathOverlayHitboxes = [];
    if (mathOverlayLayer) mathOverlayLayer.replaceChildren();
  }

  function suspendMathRenderForFormulaEdit(duration = 1400) {
    activeMathEditUntil = Math.max(activeMathEditUntil, Date.now() + duration);
  }

  function suppressResidualMathEditPointer(event) {
    if (Date.now() > suppressMathEditPointerUntil || !richEditorEl?.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function selectionInsideAnyInlineMathSource(root) {
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || !root?.contains(selection.anchorNode)) return false;
    return editorMathBlocks(root).some((block) => {
      const map = editorMathTextMap(block);
      return inlineMathMatches(map.text).some((match) => {
        const range = rangeFromEditorMathMap(map, match.start, match.end);
        return range ? selectionIntersectsRange(range) : false;
      });
    });
  }

  function selectionInsideAnyInlineMathLine(root) {
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || !root?.contains(selection.anchorNode)) return false;
    return editorMathBlocks(root).some((block) => {
      return block.contains(selection.anchorNode) && inlineMathMatches(editorMathTextMap(block).text).length > 0;
    });
  }

  function shouldHoldMathRenderForFormulaEdit(root) {
    if (selectionInsideAnyInlineMathSource(root) || selectionInsideAnyInlineMathLine(root)) {
      suspendMathRenderForFormulaEdit();
      return true;
    }
    const remaining = activeMathEditUntil - Date.now();
    if (remaining > 0) {
      scheduleEditorMathRender(Math.min(remaining + 30, 1600));
      return true;
    }
    return false;
  }

  function textNodeIsEditableMathCandidate(node) {
    if (!node || !node.nodeValue || !node.nodeValue.trim()) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    return !parent.closest("pre, code, .katex, .writer-math-layer, .toastui-editor-md-preview");
  }

  function isEscapedAt(text, index) {
    let slashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) slashes += 1;
    return slashes % 2 === 1;
  }

  function inlineMathMatches(text) {
    const value = String(text || "");
    const matches = [];
    let index = 0;
    while (index < value.length) {
      const bracketStart = value.indexOf("\\[", index);
      const parenStart = value.indexOf("\\(", index);
      const dollarStart = value.indexOf("$", index);
      let start = -1;
      let kind = "";
      const candidates = [
        { start: bracketStart, kind: "bracket" },
        { start: parenStart, kind: "paren" },
        { start: dollarStart, kind: "dollar" }
      ].filter((candidate) => candidate.start >= 0).sort((a, b) => a.start - b.start);
      if (candidates.length) ({ start, kind } = candidates[0]);
      if (start < 0) break;
      if (kind === "dollar") {
        if (isEscapedAt(value, start)) {
          index = start + 1;
          continue;
        }
        const display = value[start + 1] === "$";
        const openLength = display ? 2 : 1;
        const closeToken = display ? "$$" : "$";
        let end = value.indexOf(closeToken, start + openLength);
        while (end >= 0 && isEscapedAt(value, end)) {
          end = value.indexOf(closeToken, end + closeToken.length);
        }
        if (end < 0) break;
        const tex = value.slice(start + openLength, end).trim();
        if (tex && (display || !tex.includes("\n"))) {
          matches.push({ start, end: end + closeToken.length, tex, display, closeLength: closeToken.length });
        }
        index = end + closeToken.length;
      } else if (kind === "paren") {
        const end = value.indexOf("\\)", start + 2);
        if (end < 0) break;
        const tex = value.slice(start + 2, end).trim();
        if (tex) matches.push({ start, end: end + 2, tex, display: false, closeLength: 2 });
        index = end + 2;
      } else {
        const end = value.indexOf("\\]", start + 2);
        if (end < 0) break;
        const tex = value.slice(start + 2, end).trim();
        if (tex) matches.push({ start, end: end + 2, tex, display: true, closeLength: 2 });
        index = end + 2;
      }
    }
    return matches;
  }

  const editorMathBlockSelector = "p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote";

  function editorMathBlocks(root) {
    return Array.from(root?.querySelectorAll?.(editorMathBlockSelector) || []).filter((block) => {
      if (block.closest("pre, code, .katex, .writer-math-layer, .toastui-editor-md-preview")) return false;
      const nested = Array.from(block.querySelectorAll(editorMathBlockSelector)).some((child) => {
        return child !== block && inlineMathMatches(editorMathTextMap(child).text).length > 0;
      });
      return !nested && inlineMathMatches(editorMathTextMap(block).text).length > 0;
    });
  }

  function editorMathTextMap(block) {
    const segments = [];
    let text = "";
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return textNodeIsEditableMathCandidate(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = text.length;
      text += node.nodeValue;
      segments.push({ node, start, end: text.length });
    }
    return { block, segments, text };
  }

  function pointFromEditorMathMap(map, offset, preferNext = false) {
    if (!map?.segments?.length) return null;
    const bounded = Math.max(0, Math.min(offset, map.text.length));
    let segment = map.segments.find((item) => {
      return preferNext ? bounded >= item.start && bounded < item.end : bounded > item.start && bounded <= item.end;
    });
    if (!segment) segment = bounded <= 0 ? map.segments[0] : map.segments[map.segments.length - 1];
    return {
      container: segment.node,
      offset: Math.max(0, Math.min(segment.node.nodeValue.length, bounded - segment.start))
    };
  }

  function rangeFromEditorMathMap(map, start, end) {
    const startPoint = pointFromEditorMathMap(map, start, true);
    const endPoint = pointFromEditorMathMap(map, end, false);
    if (!startPoint || !endPoint) return null;
    const range = document.createRange();
    try {
      range.setStart(startPoint.container, startPoint.offset);
      range.setEnd(endPoint.container, endPoint.offset);
      return range;
    } catch (_) {
      return null;
    }
  }

  function selectionIntersectsRange(range) {
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || !editorContentRoot()?.contains(selection.anchorNode)) return false;
    try {
      if (range.isPointInRange(selection.anchorNode, selection.anchorOffset)) return true;
      if (selection.focusNode && range.isPointInRange(selection.focusNode, selection.focusOffset)) return true;
    } catch (_) {
      // Fall through to boundary comparison for browsers that reject non-text offsets.
    }
    const selectedRange = selection.getRangeAt(0);
    try {
      return range.compareBoundaryPoints(Range.END_TO_START, selectedRange) > 0
        && range.compareBoundaryPoints(Range.START_TO_END, selectedRange) < 0;
    } catch (_) {
      return false;
    }
  }

  function selectionInsideTextSpan(textNode, start, end) {
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || !editorContentRoot()?.contains(selection.anchorNode)) return false;
    const selectedRange = selection.getRangeAt(0);
    if (!selectedRange.collapsed) {
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      return selectionIntersectsRange(range);
    }
    return selection.anchorNode === textNode
      && selection.anchorOffset > start
      && selection.anchorOffset < end;
  }

  function rectFromRange(range) {
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    return rects[0] || range.getBoundingClientRect();
  }

  function unionRects(rects) {
    const visible = rects.filter((rect) => rect && rect.width > 0 && rect.height > 0);
    if (!visible.length) return null;
    const left = Math.min(...visible.map((rect) => rect.left));
    const top = Math.min(...visible.map((rect) => rect.top));
    const right = Math.max(...visible.map((rect) => rect.right));
    const bottom = Math.max(...visible.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function editableMathRangeFromTarget(target) {
    if (!target) return null;
    if (target.container) {
      const range = document.createRange();
      const length = target.container.nodeType === Node.TEXT_NODE
        ? target.container.nodeValue.length
        : target.container.childNodes.length;
      range.setStart(target.container, Math.max(0, Math.min(target.offset || 0, length)));
      range.collapse(true);
      return range;
    }
    return target.cloneRange?.() || null;
  }

  function focusEditableMathRange(target, collapseToStart = true) {
    const range = editableMathRangeFromTarget(target);
    if (!range) return;
    const selection = window.getSelection?.();
    if (!selection) return;
    suspendMathRenderForFormulaEdit();
    const root = editorContentRoot();
    if (root?.focus) root.focus({ preventScroll: true });
    else focusEditor();
    const nextRange = range.cloneRange();
    if (collapseToStart) nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    clearEditorMathOverlays();
    scheduleEditorMathRender(0);
  }

  function activateEditableMathRange(event, target) {
    event.preventDefault();
    event.stopPropagation();
    suspendMathRenderForFormulaEdit();
    suppressMathEditPointerUntil = Date.now() + 420;
    window.setTimeout(() => focusEditableMathRange(target, true), 0);
    window.setTimeout(() => focusEditableMathRange(target, true), 140);
  }

  function mathHitboxFromRect(rect, display) {
    const paddingX = display ? 10 : 6;
    const paddingY = display ? 8 : 5;
    return {
      left: rect.left - paddingX,
      top: rect.top - paddingY,
      right: rect.right + paddingX,
      bottom: rect.bottom + paddingY
    };
  }

  function handleEditableMathPointer(event) {
    if (!mathOverlayHitboxes.length || !richEditorEl?.contains(event.target)) return;
    for (let index = mathOverlayHitboxes.length - 1; index >= 0; index -= 1) {
      const hitbox = mathOverlayHitboxes[index];
      if (
        event.clientX >= hitbox.rect.left
        && event.clientX <= hitbox.rect.right
        && event.clientY >= hitbox.rect.top
        && event.clientY <= hitbox.rect.bottom
      ) {
        activateEditableMathRange(event, hitbox.range);
        return;
      }
    }
  }

  function placeMathOverlay(layer, rect, tex, display, editableTarget) {
    if (!layer || !rect || !tex) return null;
    const hostRect = layer.parentElement.getBoundingClientRect();
    const node = document.createElement("span");
    node.className = display ? "writer-math-overlay writer-math-block-overlay" : "writer-math-overlay writer-math-inline-overlay";
    node.style.left = `${Math.max(0, rect.left - hostRect.left - (display ? 10 : 2))}px`;
    node.style.top = `${Math.max(0, rect.top - hostRect.top - (display ? 6 : 1))}px`;
    if (display) {
      node.style.minWidth = `${Math.max(260, rect.width + 20)}px`;
      node.style.minHeight = `${Math.max(52, rect.height + 12)}px`;
    } else {
      node.style.width = `${Math.max(24, rect.width + 4)}px`;
      node.style.height = `${Math.max(20, rect.height + 2)}px`;
    }
    const normalizedTex = normalizeMathTexShortcuts(tex);
    node.dataset.mathTex = normalizedTex;
    try {
      window.katex.render(normalizedTex, node, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        output: "html"
      });
    } catch (_) {
      return null;
    }
    if (editableTarget) {
      ["pointerdown", "mousedown", "click"].forEach((eventName) => {
        node.addEventListener(eventName, (event) => activateEditableMathRange(event, editableTarget));
      });
      mathOverlayHitboxes.push({
        rect: mathHitboxFromRect(rect, display),
        range: editableTarget
      });
    }
    layer.appendChild(node);
    return node;
  }

  function appendMathLineSegment(line, text) {
    if (!text) return;
    line.appendChild(document.createTextNode(text));
  }

  function appendMathLineFormula(line, tex, editableTarget, display = false) {
    const node = document.createElement("span");
    const normalizedTex = normalizeMathTexShortcuts(tex);
    node.className = `writer-math-line-formula${display ? " is-display" : ""}`;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", "Edit formula");
    node.dataset.mathTex = normalizedTex;
    try {
      window.katex.render(normalizedTex, node, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        output: "html"
      });
    } catch (_) {
      node.textContent = tex;
    }
    if (editableTarget) {
      ["pointerdown", "mousedown", "click"].forEach((eventName) => {
        node.addEventListener(eventName, (event) => activateEditableMathRange(event, editableTarget));
      });
    }
    line.appendChild(node);
    return node;
  }

  function placeInlineMathLineOverlay(layer, map, matches) {
    if (!layer || !map?.segments?.length || !matches.length) return null;
    const fullRange = rangeFromEditorMathMap(map, 0, map.text.length);
    const rect = fullRange ? unionRects(Array.from(fullRange.getClientRects())) : map.block.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const hostRect = layer.parentElement.getBoundingClientRect();
    const line = document.createElement("span");
    line.className = "writer-math-overlay writer-math-line-overlay";
    line.style.left = `${Math.max(0, rect.left - hostRect.left - 1)}px`;
    line.style.top = `${Math.max(0, rect.top - hostRect.top - 1)}px`;
    line.style.width = `${Math.max(24, rect.width + 2)}px`;
    line.style.minHeight = `${Math.max(20, rect.height + 2)}px`;

    let cursor = 0;
    const formulaNodes = [];
    matches.forEach((match) => {
      appendMathLineSegment(line, map.text.slice(cursor, match.start));
      const editableTarget = pointFromEditorMathMap(map, Math.max(match.start + 1, match.end - (match.closeLength || 1)));
      const formulaNode = appendMathLineFormula(line, match.tex, editableTarget, match.display);
      if (formulaNode) formulaNodes.push({ node: formulaNode, target: editableTarget });
      cursor = match.end;
    });
    appendMathLineSegment(line, map.text.slice(cursor));
    layer.appendChild(line);
    formulaNodes.forEach(({ node, target }) => {
      const formulaRect = node.getBoundingClientRect();
      mathOverlayHitboxes.push({
        rect: mathHitboxFromRect(formulaRect, false),
        range: target
      });
    });
    return line;
  }

  function markTextNodesInside(nodes, set) {
    nodes.forEach((node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) set.add(walker.currentNode);
    });
  }

  function renderBlockMathOverlays(root, layer, excludedTextNodes) {
    const blocks = Array.from(root.children || []).filter((node) => {
      return !node.closest("pre, code, .katex, .writer-math-layer") && node.textContent.trim();
    });
    let rendered = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      const startText = blocks[i].textContent.trim();
      const isDollarBlock = startText === "$$";
      const isBracketBlock = startText === "\\[";
      if (!isDollarBlock && !isBracketBlock) continue;
      const closeToken = isDollarBlock ? "$$" : "\\]";
      const sourceNodes = [blocks[i]];
      const texLines = [];
      let endIndex = -1;
      for (let j = i + 1; j < blocks.length; j += 1) {
        const text = blocks[j].textContent.trim();
        sourceNodes.push(blocks[j]);
        if (text === closeToken) {
          endIndex = j;
          break;
        }
        texLines.push(blocks[j].textContent);
      }
      if (endIndex < 0) continue;
      const sourceRange = document.createRange();
      sourceRange.setStartBefore(sourceNodes[0]);
      sourceRange.setEndAfter(sourceNodes[sourceNodes.length - 1]);
      markTextNodesInside(sourceNodes, excludedTextNodes);
      if (!selectionIntersectsRange(sourceRange)) {
        const rect = unionRects(sourceNodes.map((node) => node.getBoundingClientRect()));
        const editableTarget = sourceNodes[1]
          ? { container: sourceNodes[1], offset: 0 }
          : { container: sourceNodes[0].parentNode, offset: Array.prototype.indexOf.call(sourceNodes[0].parentNode.childNodes, sourceNodes[0]) };
        if (placeMathOverlay(layer, rect, texLines.join("\n").trim(), true, editableTarget)) rendered += 1;
      }
      i = endIndex;
    }
    return rendered;
  }

  function renderInlineMathOverlays(root, layer, excludedTextNodes) {
    let rendered = 0;
    editorMathBlocks(root).forEach((block) => {
      const map = editorMathTextMap(block);
      if (!map.segments.length || map.segments.some((segment) => excludedTextNodes.has(segment.node))) return;
      const matches = inlineMathMatches(map.text);
      if (!matches.length) return;
      const selectionTouchesFormula = matches.some((match) => {
        const range = rangeFromEditorMathMap(map, match.start, match.end);
        return range ? selectionIntersectsRange(range) : false;
      });
      if (selectionTouchesFormula) return;
      if (placeInlineMathLineOverlay(layer, map, matches)) rendered += matches.length;
    });
    return rendered;
  }

  function renderEditorMath() {
    if (!window.katex) return;
    const root = editorContentRoot();
    const layer = ensureMathOverlayLayer();
    clearEditorMathOverlays();
    if (!root || !layer) return;
    const markdown = getMarkdown();
    if (workbench.classList.contains("is-preview-open")) renderPreview();
    if (!markdownHasMath(markdown)) return;
    if (shouldHoldMathRenderForFormulaEdit(root)) return;
    const excludedTextNodes = new WeakSet();
    renderBlockMathOverlays(root, layer, excludedTextNodes);
    renderInlineMathOverlays(root, layer, excludedTextNodes);
  }

  function scheduleEditorMathRender(delay = 80) {
    window.clearTimeout(editorMathTimer);
    editorMathTimer = window.setTimeout(() => {
      window.requestAnimationFrame(renderEditorMath);
    }, delay);
  }

  function renderPreview() {
    const markdown = getMarkdown();
    if (!window.markdownit) {
      fields.preview.textContent = markdown;
      return;
    }
    const md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true
    });
    const rawHtml = md.render(normalizeMathShortcutsInMarkdown(
      preserveVisualIndentation(separateLooseTextLines(separateIntentionalParagraphs(separateStandaloneHtmlBreaks(markdown))))
    ));
    fields.preview.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ["target", "rel", "style", "width", "height", "class", "data-editor-width", "data-image-reserve", "data-image-layer", "data-writer-spacer"]
    }) : rawHtml;
    if (window.renderMathInElement) {
      window.renderMathInElement(fields.preview, {
        delimiters: mathDelimiters(),
        throwOnError: false
      });
    }
    if (window.hljs) {
      fields.preview.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
    }
    enhanceTaskLists(fields.preview);
    enhancePdfLinks(fields.preview);
    fitPreviewAbsoluteImages(fields.preview);
    window.MichelAnnotations?.enhance(fields.preview);
  }

  function enhancePdfLinks(root) {
    root?.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      let pdfUrl = null;
      try {
        const candidate = new URL(href, window.location.href);
        if (/\.pdf$/i.test(candidate.pathname)) pdfUrl = candidate;
      } catch (_) {
        return;
      }
      if (!pdfUrl) return;
      const label = (link.textContent || pdfUrl.pathname.split("/").pop() || "PDF document").trim();
      const viewer = new URL("./pdf-viewer.html", window.location.href);
      viewer.searchParams.set("file", `${pdfUrl.pathname}${pdfUrl.search}`);
      viewer.searchParams.set("title", label);
      link.className = "pdf-attachment";
      link.href = viewer.href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.innerHTML = `<span class="pdf-attachment-mark" aria-hidden="true">PDF</span><span class="pdf-attachment-copy"><strong>${escapeHtml(label)}</strong><small>Open document preview</small></span><span class="pdf-attachment-arrow" aria-hidden="true">↗</span>`;
    });
  }

  function enhanceTaskLists(root) {
    root?.querySelectorAll("li").forEach((item) => {
      const target = item.firstElementChild?.tagName === "P" ? item.firstElementChild : item;
      const first = target.firstChild;
      if (!first || first.nodeType !== Node.TEXT_NODE) return;
      const match = /^\s*\[([ xX])\]\s+/.exec(first.textContent || "");
      if (!match) return;
      first.textContent = first.textContent.slice(match[0].length);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = match[1].toLowerCase() === "x";
      checkbox.disabled = true;
      target.insertBefore(checkbox, first);
      item.classList.add("task-list-item");
    });
  }

  function fitPreviewAbsoluteImages(root) {
    if (!root) return;
    const rootWidth = root.clientWidth || root.getBoundingClientRect().width || 0;
    if (!rootWidth) return;
    const editorBaseWidth = 920;
    const scale = Math.min(1, rootWidth / editorBaseWidth);
    const visualPadding = 12;
    let bottom = 0;
    root.querySelectorAll('img[style*="position: absolute"]').forEach((img) => {
      if (!img.dataset.originalFreeStyle) img.dataset.originalFreeStyle = img.getAttribute("style") || "";
      const style = img.dataset.originalFreeStyle || img.getAttribute("style") || "";
      const widthMatch = /width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(style);
      const leftMatch = /left\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
      const topMatch = /top\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
      const widthPct = widthMatch ? Math.max(10, Math.min(100, Number.parseFloat(widthMatch[1]))) : defaultImageWidth;
      const rawLeft = leftMatch ? Number.parseFloat(leftMatch[1]) : 0;
      const rawTop = topMatch ? Number.parseFloat(topMatch[1]) : 0;
      const width = Math.min(rootWidth - visualPadding, Math.max(80, rootWidth * (widthPct / 100)));
      const maxLeft = Math.max(0, rootWidth - width - visualPadding);
      const left = Math.max(0, Math.min(maxLeft, rawLeft * scale));
      const top = Math.max(0, rawTop * scale);
      const reserve = imageReserve(img.getAttribute("data-image-reserve") || 0) * scale;
      img.style.boxSizing = "border-box";
      img.style.width = `${Math.round(width)}px`;
      img.style.left = `${Math.round(left)}px`;
      img.style.top = `${Math.round(top)}px`;
      img.style.maxWidth = `calc(100% - ${visualPadding}px)`;
      if (reserve > 0) {
        const block = imageAnchorBlock(img);
        if (block && block !== root) {
          block.style.minHeight = `${Math.ceil(reserve)}px`;
          block.classList.add("writer-image-reservation");
        }
      }
      const imgBottom = top + width / Math.max(0.2, img.naturalWidth / Math.max(1, img.naturalHeight || 1));
      bottom = Math.max(bottom, imgBottom);
    });
    if (bottom > 0) {
      root.style.minHeight = `${Math.ceil(bottom + 32)}px`;
    }
  }

  function readDraft() {
    return {
      draftId: activeDraftId,
      title: fields.title.value.trim(),
      slug: fields.slug.value.trim(),
      originalSlug: activeOriginalSlug,
      aliases: Array.from(new Set([activeOriginalSlug, fields.slug.value.trim()].filter(Boolean))),
      importedFromLegacy: activeImportedFromLegacy,
      legacySource: activeLegacySource,
      importedFromMarkdown: activeImportedFromMarkdown,
      sourceMarkdownPath: activeSourceMarkdownPath,
      category: fields.category.value.trim(),
      date: fields.date.value,
      tags: fields.tags.value.trim(),
      excerpt: cleanExcerptText(fields.excerpt.value),
      excerptMode,
      contentFormat: activeContentFormat,
      markdown: trimTrailingEmptyContent(activeContentFormat === "html"
        ? getMarkdown()
        : encodeIntentionalParagraphIndents(getMarkdown()))
    };
  }

  function saveLocalDraft(options = {}) {
    const savedAt = new Date();
    ensureDraftId();
    const draft = {
      ...readDraft(),
      savedAt: savedAt.toISOString(),
      writerVersion
    };
    try {
      const payloadText = JSON.stringify(draft);
      window.localStorage.setItem(draftKey, payloadText);
      window.localStorage.setItem(draftActiveKey, draft.draftId);
      window.localStorage.setItem(draftSlotKey(draft.draftId), payloadText);
      window.sessionStorage.setItem(draftSessionKey, payloadText);
      window.sessionStorage.setItem(draftActiveKey, draft.draftId);
      window.sessionStorage.setItem(draftSlotKey(draft.draftId), payloadText);
      if (!options.quiet) setStatus(saveStatus, `Cached ${clockTime(savedAt)}`);
    } catch (error) {
      setStatus(saveStatus, `Cache failed: ${error.message}`);
    }
    writeIndexedDraft(draft, {
      pending: options.pending !== false,
      baseRevision: activeRevision,
      revision: activeRevision
    }).catch(() => {});
    if (!applyingRemoteDraft && options.broadcast !== false) {
      draftChannel?.postMessage({
        type: "draft-local-update",
        clientId: writerClientId,
        draft: { ...draft, revision: activeRevision }
      });
    }
    return draft;
  }

  if (draftChannel) {
    draftChannel.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.type !== "draft-local-update" || message.clientId === writerClientId) return;
      if (!message.draft || activeLeaseHeld || !postMatchesActive(message.draft)) return;
      applyRemotePost({ ...message.draft, status: "draft" }, "Live mirror · synced locally");
    });
  }

  function draftIdentities(draft) {
    if (!draft) return new Set();
    if (typeof draft === "string") return new Set([draft.trim()].filter(Boolean));
    return new Set([
      draft.draftId,
      draft.slug,
      draft.originalSlug,
      ...(Array.isArray(draft.aliases) ? draft.aliases : [])
    ].map((value) => String(value || "").trim()).filter(Boolean));
  }

  function draftsShareIdentity(left, right) {
    const leftIdentities = draftIdentities(left);
    const rightIdentities = draftIdentities(right);
    return Array.from(leftIdentities).some((identity) => rightIdentities.has(identity));
  }

  function clearPublishedDraftCache(publishedDraft, options = {}) {
    const identities = draftIdentities(publishedDraft);
    const itemPrefix = `${draftKey}:item:`;
    const removedDraftIds = new Set();
    const shouldRemove = (draft, storageKey = "") => {
      if (options.removeScratch && storageKey === draftSlotKey("")) return true;
      if (!draft) return Array.from(identities).some((identity) => storageKey === draftSlotKey(identity));
      return draftsShareIdentity(draft, publishedDraft);
    };
    try {
      [window.localStorage, window.sessionStorage].forEach((storage) => {
        const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
        keys.forEach((key) => {
          if (!key.startsWith(itemPrefix)) return;
          if (!shouldRemove(parseDraft(storage.getItem(key)), key)) return;
          removedDraftIds.add(key.slice(itemPrefix.length));
          storage.removeItem(key);
        });
      });
      const cached = parseDraft(window.localStorage.getItem(draftKey));
      if (shouldRemove(cached, draftKey)) window.localStorage.removeItem(draftKey);
      const session = parseDraft(window.sessionStorage.getItem(draftSessionKey));
      if (shouldRemove(session, draftSessionKey)) window.sessionStorage.removeItem(draftSessionKey);
      const localActive = String(window.localStorage.getItem(draftActiveKey) || "");
      const sessionActive = String(window.sessionStorage.getItem(draftActiveKey) || "");
      if (!localActive || identities.has(localActive) || removedDraftIds.has(localActive)) window.localStorage.removeItem(draftActiveKey);
      if (!sessionActive || identities.has(sessionActive) || removedDraftIds.has(sessionActive)) window.sessionStorage.removeItem(draftActiveKey);
    } catch (_) {
      // Publishing succeeded; cache cleanup must not turn it into a failure.
    }
  }

  function draftSignature(draft, status = "draft") {
    return JSON.stringify({
      title: draft.title || "",
      draftId: draft.draftId || "",
      slug: draft.slug || "",
      category: draft.category || "",
      date: draft.date || "",
      tags: draft.tags || "",
      excerpt: draft.excerpt || "",
      excerptMode: draft.excerptMode || "auto",
      contentFormat: draft.contentFormat || "markdown",
      markdown: draft.markdown || "",
      status
    });
  }

  function hasDraftContent(draft = readDraft()) {
    return Boolean(
      draft.title
      || draft.slug
      || draft.excerpt
      || String(draft.markdown || "").trim()
    );
  }

  function formatDraftStamp(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Not saved yet";
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function renderDraftList() {
    if (!draftListEl) return;
    if (!draftList.length) {
      draftListEl.innerHTML = '<div class="draft-item" aria-disabled="true"><strong>No saved drafts</strong><span>Start typing to autosave one.</span></div>';
      return;
    }
    draftListEl.innerHTML = "";
    draftList.forEach((draft) => {
      const row = document.createElement("div");
      row.className = "draft-item-row";
      const button = document.createElement("button");
      button.type = "button";
      const isActive = (draft.draftId && draft.draftId === activeDraftId) || (!draft.draftId && draft.slug === activeDraftSlug);
      button.className = `draft-item${isActive ? " is-active" : ""}`;
      button.dataset.draftSlug = draft.slug;
      button.dataset.draftId = draft.draftId || "";
      const title = document.createElement("strong");
      title.textContent = draft.title || "Untitled";
      const meta = document.createElement("span");
      meta.textContent = `${draft.category || "Notes"} · ${draft.status || "draft"} · ${formatDraftStamp(draft.updatedAt || draft.createdAt)}`;
      button.append(title, meta);
      button.addEventListener("click", () => switchDraft(draft.draftId || draft.slug));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "draft-delete-button";
      deleteButton.setAttribute("aria-label", `Delete ${draft.title || "Untitled"}`);
      deleteButton.title = "Delete draft";
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => requestDeletePost(draft));
      row.append(button, deleteButton);
      draftListEl.append(row);
    });
  }

  function draftEditorHref(draft) {
    const identity = String(draft?.draftId || draft?.slug || "").trim();
    if (!identity) return "./admin.html?new=1";
    if (draft?.status === "local") return `./admin.html?restore=${encodeURIComponent(identity)}`;
    return `./admin.html?edit=${encodeURIComponent(identity)}`;
  }

  function renderDraftInboxList() {
    if (!draftInboxListEl) return;
    draftInboxListEl.replaceChildren();
    if (!draftList.length) {
      const empty = document.createElement("p");
      empty.className = "draft-inbox-empty";
      empty.textContent = "No drafts yet. Create a new article to start writing.";
      draftInboxListEl.append(empty);
      return;
    }
    draftList.forEach((draft) => {
      const link = document.createElement("a");
      link.className = "draft-inbox-card";
      link.href = draftEditorHref(draft);
      const title = document.createElement("strong");
      title.textContent = draft.title || "Untitled";
      const meta = document.createElement("span");
      meta.textContent = `${draft.category || "Notes"} · ${draft.status || "draft"} · ${formatDraftStamp(draft.updatedAt || draft.createdAt || draft.savedAt)}`;
      link.append(title, meta);
      draftInboxListEl.append(link);
    });
  }

  async function loadDrafts(options = {}) {
    if (!csrfToken || (workbench.hidden && draftInbox?.hidden !== false)) return;
    try {
      const result = await api("/api/admin/posts?status=draft");
      draftList = Array.isArray(result.posts) ? result.posts : [];
      const publishedBackup = parseDraft(window.localStorage.getItem(publishedBackupKey));
      if (publishedBackup) clearPublishedDraftCache(publishedBackup);
      const cachedActiveId = openDraftInbox
        ? window.sessionStorage.getItem(draftActiveKey) || window.localStorage.getItem(draftActiveKey) || ""
        : activeDraftId;
      const localDraft = parseDraft(window.localStorage.getItem(draftSlotKey(cachedActiveId)));
      if (
        localDraft?.draftId
        && hasDraftContent(localDraft)
        && !draftsShareIdentity(localDraft, publishedBackup)
        && !draftList.some((draft) => draftsShareIdentity(draft, localDraft))
      ) {
        draftList.unshift({
          ...localDraft,
          slug: localDraft.slug || "",
          status: "local",
          updatedAt: localDraft.savedAt || "",
          createdAt: localDraft.savedAt || ""
        });
      }
      renderDraftList();
      renderDraftInboxList();
      if (!options.quiet) setStatus(saveStatus, `Loaded ${draftList.length} drafts`);
    } catch (error) {
      if (!options.quiet) setStatus(saveStatus, error.message);
    }
  }

  function scheduleAutosave() {
    if (!csrfToken || !activeLeaseHeld || workbench.hidden || deleteInProgress || publishInProgress || activePostStatus === "published") return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveDraft({ quiet: true }).catch((error) => setStatus(saveStatus, error.message));
    }, 1200);
  }

  function waitForAutosaveIdle() {
    if (!autosaveInFlight) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (!autosaveInFlight) {
          resolve();
          return;
        }
        window.setTimeout(check, 50);
      };
      check();
    });
  }

  async function autosaveDraft(options = {}) {
    const { quiet = true, force = false, summarize = false, annotate = false } = options;
    if (!csrfToken || !activeLeaseHeld || workbench.hidden || deleteInProgress || publishInProgress || activePostStatus === "published") return null;
    if (!force && !hasDraftContent()) return null;
    window.clearTimeout(autosaveTimer);
    if (autosaveInFlight) {
      autosaveQueued = true;
      if (force) {
        await waitForAutosaveIdle();
        return autosaveDraft(options);
      }
      return null;
    }
    const current = readDraft();
    const signature = draftSignature(current, "draft");
    if (!force && signature === lastSavedSignature) return null;

    autosaveInFlight = true;
    if (!quiet) setStatus(saveStatus, "Saving draft...");
    try {
      const result = await api("/api/admin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...current,
          draftId: current.draftId || ensureDraftId(),
          slug: current.slug || (!fields.slug.dataset.touched && current.title ? slugify(current.title) : activeDraftSlug || current.draftId || ""),
          status: "draft",
          clientId: writerClientId,
          baseRevision: activeRevision,
          summarize,
          annotate
        })
      });
      if (result.slug) {
        activeDraftSlug = result.slug;
        if (!fields.slug.value.trim() && current.title.trim()) {
          fields.slug.value = result.slug;
          fields.slug.dataset.touched = "1";
        }
      }
      activeRevision = Math.max(0, Number(result.revision || activeRevision));
      if (result.excerptMode) setExcerptMode(result.excerptMode);
      if (typeof result.excerpt === "string") fields.excerpt.value = result.excerpt;
      const currentMarkdown = getMarkdown();
      const serverMayRewriteMarkdown = summarize || annotate;
      if (
        serverMayRewriteMarkdown
        && typeof result.markdown === "string"
        && !markdownEquivalentForEditor(result.markdown, currentMarkdown)
      ) {
        setMarkdown(result.markdown, { preserveCaret: true });
        renderPreview();
        window.setTimeout(decorateEditorAnnotations, 40);
      }
      lastSavedSignature = draftSignature(readDraft(), "draft");
      saveLocalDraft({ quiet: true, pending: false });
      await writeIndexedDraft({ ...readDraft(), savedAt: new Date().toISOString() }, {
        pending: false,
        revision: activeRevision
      });
      await loadDrafts({ quiet: true });
      setStatus(saveStatus, `${quiet ? "Autosaved" : "Draft saved"} ${clockTime()}${result.slug ? ` · ${result.slug}` : ""}`);
      return result;
    } catch (error) {
      if (error.status === 409 && error.payload?.post) {
        setMirrorMode(true, "Conflict prevented · showing the server version");
        await applyRemotePost(error.payload.post, "Conflict prevented · local recovery copy kept");
        return null;
      }
      if (error.status === 423) {
        setMirrorMode(true, "Live mirror · another page is editing");
        return null;
      }
      throw error;
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        scheduleAutosave();
      }
    }
  }

  function parseDraft(text) {
    try {
      return text ? JSON.parse(text) : null;
    } catch (_) {
      return null;
    }
  }

  function draftTime(draft) {
    const time = Date.parse(draft?.savedAt || "");
    return Number.isFinite(time) ? time : 0;
  }

  async function restoreDraft() {
    try {
      const localDraft = parseDraft(window.localStorage.getItem(draftKey));
      const sessionDraft = parseDraft(window.sessionStorage.getItem(draftSessionKey));
      const activeId = window.sessionStorage.getItem(draftActiveKey) || window.localStorage.getItem(draftActiveKey) || "";
      const localSlotDraft = parseDraft(window.localStorage.getItem(draftSlotKey(activeId)));
      const sessionSlotDraft = parseDraft(window.sessionStorage.getItem(draftSlotKey(activeId)));
      const indexedDraft = await readIndexedDraft(activeId);
      const candidates = [localDraft, sessionDraft, localSlotDraft, sessionSlotDraft, indexedDraft].filter(Boolean);
      const draft = candidates.sort((a, b) => draftTime(b) - draftTime(a))[0] || {};
      Object.entries(draft).forEach(([key, value]) => {
        if (fields[key] && typeof value === "string") fields[key].value = value;
      });
      resizeTitleField();
      activeDraftId = typeof draft.draftId === "string" ? draft.draftId : "";
      activeOriginalSlug = typeof draft.originalSlug === "string" ? draft.originalSlug : "";
      activeLegacySource = typeof draft.legacySource === "string" ? draft.legacySource : "";
      activeImportedFromLegacy = Boolean(draft.importedFromLegacy || activeLegacySource);
      setExcerptMode(draft.excerptMode || (draft.excerpt ? "manual" : "auto"));
      activeSourceMarkdownPath = typeof draft.sourceMarkdownPath === "string" ? draft.sourceMarkdownPath : "";
      activeImportedFromMarkdown = Boolean(draft.importedFromMarkdown || activeSourceMarkdownPath);
      setContentFormat(draft.contentFormat);
      if (typeof draft.markdown === "string") setMarkdown(draft.markdown);
      activeDraftSlug = fields.slug.value.trim();
      activeRevision = Math.max(0, Number(draft.revision || draft.baseRevision || 0));
      ensureDraftId();
      lastSavedSignature = "";
      if (draft.savedAt) setStatus(saveStatus, `Restored cache ${clockTime(new Date(draft.savedAt))}`);
      await acquireDraftLease();
    } catch (_) {
      // Ignore malformed old drafts.
    }
  }

  function toDateInput(value) {
    const normalized = String(value || "").replaceAll("/", "-");
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : today();
  }

  function setContentFormat(value) {
    activeContentFormat = String(value || "").trim().toLowerCase() === "html" ? "html" : "markdown";
    document.body.classList.toggle("is-html-source-editor", activeContentFormat === "html");
    document.body.classList.toggle("is-html-editor", activeContentFormat === "html");
    fields.markdown.setAttribute("aria-label", activeContentFormat === "html" ? "HTML source" : "Markdown source");
    if (activeContentFormat === "html") {
      window.requestAnimationFrame(() => renderHtmlVisualEditor(fields.markdown.value));
    }
  }

  function setDraftFields(post) {
    activePostStatus = post.status === "published" ? "published" : "draft";
    syncPostActions();
    activeDraftId = post.draftId || (activePostStatus === "draft" ? createDraftId() : "");
    activeRevision = Math.max(0, Number(post.revision || 0));
    activeDraftSlug = post.slug || "";
    activeOriginalSlug = post.originalSlug || post.slug || "";
    activeLegacySource = post.legacySource || "";
    activeImportedFromLegacy = Boolean(post.importedFromLegacy || post.legacySource);
    activeSourceMarkdownPath = post.sourceMarkdownPath || "";
    activeImportedFromMarkdown = Boolean(post.importedFromMarkdown || post.sourceMarkdownPath);
    setContentFormat(post.contentFormat);
    setPostViewCount(post.views, Boolean(post.slug && post.status !== "draft"));
    fields.title.value = post.title || "";
    resizeTitleField();
    fields.slug.value = post.slug || "";
    fields.slug.dataset.touched = post.slug ? "1" : "";
    fields.category.value = post.category || "Notes";
    fields.date.value = toDateInput(post.date);
    fields.tags.value = Array.isArray(post.tags) ? post.tags.join(", ") : String(post.tags || "");
    fields.excerpt.value = cleanExcerptText(post.excerpt || "");
    setExcerptMode(post.excerptMode || (post.excerpt ? "manual" : "auto"));
    setMarkdown(post.markdown || "");
    selectedImage = null;
    selectedImageNode = null;
    imageOverlay?.classList.remove("is-active");
    renderPreview();
    lastSavedSignature = draftSignature(readDraft(), post.status || "draft");
    renderDraftList();
  }

  async function loadPostForEditing(slug) {
    setStatus(saveStatus, "Loading post...");
    try {
      const result = await api(`/api/admin/posts/${encodeURIComponent(slug)}`);
      setDraftFields(result.post || {});
      saveLocalDraft({ quiet: true, broadcast: false, pending: false });
      await acquireDraftLease();
      setStatus(saveStatus, result.post?.importedFromLegacy
        ? `Imported legacy Markdown: ${result.post?.slug || slug}`
        : `Editing: ${result.post?.slug || slug}`);
      window.requestAnimationFrame(() => fields.title.focus({ preventScroll: true }));
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
  }

  function payload(status) {
    const draft = readDraft();
    return {
      ...draft,
      draftId: draft.draftId || activeDraftId,
      slug: draft.slug || activeDraftSlug || slugify(draft.title),
      status
    };
  }

  fields.title.addEventListener("input", () => {
    resizeTitleField();
    if (!fields.slug.dataset.touched) fields.slug.value = slugify(fields.title.value);
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
  });
  fields.slug.addEventListener("input", () => {
    fields.slug.dataset.touched = "1";
    activeDraftSlug = fields.slug.value.trim();
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
  });
  [fields.category, fields.date, fields.tags].forEach((field) => {
    field.addEventListener("input", () => {
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
    });
  });
  fields.excerpt.addEventListener("input", () => {
    setExcerptMode(fields.excerpt.value.trim() ? "manual" : "auto");
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
  });
  fields.excerpt.addEventListener("blur", () => {
    normalizeExcerptField();
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
  });

  async function generateSummary() {
    if (summaryGenerationInProgress) return;
    const markdown = encodeIntentionalParagraphIndents(getMarkdown()).trim();
    if (!markdown) {
      setStatus(saveStatus, "Write the article before generating its summary");
      focusEditor();
      return;
    }

    summaryGenerationInProgress = true;
    const idleLabel = generateSummaryButton?.innerHTML || '<span aria-hidden="true">✦</span> Summary';
    if (generateSummaryButton) {
      generateSummaryButton.disabled = true;
      generateSummaryButton.setAttribute("aria-busy", "true");
      generateSummaryButton.textContent = "Generating...";
    }
    setStatus(saveStatus, "Generating summary...");

    try {
      const result = await api("/api/admin/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.title.value.trim() || "Untitled",
          markdown
        })
      });
      fields.excerpt.value = cleanExcerptText(result.summary || "");
      fields.excerpt.dispatchEvent(new Event("input", { bubbles: true }));
      setExcerptMode("auto");
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
      setStatus(saveStatus, "Summary generated");
    } catch (error) {
      setStatus(saveStatus, error.message || "Summary generation failed");
    } finally {
      summaryGenerationInProgress = false;
      if (generateSummaryButton) {
        generateSummaryButton.disabled = false;
        generateSummaryButton.removeAttribute("aria-busy");
        generateSummaryButton.innerHTML = idleLabel;
      }
    }
  }

  generateSummaryButton?.addEventListener("click", generateSummary);

  fields.markdown.addEventListener("input", () => {
    saveLocalDraft({ quiet: true });
    renderPreview();
    scheduleAutosave();
  });

  fields.markdown.addEventListener("paste", (event) => {
    handlePastedImage(event);
  });

  function setSidebarOpen(isOpen) {
    workbench.classList.toggle("is-sidebar-collapsed", !isOpen);
  }

  function setPreviewOpen(isOpen) {
    workbench.classList.toggle("is-preview-open", isOpen);
    if (isOpen) renderPreview();
  }

  function setMobileView(view, { focus = true } = {}) {
    const next = ["write", "details", "preview"].includes(view) ? view : "write";
    workbench.dataset.mobileView = next;
    mobileViewButtons.forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.mobileViewButton === next));
    });
    setPreviewOpen(next === "preview");
    if (next === "write" && focus) window.requestAnimationFrame(focusEditor);
    if (next === "details" && focus) window.requestAnimationFrame(() => fields.title.focus());
  }

  mobileViewButtons.forEach((button) => {
    button.addEventListener("click", () => setMobileView(button.dataset.mobileViewButton));
  });

  leaseTakeoverButton?.addEventListener("click", () => {
    acquireDraftLease({ takeover: true }).catch((error) => setStatus(saveStatus, error.message));
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(loginForm).get("password");
    setStatus(loginStatus, "Checking...");
    try {
      const result = await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      csrfToken = result.csrfToken || "";
      loginForm.reset();
      setStatus(loginStatus, "");
      showWorkbench();
    } catch (error) {
      setStatus(loginStatus, error.message);
    }
  });

  logoutButton?.addEventListener("click", async () => {
    releaseDraftLease();
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (_) {
      // Session may already be gone.
    }
    csrfToken = "";
    draftEventSource?.close();
    draftEventSource = null;
    showLogin();
  });

  async function switchDraft(identity) {
    if (!identity || identity === activeDraftId || identity === activeDraftSlug) return;
    try {
      await autosaveDraft({ quiet: true, force: false });
      releaseDraftLease();
      await loadPostForEditing(identity);
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
  }

  async function newDraft() {
    try {
      await autosaveDraft({ quiet: true, force: false });
    } catch (error) {
      setStatus(saveStatus, `Current draft stayed local: ${error.message}`);
    }
    resetToBlankDraft();
  }

  function resetToBlankDraft(message = "New local draft") {
    releaseDraftLease();
    activePostStatus = "draft";
    syncPostActions();
    activeDraftId = createDraftId();
    activeRevision = 0;
    activeDraftSlug = "";
    activeOriginalSlug = "";
    setPostViewCount(0, false);
    activeLegacySource = "";
    activeImportedFromLegacy = false;
    activeSourceMarkdownPath = "";
    activeImportedFromMarkdown = false;
    setContentFormat("markdown");
    lastSavedSignature = "";
    fields.title.value = "";
    resizeTitleField();
    fields.slug.value = "";
    fields.slug.dataset.touched = "";
    fields.category.value = "Notes";
    fields.date.value = today();
    fields.tags.value = "";
    fields.excerpt.value = "";
    setExcerptMode("auto");
    setMarkdown("");
    selectedImage = null;
    selectedImageNode = null;
    imageOverlay?.classList.remove("is-active");
    saveLocalDraft({ quiet: true });
    acquireDraftLease().catch((error) => setStatus(saveStatus, error.message));
    renderDraftList();
    renderPreview();
    setStatus(saveStatus, message);
    window.requestAnimationFrame(() => {
      resizeTitleField();
      fields.title.focus();
    });
  }

  function confirmPostDeletion(post) {
    const title = String(post?.title || fields.title.value || "Untitled").trim() || "Untitled";
    const status = post?.status === "published" || activePostStatus === "published" ? "published post" : "draft";
    const copy = `“${title}” will disappear from ${status === "published post" ? "the public blog" : "your draft list"}. Its Markdown source will be kept in the server trash folder for recovery.`;
    if (!deleteDialog || typeof deleteDialog.showModal !== "function") {
      return Promise.resolve(window.confirm(`Delete ${title}?\n\n${copy}`));
    }
    deleteDialogTitle.textContent = `Delete “${title}”?`;
    deleteDialogCopy.textContent = copy;
    deleteDialog.returnValue = "";
    return new Promise((resolve) => {
      deleteDialog.addEventListener("close", () => resolve(deleteDialog.returnValue === "confirm"), { once: true });
      deleteDialog.showModal();
    });
  }

  function currentDeleteTarget() {
    const draft = readDraft();
    return {
      ...draft,
      title: draft.title || "Untitled",
      status: activePostStatus,
      draftId: activeDraftId,
      slug: activeDraftSlug || draft.slug
    };
  }

  function sameDeleteTarget(target) {
    return draftsShareIdentity(target, currentDeleteTarget());
  }

  function deleteTargetIdentities(target) {
    const preferred = [
      target?.draftId,
      target?.slug,
      target?.originalSlug,
      ...(Array.isArray(target?.aliases) ? target.aliases : [])
    ];
    return Array.from(new Set(preferred.map((value) => String(value || "").trim()).filter(Boolean)));
  }

  async function deleteManagedPost(target) {
    const identities = deleteTargetIdentities(target);
    let missingError = null;
    for (const identity of identities) {
      try {
        return await api(`/api/admin/posts/${encodeURIComponent(identity)}?clientId=${encodeURIComponent(writerClientId)}`, { method: "DELETE" });
      } catch (error) {
        if (!/not found|not managed/i.test(String(error?.message || ""))) throw error;
        missingError = error;
      }
    }
    if (target?.status === "published" && missingError) throw missingError;
    return null;
  }

  async function requestDeletePost(target = currentDeleteTarget()) {
    if (deleteInProgress) return;
    const identities = deleteTargetIdentities(target);
    if (!identities.length) {
      setStatus(saveStatus, "Nothing saved to delete");
      return;
    }
    if (!(await confirmPostDeletion(target))) return;

    const isCurrent = sameDeleteTarget(target);
    deleteInProgress = true;
    window.clearTimeout(autosaveTimer);
    autosaveQueued = false;
    setStatus(saveStatus, `Deleting ${target.title || "post"}...`);
    try {
      await waitForAutosaveIdle();
      const result = await deleteManagedPost(target);
      const deletedTarget = {
        ...target,
        ...(result?.deleted || {}),
        aliases: Array.from(new Set([
          ...identities,
          ...(Array.isArray(target.aliases) ? target.aliases : []),
          ...(Array.isArray(result?.deleted?.aliases) ? result.deleted.aliases : [])
        ]))
      };
      if (isCurrent) suppressLocalDraftSave = true;
      clearPublishedDraftCache(deletedTarget);
      draftList = draftList.filter((draft) => {
        return !draftsShareIdentity(draft, deletedTarget);
      });
      if (isCurrent) {
        window.location.replace("./admin.html?drafts=1");
        return;
      }
      renderDraftList();
      await loadDrafts({ quiet: true });
      setStatus(saveStatus, `Deleted “${target.title || "Untitled"}”`);
    } catch (error) {
      suppressLocalDraftSave = false;
      setStatus(saveStatus, error.message);
    } finally {
      deleteInProgress = false;
    }
  }

  function undoLastChange() {
    if (workbench.hidden) return;
    try {
      if (activeContentFormat === "html") {
        htmlEditorDocument()?.execCommand("undo");
      } else if (richEditor && typeof richEditor.exec === "function") {
        richEditor.exec("undo");
      } else {
        document.execCommand("undo");
      }
    } catch (_) {
      document.execCommand("undo");
    }
    window.setTimeout(() => {
      if (activeContentFormat === "html") syncHtmlEditorFromVisual();
      else if (richEditor) syncFromRichEditor();
      else {
        saveLocalDraft({ quiet: true });
        renderPreview();
        scheduleAutosave();
      }
    }, 30);
  }

  async function saveDraft() {
    normalizeExcerptField();
    saveLocalDraft();
    try {
      await autosaveDraft({ quiet: false, force: true, summarize: true, annotate: true });
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
  }

  async function publishPost() {
    if (publishInProgress) return;
    publishInProgress = true;
    const publishLabel = activePostStatus === "published" ? "Update" : "Publish";
    if (publishButton) {
      publishButton.disabled = true;
      publishButton.setAttribute("aria-busy", "true");
      publishButton.textContent = "Publishing...";
    }
    window.clearTimeout(autosaveTimer);
    autosaveQueued = false;
    normalizeExcerptField();
    setStatus(saveStatus, "Publishing...");
    let failed = false;
    try {
      await waitForAutosaveIdle();
      const cachedDraft = saveLocalDraft();
      const publishedDraftId = cachedDraft?.draftId || activeDraftId;
      const result = await api("/api/admin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload("published"),
          clientId: writerClientId,
          baseRevision: activeRevision,
          summarize: true,
          annotate: true,
          deferEnrichment: true
        })
      });
      if (result.excerptMode) setExcerptMode(result.excerptMode);
      if (typeof result.excerpt === "string") fields.excerpt.value = result.excerpt;
      if (result.slug) activeDraftSlug = result.slug;
      activeRevision = Math.max(0, Number(result.revision || activeRevision));
      lastSavedSignature = draftSignature(readDraft(), "published");
      const publishedSnapshot = {
        ...cachedDraft,
        slug: result.slug || cachedDraft.slug,
        publishedAt: new Date().toISOString(),
        publishedUrl: result.url
      };
      window.localStorage.setItem(publishedBackupKey, JSON.stringify(publishedSnapshot));
      clearPublishedDraftCache(publishedSnapshot, { removeScratch: true });
      draftList = draftList.filter((draft) => {
        if (publishedDraftId && draft.draftId === publishedDraftId) return false;
        return !result.slug || draft.slug !== result.slug;
      });
      activePostStatus = "published";
      releaseDraftLease();
      syncPostActions();
      activeDraftId = "";
      renderDraftList();
      await loadDrafts({ quiet: true });
      setStatus(saveStatus, result.enrichmentQueued
        ? `Published: ${result.url} · AI details updating in background`
        : `Published: ${result.url} · removed from drafts`);
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.open(result.url, "_blank", "noopener");
      }
    } catch (error) {
      failed = true;
      setStatus(saveStatus, error.message);
    } finally {
      publishInProgress = false;
      if (publishButton) {
        publishButton.disabled = false;
        publishButton.removeAttribute("aria-busy");
        publishButton.textContent = failed ? publishLabel : "Update";
      }
      if (failed) scheduleAutosave();
    }
  }

  function confirmUnpublish() {
    if (!unpublishDialog || typeof unpublishDialog.showModal !== "function") {
      return Promise.resolve(window.confirm("Move this article back to drafts? It will disappear from the public blog."));
    }
    unpublishDialog.returnValue = "";
    return new Promise((resolve) => {
      unpublishDialog.addEventListener("close", () => resolve(unpublishDialog.returnValue === "confirm"), { once: true });
      unpublishDialog.showModal();
    });
  }

  async function unpublishPost() {
    if (unpublishInProgress || activePostStatus !== "published") return;
    if (!(await confirmUnpublish())) return;
    unpublishInProgress = true;
    const originalLabel = unpublishButton?.textContent || "Move to drafts";
    if (unpublishButton) {
      unpublishButton.disabled = true;
      unpublishButton.setAttribute("aria-busy", "true");
      unpublishButton.textContent = "Moving...";
    }
    window.clearTimeout(autosaveTimer);
    autosaveQueued = false;
    normalizeExcerptField();
    setStatus(saveStatus, "Moving article to drafts...");
    try {
      await waitForAutosaveIdle();
      const result = await api("/api/admin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload("draft"),
          clientId: writerClientId,
          baseRevision: activeRevision,
          summarize: false,
          annotate: false
        })
      });
      activePostStatus = "draft";
      activeDraftId = result.draftId || activeDraftId || createDraftId();
      activeRevision = Math.max(0, Number(result.revision || activeRevision));
      activeDraftSlug = result.slug || activeDraftSlug;
      lastSavedSignature = draftSignature(readDraft(), "draft");
      window.localStorage.removeItem(publishedBackupKey);
      saveLocalDraft({ quiet: true });
      syncPostActions();
      window.location.replace("./admin.html?drafts=1");
    } catch (error) {
      setStatus(saveStatus, error.message);
    } finally {
      unpublishInProgress = false;
      if (unpublishButton) {
        unpublishButton.disabled = false;
        unpublishButton.removeAttribute("aria-busy");
        unpublishButton.textContent = originalLabel;
      }
    }
  }

  undoButton?.addEventListener("click", undoLastChange);
  unpublishButton?.addEventListener("click", unpublishPost);
  deletePostButton?.addEventListener("click", () => requestDeletePost());
  newDraftButton?.addEventListener("click", newDraft);
  refreshDraftsButton?.addEventListener("click", () => loadDrafts({ quiet: false }));
  document.querySelector("[data-save-draft]")?.addEventListener("click", saveDraft);
  publishButton?.addEventListener("click", publishPost);

  function insertMarkdown(text) {
    if (richEditor && activeContentFormat !== "html") {
      if (typeof richEditor.insertText === "function") {
        richEditor.insertText(text);
        syncFromRichEditor();
      } else {
        const current = richEditor.getMarkdown();
        const next = `${current}${current.trim() ? "\n\n" : ""}${text}\n`;
        setMarkdown(next);
      }
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
      renderPreview();
      focusEditor();
      return;
    }
    const start = fields.markdown.selectionStart || fields.markdown.value.length;
    const end = fields.markdown.selectionEnd || start;
    fields.markdown.value = `${fields.markdown.value.slice(0, start)}${text}${fields.markdown.value.slice(end)}`;
    fields.markdown.focus();
    fields.markdown.selectionStart = fields.markdown.selectionEnd = start + text.length;
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
    renderPreview();
  }

  function appendMarkdownBlock(text) {
    const current = getMarkdown();
    const next = `${current}${current.trim() ? "\n\n" : ""}${text}\n`;
    setMarkdown(next);
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
    renderPreview();
    focusEditor();
  }

  function imageMarkdown(result, file) {
    const alt = result.alt || (file?.name || "image").replace(/\.[^.]+$/, "");
    if (result.url) return markdownImage(result.url, alt);
    return result.markdown || `![${alt}](${result.url})`;
  }

  function insertEditorImage(src, alt) {
    if (!richEditor || !src) return false;
    try {
      if (typeof richEditor.exec === "function") {
        richEditor.exec("addImage", { imageUrl: src, altText: alt || "image" });
        syncFromRichEditor();
        return true;
      }
    } catch (_) {
      // Fall through to Markdown insertion.
    }
    return false;
  }

  function restorePendingImageSelection(pending) {
    const selection = pending?.selection;
    if (!richEditor || !Array.isArray(selection) || selection.length < 2) return;
    try {
      richEditor.setSelection(selection[0], selection[1]);
    } catch (_) {
      // Keep the browser caret if this editor build cannot restore its selection.
    }
  }

  function insertUploadedImage(result, file, mode = "flow", pending = null) {
    const markdown = imageMarkdown(result, file);
    const alt = result.alt || (file?.name || "image").replace(/\.[^.]+$/, "");
    restorePendingImageSelection(pending);
    if (result.url && insertEditorImage(result.url, alt)) {
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
      renderPreview();
      window.setTimeout(() => {
        selectImageBySrc(result.url);
        if (mode === "free" && selectedImageNode) {
          const position = imageAbsolutePositionFromNode(selectedImageNode);
          replaceSelectedImage(defaultImageWidth, "free", position.x, position.y, 0, defaultImageLayer);
        }
      }, 180);
      return;
    }
    appendMarkdownBlock(markdown);
    if (result.url) window.setTimeout(() => {
      selectImageBySrc(result.url);
      if (mode === "free" && selectedImageNode) {
        const position = imageAbsolutePositionFromNode(selectedImageNode);
        replaceSelectedImage(defaultImageWidth, "free", position.x, position.y, 0, defaultImageLayer);
      }
    }, 180);
  }

  function layoutSpacerMarkupWithId(idValue, heightValue) {
    const height = Math.max(0, Math.min(imageOffsetLimit, Math.round(Number(heightValue) || 0)));
    if (height < 8) return "";
    const id = String(idValue || `spacer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-z0-9_-]/gi, "");
    return `<div class="writer-layout-spacer" data-writer-spacer="${id}" style="height:${height}px"></div>`;
  }

  function layoutSpacerMarkup(heightValue) {
    return layoutSpacerMarkupWithId("", heightValue);
  }

  function layoutSpacerSource(id, height) {
    return `/assets/writer-spacer.svg?writer-spacer=${encodeURIComponent(id)}--${imageReserve(height)}`;
  }

  function layoutSpacerFromSrc(src) {
    try {
      const url = new URL(src, window.location.href);
      const token = url.searchParams.get("writer-spacer") || "";
      const compact = /^(.*)--(\d+)$/.exec(token);
      const id = compact?.[1] || token;
      const height = imageReserve(compact?.[2] || url.searchParams.get("height") || 0);
      return id && height ? { id, height } : null;
    } catch (_) {
      return null;
    }
  }

  function layoutSpacerTagToEditorMarkdown(tag) {
    const id = /\bdata-writer-spacer=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const height = imageReserve(/\bheight\s*:\s*(\d+(?:\.\d+)?)px/i.exec(tag)?.[1] || 0);
    if (!id || !height) return "";
    const src = layoutSpacerSource(id, height);
    rememberPlacedImage(src, { alt: "layout spacer", width: 100, align: "flow", x: 0, y: 0, reserve: height, layer: 1 });
    return markdownImage(src, "layout spacer");
  }

  function normalizeLayoutSpacersForStorage(markdown) {
    const replaceSource = (match, src) => {
      const spacer = layoutSpacerFromSrc(src);
      return spacer ? layoutSpacerMarkupWithId(spacer.id, spacer.height) : match;
    };
    return String(markdown || "")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => replaceSource(match, src))
      .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => replaceSource(match, src));
  }

  function selectedImageOccupiedHeight() {
    if (!selectedImageNode || !selectedImage) return 0;
    const rect = selectedImageNode.getBoundingClientRect();
    const reserve = imageReserve(selectedImage.reserve || 0);
    if (selectedImage.align === "free") {
      return Math.max(reserve, imageOffset(selectedImage.y || 0) + rect.height);
    }
    return rect.height + reserve + 16;
  }

  function temporaryImageSrc(src) {
    try {
      const url = new URL(src, window.location.href);
      url.searchParams.set("writer-move", `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      return url.href;
    } catch (_) {
      const separator = String(src).includes("?") ? "&" : "?";
      return `${src}${separator}writer-move=${Date.now()}`;
    }
  }

  function replaceFirstImageSource(markdown, srcs, replacement) {
    let changed = false;
    const next = markdown
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
        if (changed || !srcs.has(src)) return match;
        changed = true;
        return replacement;
      })
      .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => {
        if (changed || !srcs.has(src)) return match;
        changed = true;
        return replacement;
      });
    return { markdown: next, changed };
  }

  function relocateSelectedImage(pending, mode) {
    const source = pending?.source;
    if (!source?.src) return;
    const tempSrc = temporaryImageSrc(source.src);
    const spacer = layoutSpacerMarkup(pending.occupiedHeight || 0);
    restorePendingImageSelection(pending);
    if (!insertEditorImage(tempSrc, source.alt || "image")) {
      setStatus(saveStatus, "Could not move the image to that text position.");
      return;
    }
    window.setTimeout(() => {
      let markdown = getMarkdown();
      const oldResult = replaceFirstImageSource(markdown, imageSrcCandidates(source.src), spacer);
      if (!oldResult.changed) {
        setStatus(saveStatus, "Could not preserve the image's old position.");
        return;
      }
      markdown = oldResult.markdown;
      const nextAlign = mode === "free" ? "free" : "flow";
      const tempResult = replaceFirstImageSource(
        markdown,
        imageSrcCandidates(tempSrc),
        imageMarkupForStorage(source.src, source.alt || "image", source.width || defaultImageWidth, nextAlign, 0, 0, 0, source.layer || defaultImageLayer)
      );
      if (!tempResult.changed) {
        setStatus(saveStatus, "Could not finish moving the image.");
        return;
      }
      setMarkdown(tempResult.markdown);
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
      renderPreview();
      window.setTimeout(() => selectImageBySrc(source.src), 180);
      setStatus(saveStatus, "Image moved. The old position remains as a removable layout spacer.");
    }, 120);
  }

  function ensureImagePlacementChooser() {
    let chooser = document.querySelector("[data-image-placement-chooser]");
    if (chooser) return chooser;
    chooser = document.createElement("div");
    chooser.className = "image-placement-chooser";
    chooser.dataset.imagePlacementChooser = "";
    chooser.hidden = true;
    chooser.innerHTML = [
      '<strong>Place pasted image</strong>',
      '<span>Click the target text first, then choose a layout.</span>',
      '<div>',
      '<button type="button" data-image-placement="flow">Insert in text</button>',
      '<button type="button" data-image-placement="free">Place freely</button>',
      '<button type="button" data-image-placement="cancel" aria-label="Cancel image">×</button>',
      '</div>'
    ].join("");
    document.body.appendChild(chooser);
    chooser.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.('button[data-image-placement="flow"], button[data-image-placement="free"]')) {
        event.preventDefault();
      }
    });
    chooser.addEventListener("click", (event) => {
      const mode = event.target?.closest?.("button")?.dataset?.imagePlacement;
      if (!mode) return;
      event.preventDefault();
      event.stopPropagation();
      if (mode === "cancel") {
        pendingImagePlacement = null;
        chooser.hidden = true;
        setStatus(saveStatus, "Pasted image cancelled.");
        return;
      }
      const pending = pendingImagePlacement;
      if (!pending) return;
      pendingImagePlacement = null;
      chooser.hidden = true;
      if (pending.kind === "relocate") relocateSelectedImage(pending, mode);
      else insertUploadedImage(pending.result, pending.file, mode, pending);
      setStatus(saveStatus, mode === "flow" ? "Image inserted into the text flow." : "Image placed freely. Text remains independent until you drag the text line.");
    });
    return chooser;
  }

  function choosePastedImagePlacement(result, file, pending = null) {
    if (stableFlowImageMode) {
      insertUploadedImage(result, file, "flow", pending);
      setStatus(saveStatus, "Image inserted at the current text position.");
      return;
    }
    pendingImagePlacement = { kind: "paste", result, file };
    const chooser = ensureImagePlacementChooser();
    chooser.hidden = false;
    setStatus(saveStatus, "Image ready. Click a text position, then choose Insert in text or Place freely.");
  }

  function capturePendingImageSelection() {
    if (!pendingImagePlacement || !richEditor?.getSelection) return;
    window.queueMicrotask(() => {
      try {
        const selection = richEditor.getSelection();
        if (Array.isArray(selection) && selection.length >= 2) {
          pendingImagePlacement.selection = [selection[1], selection[1]];
        }
      } catch (_) {
        // The current DOM caret remains the fallback.
      }
    });
  }

  richEditorEl?.addEventListener("click", capturePendingImageSelection, true);
  richEditorEl?.addEventListener("keyup", capturePendingImageSelection, true);
  richEditorEl?.addEventListener("pointerup", capturePendingImageSelection, true);
  document.addEventListener("selectionchange", capturePendingImageSelection);

  function isImageLike(file) {
    if (!file) return false;
    return String(file.type || "").startsWith("image/") || imageNamePattern.test(file.name || "");
  }

  function isPdfLike(file) {
    if (!file) return false;
    return String(file.type || "").toLowerCase() === "application/pdf" || /\.pdf$/i.test(file.name || "");
  }

  function isUploadLike(file) {
    return isImageLike(file) || isPdfLike(file);
  }

  function cleanImageBase(file) {
    return (file?.name || "clipboard")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w\u3400-\u9fff.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "clipboard";
  }

  function inferredImageType(file) {
    const name = file?.name || "";
    if (/\.png$/i.test(name)) return "image/png";
    if (/\.jpe?g$/i.test(name)) return "image/jpeg";
    if (/\.gif$/i.test(name)) return "image/gif";
    if (/\.webp$/i.test(name)) return "image/webp";
    return "";
  }

  async function convertImageToPng(file) {
    if (!window.createImageBitmap) {
      throw new Error("This image format is not supported by the browser clipboard.");
    }
    const bitmap = await window.createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not convert pasted image.");
    return new File([blob], `${cleanImageBase(file)}.png`, { type: "image/png" });
  }

  async function normalizeUploadFile(file) {
    if (!file) {
      setStatus(saveStatus, "Choose an image first.");
      throw new Error("Choose an image first.");
    }
    if (!isImageLike(file)) {
      throw new Error("Only images can be inserted.");
    }
    const inferredType = inferredImageType(file);
    if (!file.type && acceptedUploadTypes.has(inferredType)) {
      return new File([file], file.name || `clipboard.${inferredType.split("/")[1]}`, { type: inferredType });
    }
    if (acceptedUploadTypes.has(file.type)) return file;
    return convertImageToPng(file);
  }

  async function uploadImageFile(file) {
    const uploadFile = await normalizeUploadFile(file);
    setStatus(saveStatus, "Uploading image...");
    const form = new FormData();
    form.append("image", uploadFile);
    const result = await api("/api/admin/upload", {
      method: "POST",
      body: form
    });
    return {
      ...result,
      alt: cleanImageBase(uploadFile)
    };
  }

  async function uploadPdfFile(file) {
    if (!isPdfLike(file)) throw new Error("Choose a PDF file.");
    setStatus(saveStatus, "Uploading PDF...");
    const form = new FormData();
    form.append("file", file);
    return api("/api/admin/upload", {
      method: "POST",
      body: form
    });
  }

  async function uploadAttachment(file) {
    if (!file) {
      setStatus(saveStatus, "Choose an image or PDF first.");
      return;
    }
    if (isPdfLike(file)) {
      try {
        const result = await uploadPdfFile(file);
        appendMarkdownBlock(result.markdown || `[${file.name}](${result.url})`);
        setStatus(saveStatus, `PDF uploaded: ${result.url}`);
      } catch (error) {
        setStatus(saveStatus, error.message);
      }
      return;
    }
    uploadImage(file);
  }

  async function uploadImage(file) {
    try {
      const result = await uploadImageFile(file);
      insertUploadedImage(result, file);
      setStatus(saveStatus, `Image uploaded: ${result.url}`);
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
  }

  function imageFromClipboard(event) {
    const data = event.clipboardData;
    if (!data) return null;
    const file = Array.from(data.files || []).find(isImageLike);
    if (file) return file;
    for (const item of Array.from(data.items || [])) {
      if (item.kind !== "file") continue;
      if (item.type && !item.type.startsWith("image/")) continue;
      const itemFile = item.getAsFile();
      if (itemFile && (isImageLike(itemFile) || !item.type)) return itemFile;
    }
    return null;
  }

  function imageUrlFromClipboard(event) {
    const data = event.clipboardData;
    if (!data) return "";
    const html = data.getData("text/html");
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const img = doc.querySelector("img[src]");
      const src = img?.getAttribute("src") || "";
      if (src && !src.startsWith("file:")) return src;
    }
    const uri = data.getData("text/uri-list") || data.getData("text/plain");
    if (/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(uri.trim())) return uri.trim();
    return "";
  }

  async function handlePastedImage(event) {
    if (workbench.hidden) return false;
    const file = imageFromClipboard(event);
    const imageUrl = file ? "" : imageUrlFromClipboard(event);
    if (!file && !imageUrl) return false;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    let pasteSelection = null;
    try {
      const selection = richEditor?.getSelection?.();
      if (Array.isArray(selection) && selection.length >= 2) pasteSelection = [selection[1], selection[1]];
    } catch (_) {
      // The editor's live caret remains the fallback.
    }
    const pending = pasteSelection ? { selection: pasteSelection } : null;
    try {
      if (file) {
        const result = await uploadImageFile(file);
        choosePastedImagePlacement(result, file, pending);
      } else {
        choosePastedImagePlacement({ url: imageUrl, alt: "image" }, null, pending);
      }
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
    return true;
  }

  function imageSrcCandidates(src) {
    const values = new Set([src]);
    try {
      const url = new URL(src, window.location.href);
      values.add(url.pathname);
      values.add(`${url.pathname}${url.search || ""}`);
    } catch (_) {
      // Keep the original src only.
    }
    return values;
  }

  function rememberPlacedImage(src, settings) {
    if (!src || !settings) return;
    const snapshot = {
      src,
      alt: settings.alt || "",
      width: clampImageWidth(settings.width || defaultImageWidth),
      align: settings.align === "free" ? "free" : "flow",
      x: imageOffset(settings.x || 0),
      y: imageOffset(settings.y || 0),
      editorWidth: editorWidthValue(settings.editorWidth || imageEditorWidthSnapshot()),
      reserve: imageReserve(settings.reserve || 0),
      layer: imageLayer(settings.layer || defaultImageLayer)
    };
    imageSrcCandidates(src).forEach((key) => placedImages.set(key, snapshot));
  }

  function rememberedImageSettings(src) {
    for (const key of imageSrcCandidates(src)) {
      const settings = placedImages.get(key);
      if (settings) return settings;
    }
    return null;
  }

  function imageSettingsFromStyleText(style, editorWidth) {
    const widthMatch = /width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(style || "");
    const leftPxMatch = /left\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style || "");
    const topPxMatch = /top\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style || "");
    const isAbsolute = /position\s*:\s*absolute/i.test(style || "");
    return {
      width: clampImageWidth(widthMatch ? widthMatch[1] : defaultImageWidth),
      align: isAbsolute ? "free" : "flow",
      x: imageOffset(leftPxMatch ? leftPxMatch[1] : 0),
      y: imageOffset(topPxMatch ? topPxMatch[1] : 0),
      editorWidth: editorWidthValue(editorWidth),
      reserve: 0,
      layer: imageLayer(/z-index\s*:\s*(-?\d+)/i.exec(style || "")?.[1] || defaultImageLayer)
    };
  }

  function rememberPlacedImagesFromMarkdown(markdown) {
    if (stableFlowImageMode) return;
    String(markdown || "").replace(/<img\b[^>]*>/gi, (tag) => {
      const src = /\bsrc=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const alt = /\balt=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const style = /\bstyle=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const editorWidth = /\bdata-editor-width=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const reserve = /\bdata-image-reserve=(["'])(.*?)\1/i.exec(tag)?.[2] || 0;
      const layer = /\bdata-image-layer=(["'])(.*?)\1/i.exec(tag)?.[2] || defaultImageLayer;
      const settings = { ...imageSettingsFromStyleText(style, editorWidth), reserve: imageReserve(reserve), layer: imageLayer(layer) };
      if (src && (settings.align === "free" || settings.reserve || settings.layer !== defaultImageLayer)) rememberPlacedImage(src, { ...settings, alt });
      return tag;
    });
  }

  function applyRememberedImageStyles(markdown) {
    if (stableFlowImageMode) return normalizeImageMarkupForStorage(markdown);
    let next = String(markdown || "");
    next = next.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
      const settings = rememberedImageSettings(src);
      return settings && (settings.align === "free" || settings.reserve || settings.layer !== defaultImageLayer)
        ? htmlImage(src, alt, settings.width, settings.align, settings.x, settings.y, settings.reserve, settings.layer)
        : match;
    });
    next = next.replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => {
      const settings = rememberedImageSettings(src);
      if (!settings || (settings.align !== "free" && !settings.reserve && settings.layer === defaultImageLayer)) return match;
      const alt = /\balt=(["'])(.*?)\1/i.exec(match)?.[2] || settings.alt || "Blog image";
      return htmlImage(src, alt, settings.width, settings.align, settings.x, settings.y, settings.reserve, settings.layer);
    });
    return next;
  }

  function hasPlacedImages() {
    if (placedImages.size) return true;
    return Boolean(richEditorEl?.querySelector('img[style*="position: absolute"]'));
  }

  function editorScrollTargets() {
    return [
      document.scrollingElement || document.documentElement,
      richEditorEl?.querySelector(".toastui-editor-main"),
      richEditorEl?.querySelector(".toastui-editor-ww-container"),
      richEditorEl?.querySelector(".ProseMirror")
    ].filter(Boolean);
  }

  function captureImageViewport() {
    if (!hasPlacedImages()) return;
    pendingImageViewport = {
      windowX: window.scrollX,
      windowY: window.scrollY,
      targets: editorScrollTargets().map((node) => ({
        node,
        left: node.scrollLeft,
        top: node.scrollTop
      }))
    };
  }

  function restoreImageViewport() {
    const snapshot = pendingImageViewport;
    if (!snapshot) return;
    snapshot.targets.forEach(({ node, left, top }) => {
      if (!node?.isConnected && node !== document.scrollingElement && node !== document.documentElement) return;
      node.scrollLeft = left;
      node.scrollTop = top;
    });
    window.scrollTo(snapshot.windowX, snapshot.windowY);
  }

  function schedulePlacedImageRestore() {
    if (imageRestoreQueued) return;
    imageRestoreQueued = true;
    window.requestAnimationFrame(() => {
      restorePlacedImageNodes();
      restoreImageViewport();
      window.requestAnimationFrame(() => {
        restorePlacedImageNodes();
        restoreImageViewport();
        imageRestoreQueued = false;
      });
    });
  }

  function restorePlacedImageNodes() {
    richEditorEl?.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || img.src;
      const settings = rememberedImageSettings(src);
      if (!settings) return;
      applyPlacedImageSettings(img, settings);
      expandImageCanvas(img, settings.y);
      if (selectedImage?.src && imageSrcCandidates(selectedImage.src).has(src)) {
        selectedImage = { ...selectedImage, ...settings };
        selectedImageNode = img;
      }
    });
    positionImageOverlay();
  }

  function capturePlacedImageNodes() {
    richEditorEl?.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || img.src;
      const remembered = src ? rememberedImageSettings(src) : null;
      if (!src) return;
      if (remembered) {
        applyPlacedImageSettings(img, remembered);
        if (remembered.align === "free") expandImageCanvas(img, remembered.y);
        return;
      }
      const settings = imageSettingsFromNode(img);
      if (settings.align === "free" || settings.reserve || settings.layer !== defaultImageLayer) {
        rememberPlacedImage(src, {
          ...settings,
          alt: img.getAttribute("alt") || ""
        });
      }
    });
  }

  function clampImageWidth(value) {
    const width = Number.parseInt(value, 10);
    if (!Number.isFinite(width)) return defaultImageWidth;
    return Math.max(16, Math.min(100, width));
  }

  function centeredImageX(widthValue) {
    const width = clampImageWidth(widthValue);
    return Math.max(0, Math.round((100 - width) / 2));
  }

  function imageOffset(value) {
    const offset = Number.parseFloat(value);
    if (!Number.isFinite(offset)) return 0;
    return Math.max(-imageOffsetLimit, Math.min(imageOffsetLimit, Math.round(offset)));
  }

  function imageReserve(value) {
    const reserve = Number.parseFloat(value);
    if (!Number.isFinite(reserve)) return 0;
    return Math.max(0, Math.min(imageOffsetLimit, Math.round(reserve)));
  }

  function imageLayer(value) {
    const layer = Number.parseInt(value, 10);
    if (!Number.isFinite(layer)) return defaultImageLayer;
    return Math.max(1, Math.min(99, layer));
  }

  function editorWidthValue(value) {
    const width = Number.parseFloat(value);
    if (!Number.isFinite(width) || width <= 0) return 0;
    return Math.max(240, Math.min(2400, Math.round(width)));
  }

  function imageAbsolutePositionFromNode(img) {
    const editorRect = imageContainerRect(img);
    const imgRect = img?.getBoundingClientRect?.();
    if (!editorRect || !imgRect) return { x: 0, y: 0 };
    return {
      x: imageOffset(imgRect.left - editorRect.left),
      y: imageOffset(imgRect.top - editorRect.top)
    };
  }

  function imageStyle(widthValue, align = "free", xValue, yValue = 0, reserveValue = 0, layerValue = defaultImageLayer) {
    const width = align === "full" ? 100 : clampImageWidth(widthValue);
    const base = `width: ${width}%; max-width: 100%; height: auto;`;
    const x = align === "full" ? 0 : imageOffset(xValue);
    const y = imageOffset(yValue);
    const reserve = imageReserve(reserveValue);
    const layer = imageLayer(layerValue);
    if (align === "full" || align === "flow") {
      return `${base} display: block; position: relative; float: none; margin: 1em auto; margin-bottom: calc(1em + ${reserve}px); transform: none; z-index: ${layer};`;
    }
    return `${base} display: block; position: absolute; left: ${x}px; top: ${y}px; float: none; margin: 0; transform: none; z-index: ${layer};`;
  }

  function applyPlacedImageSettings(img, settings) {
    if (!img || !settings) return;
    const spacerData = layoutSpacerFromSrc(img.getAttribute("src") || img.src);
    if (spacerData) {
      img.setAttribute("style", `width: 100%; max-width: 100%; height: ${spacerData.height}px; display: block; position: relative; margin: 0; opacity: 0.12; z-index: 1;`);
      img.setAttribute("data-image-reserve", String(spacerData.height));
      img.setAttribute("data-image-layer", "1");
      img.classList.add("writer-layout-spacer-image");
      return;
    }
    img.setAttribute("style", imageStyle(settings.width, settings.align, settings.x, settings.y, settings.reserve, settings.layer));
    img.setAttribute("data-editor-width", String(settings.editorWidth || imageEditorWidthSnapshot()));
    img.setAttribute("data-image-reserve", String(imageReserve(settings.reserve || 0)));
    img.setAttribute("data-image-layer", String(imageLayer(settings.layer || defaultImageLayer)));
    img.classList.remove("writer-layout-spacer-image");
    applyImageReservation(img, settings);
  }

  function htmlImage(src, alt, widthValue, align, xValue, yValue, reserveValue = 0, layerValue = defaultImageLayer) {
    const reserve = imageReserve(reserveValue);
    const layer = imageLayer(layerValue);
    const widthAttr = ` data-editor-width="${imageEditorWidthSnapshot()}" data-image-reserve="${reserve}" data-image-layer="${layer}"`;
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || "Blog image")}"${widthAttr} style="${escapeAttr(imageStyle(widthValue, align, xValue, yValue, reserve, layer))}">`;
  }

  function imageSettingsFromNode(img) {
    const src = img?.getAttribute("src") || img?.src || "";
    const remembered = src ? rememberedImageSettings(src) : null;
    if (remembered) return { ...remembered };
    const style = img?.getAttribute("style") || "";
    const storedEditorWidth = editorWidthValue(img?.getAttribute("data-editor-width") || "");
    const reserve = imageReserve(img?.getAttribute("data-image-reserve") || 0);
    const storedLayer = imageLayer(img?.getAttribute("data-image-layer") || defaultImageLayer);
    const widthMatch = /width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(style);
    const width = clampImageWidth(widthMatch ? widthMatch[1] : defaultImageWidth);
    const isAbsolute = /position\s*:\s*absolute/i.test(style);
    const leftPxMatch = /left\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
    const topPxMatch = /top\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
    const translateMatch = /translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
    const leftMatch = /left\s*:\s*(-?\d+(?:\.\d+)?)%/i.exec(style);
    const marginLeftMatch = /margin-left\s*:\s*(\d+(?:\.\d+)?)%/i.exec(style);
    const editorWidth = imageEditorRect()?.width || 0;
    const legacyPercent = leftMatch
      ? Number.parseFloat(leftMatch[1])
      : marginLeftMatch
        ? Number.parseFloat(marginLeftMatch[1])
        : Number.NaN;
    const rectPosition = imageAbsolutePositionFromNode(img);
    const x = isAbsolute && leftPxMatch
      ? imageOffset(leftPxMatch[1])
      : translateMatch
        ? rectPosition.x
        : Number.isFinite(legacyPercent) && editorWidth
          ? imageOffset(((legacyPercent - centeredImageX(width)) / 100) * editorWidth)
          : /float\s*:\s*left/i.test(style) && editorWidth
            ? imageOffset((-centeredImageX(width) / 100) * editorWidth)
            : /float\s*:\s*right/i.test(style) && editorWidth
              ? imageOffset(((100 - width - centeredImageX(width)) / 100) * editorWidth)
              : rectPosition.x;
    const topMatch = /top\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
    const y = isAbsolute && topPxMatch
      ? imageOffset(topPxMatch[1])
      : translateMatch
        ? rectPosition.y
        : topMatch
          ? imageOffset(topMatch[1])
          : rectPosition.y;
    const hasLegacyPlacement = Boolean(translateMatch || leftMatch || marginLeftMatch || /float\s*:\s*(left|right)/i.test(style));
    const align = width >= 100 ? "full" : isAbsolute || hasLegacyPlacement ? "free" : "flow";
    const styleLayer = imageLayer(/z-index\s*:\s*(-?\d+)/i.exec(style)?.[1] || storedLayer);
    return { width, align, x, y, editorWidth: storedEditorWidth || imageEditorWidthSnapshot(), reserve, layer: styleLayer };
  }

  function imageEditorRect() {
    const node = selectedImageNode?.closest?.(".ProseMirror")
      || richEditorEl?.querySelector(".toastui-editor-ww-container .ProseMirror")
      || richEditorEl?.querySelector(".ProseMirror");
    return node?.getBoundingClientRect?.() || richEditorEl?.getBoundingClientRect?.() || null;
  }

  function imageEditorWidthSnapshot() {
    return editorWidthValue(imageEditorRect()?.width || imageContainerRect(selectedImageNode)?.width || 920) || 920;
  }

  function imageContainerRect(img) {
    const node = img?.closest?.(".ProseMirror")
      || selectedImageNode?.closest?.(".ProseMirror")
      || richEditorEl?.querySelector(".toastui-editor-ww-container .ProseMirror")
      || richEditorEl?.querySelector(".ProseMirror");
    return node?.getBoundingClientRect?.() || richEditorEl?.getBoundingClientRect?.() || null;
  }

  function imageAnchorBlock(img) {
    return img?.closest?.("p, li, blockquote, figure, div") || img?.parentElement || null;
  }

  function applyImageReservation(img, settings) {
    const block = imageAnchorBlock(img);
    if (!block || block.classList?.contains("ProseMirror")) return;
    const reserve = imageReserve(settings?.reserve || 0);
    if (settings?.align === "free" && reserve > 0) {
      block.style.minHeight = `${reserve}px`;
      block.dataset.imageReserveOwner = img.getAttribute("src") || "image";
      block.classList.add("writer-image-reservation");
      return;
    }
    if (block.dataset.imageReserveOwner === (img.getAttribute("src") || "image")) {
      block.style.removeProperty("min-height");
      block.removeAttribute("data-image-reserve-owner");
      block.classList.remove("writer-image-reservation");
    }
  }

  function imageWidthFromRect(img) {
    const editorRect = imageEditorRect();
    const imgRect = img?.getBoundingClientRect?.();
    if (!editorRect || !imgRect || !editorRect.width) return selectedImage?.width || defaultImageWidth;
    return clampImageWidth(Math.round((imgRect.width / editorRect.width) * 100));
  }

  function expandImageCanvas(img, yValue) {
    const editor = img?.closest?.(".ProseMirror") || richEditorEl?.querySelector(".ProseMirror");
    if (!editor) return;
    const imgRect = img.getBoundingClientRect?.();
    const minHeight = imageOffset(yValue) + (imgRect?.height || 0) + 140;
    if (minHeight > editor.offsetHeight) {
      editor.style.minHeight = `${Math.ceil(minHeight)}px`;
    }
  }

  function calibratePlacedImageNode(img, settings) {
    const editorRect = imageContainerRect(img);
    const imgRect = img?.getBoundingClientRect?.();
    if (!editorRect || !imgRect || settings?.align !== "free") return;
    const driftX = imageOffset(settings.x) - imageOffset(imgRect.left - editorRect.left);
    const driftY = imageOffset(settings.y) - imageOffset(imgRect.top - editorRect.top);
    if (Math.abs(driftX) <= 1 && Math.abs(driftY) <= 1) return;
    img.setAttribute(
      "style",
      imageStyle(settings.width, "free", imageOffset(settings.x + driftX), imageOffset(settings.y + driftY), settings.reserve, settings.layer)
    );
  }

  function ensureImageOverlay() {
    if (imageOverlay) return imageOverlay;
    imageOverlay = document.createElement("div");
    imageOverlay.className = "image-drag-overlay";
    if (stableFlowImageMode) {
      imageOverlay.innerHTML = '<div class="image-drag-outline"></div>';
      document.body.appendChild(imageOverlay);
      return imageOverlay;
    }
    imageOverlay.innerHTML = [
      '<div class="image-drag-outline"></div>',
      '<div class="image-drag-label"></div>',
      '<div class="image-layout-actions" role="toolbar" aria-label="Image layout">',
      '<button type="button" data-image-action="back" title="Send backward" aria-label="Send image backward">↓</button>',
      '<button type="button" data-image-action="front" title="Bring forward" aria-label="Bring image forward">↑</button>',
      '<button type="button" data-image-action="clear-reserve" title="Remove text space" aria-label="Remove text space">⌫</button>',
      '<button type="button" data-image-action="reanchor" title="Move to another text position" aria-label="Move image to another text position">↪</button>',
      '</div>',
      '<div class="image-text-line" aria-hidden="true"><span></span><button type="button" aria-label="Adjust text start line" title="Drag to adjust where text continues"></button></div>',
      '<button class="image-drag-handle is-nw" type="button" data-resize-edge="left" aria-label="Resize image from left"></button>',
      '<button class="image-drag-handle is-ne" type="button" data-resize-edge="right" aria-label="Resize image from right"></button>',
      '<button class="image-drag-handle is-se" type="button" data-resize-edge="right" aria-label="Resize image"></button>'
    ].join("");
    document.body.appendChild(imageOverlay);
    imageOverlay.querySelectorAll(".image-drag-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", startImageResize);
      handle.addEventListener("mousedown", startImageResize);
    });
    imageOverlay.querySelector(".image-text-line button")?.addEventListener("pointerdown", startImageReserve);
    imageOverlay.querySelector(".image-text-line button")?.addEventListener("mousedown", startImageReserve);
    imageOverlay.querySelector(".image-layout-actions")?.addEventListener("click", handleImageLayoutAction);
    return imageOverlay;
  }

  function overlayLabel() {
    return ensureImageOverlay().querySelector(".image-drag-label");
  }

  function setOverlayLabel(width, align, x, y = 0, reserve = 0, layer = defaultImageLayer) {
    const label = overlayLabel();
    const nextWidth = clampImageWidth(width);
    const nextX = align === "full" ? 0 : imageOffset(x);
    if (label) {
      label.textContent = align === "flow"
        ? `${nextWidth}% · in text · layer ${imageLayer(layer)}${imageReserve(reserve) ? ` · space ${imageReserve(reserve)}px` : ""}`
        : `${nextWidth}% · x ${nextX}px · y ${imageOffset(y)}px · layer ${imageLayer(layer)}${imageReserve(reserve) ? ` · space ${imageReserve(reserve)}px` : ""}`;
    }
  }

  function positionImageOverlay() {
    const overlay = ensureImageOverlay();
    if (selectedImage?.src) {
      const freshNode = findSelectedImageNode();
      if (freshNode) selectedImageNode = freshNode;
    }
    if (!selectedImageNode || !document.body.contains(selectedImageNode)) {
      overlay.classList.remove("is-active");
      return;
    }
    const rect = selectedImageNode.getBoundingClientRect();
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.classList.add("is-active");
    if (stableFlowImageMode) return;
    const width = selectedImage?.width || imageWidthFromRect(selectedImageNode);
    const reserve = imageReserve(selectedImage?.reserve || 0);
    const layer = imageLayer(selectedImage?.layer || defaultImageLayer);
    setOverlayLabel(width, selectedImage?.align || "free", selectedImage?.x ?? 0, selectedImage?.y ?? 0, reserve, layer);
    const editorRect = imageContainerRect(selectedImageNode);
    const anchorRect = imageAnchorBlock(selectedImageNode)?.getBoundingClientRect?.();
    const line = overlay.querySelector(".image-text-line");
    if (line && editorRect) {
      const baseline = selectedImage?.align === "free" && reserve > 0 && anchorRect
        ? anchorRect.top + reserve
        : rect.bottom + (selectedImage?.align === "flow" ? reserve : 0);
      line.style.left = `${editorRect.left}px`;
      line.style.top = `${baseline}px`;
      line.style.width = `${editorRect.width}px`;
    }
  }

  function findSelectedImageNode() {
    if (!selectedImage?.src) return null;
    const candidates = imageSrcCandidates(selectedImage.src);
    return Array.from(richEditorEl?.querySelectorAll("img") || []).find((item) => {
      const src = item.getAttribute("src") || "";
      if (!src) return false;
      try {
        if (!(candidates.has(src) || candidates.has(new URL(src, window.location.href).pathname))) return false;
      } catch (_) {
        if (!candidates.has(src)) return false;
      }
      const rect = item.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }) || null;
  }

  function replaceSelectedImage(widthValue, alignValue, xValue, yValue, reserveValue, layerValue) {
    if (!selectedImage?.src) {
      setStatus(saveStatus, "Click an image first.");
      return false;
    }
    const align = alignValue || selectedImage.align || "free";
    const width = align === "full" ? 100 : clampImageWidth(widthValue || selectedImage.width || defaultImageWidth);
    const x = align === "full" ? 0 : imageOffset(xValue ?? selectedImage.x ?? 0);
    const y = imageOffset(yValue ?? selectedImage.y ?? 0);
    const reserve = imageReserve(reserveValue ?? selectedImage.reserve ?? 0);
    const layer = imageLayer(layerValue ?? selectedImage.layer ?? defaultImageLayer);
    const editorWidth = align === "free" ? imageEditorWidthSnapshot() : 0;
    const srcs = imageSrcCandidates(selectedImage.src);
    const markdown = getMarkdown();
    let changed = false;

    const next = markdown
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
        if (changed || !srcs.has(src)) return match;
        changed = true;
        return imageMarkupForStorage(src, alt, width, align, x, y, reserve, layer);
      })
      .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => {
        if (changed || !srcs.has(src)) return match;
        const alt = /alt=(["'])(.*?)\1/i.exec(match)?.[2] || selectedImage.alt || "Blog image";
        changed = true;
        return imageMarkupForStorage(src, alt, width, align, x, y, reserve, layer);
      });

    if (!changed) {
      setStatus(saveStatus, "Could not find that image in Markdown.");
      return false;
    }
    selectedImage = { ...selectedImage, width, align, x, y, editorWidth, reserve, layer };
    rememberPlacedImage(selectedImage.src, selectedImage);
    if (richEditor) {
      fields.markdown.value = next;
      lastKnownMarkdown = next;
      window.setTimeout(schedulePlacedImageRestore, 0);
      window.setTimeout(restorePlacedImageNodes, 80);
    } else {
      setMarkdown(next);
    }
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
    renderPreview();
    setStatus(saveStatus, `Image ${width}% · ${align === "flow" ? "in text" : `x ${x}px · y ${y}px`} · layer ${layer}${reserve ? ` · space ${reserve}px` : ""}`);
    window.setTimeout(refreshSelectedImage, 160);
    return true;
  }

  function deleteSelectedImage() {
    if (!selectedImage?.src) return false;
    const srcs = imageSrcCandidates(selectedImage.src);
    const markdown = getMarkdown();
    let changed = false;
    const next = markdown
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
        if (changed || !srcs.has(src)) return match;
        changed = true;
        return "";
      })
      .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => {
        if (changed || !srcs.has(src)) return match;
        changed = true;
        return "";
      });

    if (!changed) {
      setStatus(saveStatus, "Could not find that image in Markdown.");
      return false;
    }

    imageSrcCandidates(selectedImage.src).forEach((key) => placedImages.delete(key));
    selectedImage = null;
    selectedImageNode = null;
    imageOverlay?.classList.remove("is-active");
    setMarkdown(next);
    saveLocalDraft({ quiet: true });
    scheduleAutosave();
    renderPreview();
    setStatus(saveStatus, "Image deleted");
    return true;
  }

  function refreshSelectedImage() {
    disableNativeImageDrag();
    richEditorEl?.querySelectorAll("img").forEach((img) => img.classList.remove("is-selected-writer-image"));
    if (!selectedImage?.src) {
      selectedImageNode = null;
      imageOverlay?.classList.remove("is-active");
      return;
    }
    const img = findSelectedImageNode();
    if (img) {
      if (stableFlowImageMode) {
        img.classList.add("is-selected-writer-image");
        selectedImageNode = img;
        positionImageOverlay();
        return;
      }
      selectedImage = { ...selectedImage, ...imageSettingsFromNode(img) };
      applyPlacedImageSettings(img, selectedImage);
      if (selectedImage.align === "free") expandImageCanvas(img, selectedImage.y);
      img.classList.add("is-selected-writer-image");
      selectedImageNode = img;
      positionImageOverlay();
    } else {
      selectedImageNode = null;
      imageOverlay?.classList.remove("is-active");
    }
  }

  richEditorEl?.addEventListener("click", (event) => {
    const spacerImage = event.target?.closest?.("img");
    const spacerImageData = spacerImage ? layoutSpacerFromSrc(spacerImage.getAttribute("src") || spacerImage.src) : null;
    const spacer = event.target?.closest?.("[data-writer-spacer]");
    richEditorEl.querySelectorAll(".is-selected-writer-spacer").forEach((node) => node.classList.remove("is-selected-writer-spacer"));
    if (spacer || spacerImageData) {
      selectedLayoutSpacerId = spacer?.getAttribute("data-writer-spacer") || spacerImageData?.id || "";
      (spacer || spacerImage)?.classList.add("is-selected-writer-spacer");
      selectedImage = null;
      refreshSelectedImage();
      setStatus(saveStatus, "Layout spacer selected. Press Command/Ctrl + Backspace to remove it.");
      return;
    }
    selectedLayoutSpacerId = "";
    const img = event.target?.closest?.("img");
    if (!img) {
      selectedImage = null;
      refreshSelectedImage();
      return;
    }
    selectedImage = {
      src: img.getAttribute("src") || img.src,
      alt: img.getAttribute("alt") || "",
      ...imageSettingsFromNode(img)
    };
    refreshSelectedImage();
    setStatus(
      saveStatus,
      stableFlowImageMode
        ? "Image selected. Press Command/Ctrl + Backspace to remove it."
        : "Image selected. Drag freely in any direction, drag corner to resize."
    );
  });

  function disableNativeImageDrag() {
    richEditorEl?.querySelectorAll("img").forEach((img) => {
      img.setAttribute("draggable", "false");
      img.draggable = false;
    });
  }

  richEditorEl?.addEventListener("dragstart", (event) => {
    if (event.target?.closest?.("img")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function selectImageBySrc(src) {
    selectedImage = {
      src,
      alt: "",
      width: defaultImageWidth,
      align: "flow",
      x: 0,
      y: 0,
      reserve: 0,
      layer: defaultImageLayer
    };
    refreshSelectedImage();
    setStatus(
      saveStatus,
      stableFlowImageMode
        ? "Image inserted in the text flow. Press Command/Ctrl + Backspace to remove it."
        : `Image inserted ${defaultImageWidth}% · centered. Drag image to place it freely.`
    );
  }

  function applyLiveImagePreview(width, align, x, y, reserveValue, layerValue) {
    if (!selectedImageNode) return;
    const nextWidth = clampImageWidth(width);
    const nextX = align === "full" ? 0 : imageOffset(x ?? selectedImage?.x ?? 0);
    const nextY = imageOffset(y ?? selectedImage?.y ?? 0);
    const reserve = imageReserve(reserveValue ?? selectedImage?.reserve ?? 0);
    const layer = imageLayer(layerValue ?? selectedImage?.layer ?? defaultImageLayer);
    selectedImageNode.setAttribute("style", imageStyle(nextWidth, align, nextX, nextY, reserve, layer));
    selectedImageNode.setAttribute("data-image-reserve", String(reserve));
    selectedImageNode.setAttribute("data-image-layer", String(layer));
    selectedImage = { ...selectedImage, width: nextWidth, align, x: nextX, y: nextY, reserve, layer, editorWidth: align === "free" ? imageEditorWidthSnapshot() : 0 };
    applyImageReservation(selectedImageNode, selectedImage);
    expandImageCanvas(selectedImageNode, nextY);
    setOverlayLabel(nextWidth, align, nextX, nextY, reserve, layer);
    positionImageOverlay();
  }

  function startImageMove(event) {
    if (stableFlowImageMode) return;
    if (workbench.hidden || event.button !== 0) return;
    if (event.type === "mousedown" && window.PointerEvent) return;
    const img = event.target?.closest?.("img");
    if (!img || !richEditorEl?.contains(img)) return;
    event.preventDefault();
    event.stopPropagation();
    img.setAttribute("draggable", "false");
    img.draggable = false;
    selectedImage = {
      src: img.getAttribute("src") || img.src,
      alt: img.getAttribute("alt") || "",
      ...imageSettingsFromNode(img)
    };
    selectedImageNode = img;
    refreshSelectedImage();
    if (selectedImage.align !== "free") {
      setStatus(saveStatus, "This image is anchored in text. Use ↪ to move its text position, or choose Place freely.");
      return;
    }
    imageDrag = {
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      width: selectedImage.width,
      align: selectedImage.align,
      originX: selectedImage.x ?? 0,
      originY: selectedImage.y ?? 0,
      x: selectedImage.x ?? 0,
      y: selectedImage.y ?? 0,
      reserve: selectedImage.reserve ?? 0,
      layer: selectedImage.layer ?? defaultImageLayer
    };
    img.setPointerCapture?.(event.pointerId);
    setStatus(saveStatus, "Drag freely in any direction; release to save.");
  }

  function startImageResize(event) {
    if (!selectedImageNode) return;
    if (event.type === "mousedown" && window.PointerEvent) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = selectedImageNode.getBoundingClientRect();
    imageDrag = {
      mode: "resize",
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      startWidthPx: rect.width,
      editorWidth: imageEditorRect()?.width || rect.width,
      width: selectedImage?.width || imageWidthFromRect(selectedImageNode),
      align: selectedImage?.align || "flow",
      originX: selectedImage?.x ?? 0,
      originY: selectedImage?.y ?? 0,
      x: selectedImage?.x ?? 0,
      y: selectedImage?.y ?? 0,
      reserve: selectedImage?.reserve ?? 0,
      layer: selectedImage?.layer ?? defaultImageLayer,
      direction: event.currentTarget?.dataset?.resizeEdge === "left" ? -1 : 1
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setStatus(saveStatus, "Resize image; release to save.");
  }

  function startImageReserve(event) {
    if (!selectedImageNode) return;
    if (event.type === "mousedown" && window.PointerEvent) return;
    event.preventDefault();
    event.stopPropagation();
    const imgRect = selectedImageNode.getBoundingClientRect();
    const anchorRect = imageAnchorBlock(selectedImageNode)?.getBoundingClientRect?.();
    const currentReserve = imageReserve(selectedImage?.reserve || 0);
    const reserve = selectedImage?.align === "free" && currentReserve === 0 && anchorRect
      ? imageReserve(imgRect.bottom - anchorRect.top)
      : currentReserve;
    imageDrag = {
      mode: "reserve",
      startX: event.clientX,
      startY: event.clientY,
      started: true,
      width: selectedImage?.width || imageWidthFromRect(selectedImageNode),
      align: selectedImage?.align || "flow",
      originX: selectedImage?.x ?? 0,
      originY: selectedImage?.y ?? 0,
      x: selectedImage?.x ?? 0,
      y: selectedImage?.y ?? 0,
      originReserve: reserve,
      reserve,
      layer: selectedImage?.layer ?? defaultImageLayer
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setStatus(saveStatus, "Drag the text line down to keep more space; drag up to reduce it.");
  }

  function handleImageLayoutAction(event) {
    const action = event.target?.closest?.("button")?.dataset?.imageAction;
    if (!action || !selectedImage?.src) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "clear-reserve") {
      replaceSelectedImage(selectedImage.width, selectedImage.align, selectedImage.x, selectedImage.y, 0, selectedImage.layer);
      return;
    }
    if (action === "reanchor") {
      pendingImagePlacement = {
        kind: "relocate",
        source: { ...selectedImage },
        occupiedHeight: selectedImageOccupiedHeight()
      };
      ensureImagePlacementChooser().hidden = false;
      setStatus(saveStatus, "Click the new text position, then choose Insert in text or Place freely.");
      return;
    }
    const delta = action === "front" ? 1 : action === "back" ? -1 : 0;
    if (!delta) return;
    replaceSelectedImage(
      selectedImage.width,
      selectedImage.align,
      selectedImage.x,
      selectedImage.y,
      selectedImage.reserve,
      imageLayer((selectedImage.layer || defaultImageLayer) + delta)
    );
  }

  function handleImageDragMove(event) {
    if (!imageDrag || !selectedImageNode) return;
    const rawDeltaX = event.clientX - imageDrag.startX;
    const rawDeltaY = event.clientY - imageDrag.startY;
    if (!imageDrag.started && Math.hypot(rawDeltaX, rawDeltaY) < imageDragThreshold) return;
    imageDrag.started = true;
    if (imageDrag.mode === "move") {
      const x = imageOffset((imageDrag.originX || 0) + rawDeltaX * imageMoveSensitivity);
      const y = imageOffset((imageDrag.originY || 0) + rawDeltaY * imageMoveSensitivity);
      imageDrag.x = x;
      imageDrag.y = y;
      imageDrag.align = "free";
      applyLiveImagePreview(imageDrag.width, "free", x, y, imageDrag.reserve, imageDrag.layer);
      return;
    }
    if (imageDrag.mode === "reserve") {
      const reserve = imageReserve((imageDrag.originReserve || 0) + rawDeltaY);
      imageDrag.reserve = reserve;
      applyLiveImagePreview(imageDrag.width, imageDrag.align, imageDrag.x, imageDrag.y, reserve, imageDrag.layer);
      return;
    }
    if (imageDrag.mode === "resize") {
      const deltaPct = ((rawDeltaX * imageResizeSensitivity) / imageDrag.editorWidth) * 100;
      const startWidthPct = (imageDrag.startWidthPx / imageDrag.editorWidth) * 100;
      const width = clampImageWidth(Math.round(startWidthPct + deltaPct * (imageDrag.direction || 1)));
      const deltaPx = rawDeltaX * imageResizeSensitivity;
      const x = imageDrag.direction === -1
        ? imageOffset((imageDrag.originX || 0) + deltaPx)
        : imageOffset(imageDrag.originX || 0);
      imageDrag.width = width;
      imageDrag.x = x;
      applyLiveImagePreview(width, imageDrag.align, x, imageDrag.y, imageDrag.reserve, imageDrag.layer);
    }
  }

  function finishImageDrag() {
    if (!imageDrag) return;
    if (!imageDrag.started) {
      imageDrag = null;
      return;
    }
    const { width, align, x, y, reserve, layer } = imageDrag;
    imageDrag = null;
    replaceSelectedImage(width, align, x, y, reserve, layer);
  }

  richEditorEl?.addEventListener("pointerdown", startImageMove);
  richEditorEl?.addEventListener("mousedown", startImageMove);
  window.addEventListener("pointermove", handleImageDragMove);
  window.addEventListener("mousemove", handleImageDragMove);
  window.addEventListener("pointerup", finishImageDrag);
  window.addEventListener("mouseup", finishImageDrag);
  window.addEventListener("scroll", positionImageOverlay, true);
  window.addEventListener("resize", positionImageOverlay);
  window.addEventListener("resize", scheduleHtmlVisualEditorResize);

  document.querySelector("[data-upload-image]")?.addEventListener("click", () => {
    uploadAttachment(fields.image.files && fields.image.files[0]);
  });

  fields.image.addEventListener("change", () => {
    uploadAttachment(fields.image.files && fields.image.files[0]);
  });

  dropZone?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    document.body.classList.add("is-dragging");
  });

  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  dropZone?.addEventListener("dragleave", () => {
    document.body.classList.remove("is-dragging");
  });

  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    document.body.classList.remove("is-dragging");
    const file = Array.from(event.dataTransfer?.files || []).find(isUploadLike);
    if (file) uploadAttachment(file);
  });

  richEditorEl?.addEventListener("paste", handlePastedImage, true);
  richEditorEl?.addEventListener("click", (event) => {
    const href = annotationHrefFromNode(event.target);
    if (!href) return;
    event.preventDefault();
    const link = event.target.closest("a[href]");
    openAnnotationDialog({
      range: document.createRange(),
      text: (link?.textContent || "").trim(),
      oldHref: href
    });
  }, true);
  document.addEventListener("paste", handlePastedImage, true);

  annotationForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(annotationForm);
    const payload = {
      type: String(values.get("type") || "note"),
      title: String(values.get("title") || "").trim(),
      body: String(values.get("body") || "").trim(),
      label: String(values.get("label") || "").trim(),
      url: String(values.get("url") || "").trim(),
      origin: pendingAnnotationOrigin
    };
    if (!payload.body) {
      annotationForm.elements.body.focus();
      return;
    }
    applyAnnotation(payload);
    annotationDialog.close();
  });

  annotationBody?.addEventListener("input", resizeAnnotationBody);

  annotationCancelButton?.addEventListener("click", () => {
    pendingAnnotation = null;
    annotationDialog.close();
    focusEditor();
  });

  annotationRemoveButton?.addEventListener("click", removeAnnotation);

  annotationDialog?.addEventListener("close", () => {
    pendingAnnotation = null;
    pendingAnnotationOrigin = "author";
  });

  function trackImageLayoutMutation(event) {
    if (stableFlowImageMode) return;
    if (!richEditorEl?.contains(event.target) || imageDrag) return;
    if (!hasPlacedImages()) return;
    captureImageViewport();
    window.setTimeout(schedulePlacedImageRestore, 0);
    window.setTimeout(schedulePlacedImageRestore, 90);
  }

  richEditorEl?.addEventListener("beforeinput", trackImageLayoutMutation, true);
  richEditorEl?.addEventListener("keydown", (event) => {
    if (["Enter", "Backspace", "Delete"].includes(event.key)) {
      trackImageLayoutMutation(event);
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === "Backspace" && selectedLayoutSpacerId) {
      event.preventDefault();
      event.stopPropagation();
      const escapedId = selectedLayoutSpacerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`<div\\b[^>]*data-writer-spacer=(["'])${escapedId}\\1[^>]*>\\s*</div>`, "i");
      const next = getMarkdown().replace(pattern, "");
      selectedLayoutSpacerId = "";
      setMarkdown(next);
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
      renderPreview();
      setStatus(saveStatus, "Layout spacer removed.");
      return;
    }
    if (mod && event.key === "Backspace" && selectedImage?.src) {
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedImage();
      return;
    }
    if (!mod) return;
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!workbench.hidden) saveDraft();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!workbench.hidden) publishPost();
    }
  }, true);

  window.addEventListener("pagehide", () => {
    if (!workbench.hidden && !suppressLocalDraftSave) saveLocalDraft({ quiet: true });
    releaseDraftLease();
  });

  window.addEventListener("beforeunload", () => {
    if (!workbench.hidden && !suppressLocalDraftSave) saveLocalDraft({ quiet: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!workbench.hidden && !suppressLocalDraftSave && document.visibilityState === "hidden") {
      saveLocalDraft({ quiet: true });
    }
  });

  api("/api/admin/session")
    .then((result) => {
      csrfToken = result.csrfToken || "";
      showWorkbench();
    })
    .catch(showLogin);

  window.MICHEL_WRITER_DEBUG = {
    version: writerVersion,
    getMarkdown,
    inspectMarkdownState() {
      let richMarkdown = "";
      try {
        richMarkdown = String(richEditor?.getMarkdown?.() || "");
      } catch (_) {
        richMarkdown = "";
      }
      const root = editorContentRoot();
      return {
        richMarkdownLength: richMarkdown.length,
        textareaMarkdownLength: fields.markdown.value.length,
        lastKnownMarkdownLength: lastKnownMarkdown.length,
        safeMarkdownLength: getMarkdown().length,
        hasRenderedContent: editorHasRenderedContent(),
        renderedTextLength: root ? root.textContent.trim().length : 0
      };
    },
    setMarkdown(value) {
      setMarkdown(value);
      saveLocalDraft();
      renderPreview();
    },
    deleteSelectedImage,
    renderEditorMath,
    inspectMathState() {
      const root = editorContentRoot();
      const textNodes = [];
      if (root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) textNodes.push(walker.currentNode.nodeValue);
      }
      const markdown = getMarkdown();
      return {
        rootClass: root?.className || "",
        textNodes,
        hasMath: markdownHasMath(markdown),
        overlayCount: mathOverlayLayer ? mathOverlayLayer.querySelectorAll(".writer-math-overlay").length : 0,
        inlineOverlayCount: mathOverlayLayer ? mathOverlayLayer.querySelectorAll(".writer-math-inline-overlay").length : 0,
        blockOverlayCount: mathOverlayLayer ? mathOverlayLayer.querySelectorAll(".writer-math-block-overlay").length : 0,
        katexCount: root ? root.querySelectorAll(".katex").length : 0,
        previewKatexCount: fields.preview ? fields.preview.querySelectorAll(".katex").length : 0,
        previewOpen: workbench.classList.contains("is-preview-open")
      };
    },
    isImageLike,
    normalizeUploadFile
  };
})();
