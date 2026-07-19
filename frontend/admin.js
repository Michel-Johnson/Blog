(function () {
  const loginPanel = document.querySelector("[data-login-panel]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const workbench = document.querySelector("[data-workbench]");
  const logoutButton = document.querySelector("[data-logout]");
  const saveStatus = document.querySelector("[data-save-status]");
  const dropZone = document.querySelector("[data-drop-zone]");
  const richEditorEl = document.querySelector("[data-rich-editor]");
  const undoButton = document.querySelector("[data-undo]");
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
  const newDraftButton = document.querySelector("[data-new-draft]");
  const refreshDraftsButton = document.querySelector("[data-refresh-drafts]");
  const draftListEl = document.querySelector("[data-draft-list]");
  const excerptModeEl = document.querySelector("[data-excerpt-mode]");
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
  let csrfToken = "";
  let richEditor = null;
  let syncingEditor = false;
  let selectedImage = null;
  let selectedImageNode = null;
  let imageOverlay = null;
  let imageDrag = null;
  let activeDraftId = "";
  let activeDraftSlug = editSlug || "";
  let autosaveTimer = null;
  let editorMathTimer = null;
  let mathOverlayLayer = null;
  let mathOverlayHitboxes = [];
  let activeMathEditUntil = 0;
  let suppressMathEditPointerUntil = 0;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let deleteInProgress = false;
  let activePostStatus = "draft";
  let lastSavedSignature = "";
  let draftList = [];
  let activeOriginalSlug = "";
  let activeLegacySource = "";
  let activeImportedFromLegacy = false;
  let activeSourceMarkdownPath = "";
  let activeImportedFromMarkdown = false;
  let excerptMode = "auto";
  let pendingAnnotation = null;
  let lastEditorSelection = null;
  let lastKnownMarkdown = "";
  const placedImages = new Map();
  const draftKey = "michel-sketch-admin-draft";
  const draftSessionKey = `${draftKey}:session`;
  const draftActiveKey = `${draftKey}:active`;
  const publishedBackupKey = `${draftKey}:last-published`;
  const writerVersion = "article-parity-v58-20260712";
  const defaultImageWidth = 42;
  const imageMoveSensitivity = 1;
  const imageResizeSensitivity = 0.75;
  const imageDragThreshold = 2;
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

  function setExcerptMode(mode) {
    excerptMode = mode === "manual" ? "manual" : "auto";
    if (excerptModeEl) excerptModeEl.textContent = excerptMode === "manual" ? "Your summary" : "GLM auto summary";
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
    const settings = imageSettingsFromStyleText(style, editorWidth);
    if (settings.align === "free") rememberPlacedImage(src, { ...settings, alt });
    return markdownImage(src, alt);
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

  function markdownForRichEditor(markdown) {
    const normalized = String(markdown || "").replace(/<img\b[^>]*>/gi, (tag) => htmlImageTagToMarkdown(tag));
    return preserveVisualIndentation(collapseAdjacentDuplicateImages(normalized));
  }

  function preserveVisualIndentation(markdown) {
    let fenced = false;
    return String(markdown || "").split("\n").map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      let next = line;
      if (/^ {1,3}\S/.test(next) && !/^ {1,3}(?:[-+*]\s|\d+[.)]\s|#{1,6}\s|>|\||<)/.test(next)) {
        next = next.replace(/^ {1,3}/, (spaces) => `&#8288;${"&nbsp;".repeat(spaces.length)}`);
      }
      return next.replace(/(?<=\S) {2,}(?=\S)/g, (spaces) => "&nbsp;".repeat(spaces.length));
    }).join("\n");
  }

  function imageMarkupForStorage(src, alt, widthValue, align, xValue, yValue) {
    if (align === "flow") return markdownImage(src, alt || "image");
    return htmlImage(src, alt, widthValue, align, xValue, yValue);
  }

  function imageHtmlTagForStorage(tag) {
    const src = /\bsrc=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    if (!src) return tag;
    const alt = /\balt=(["'])(.*?)\1/i.exec(tag)?.[2] || "image";
    const style = /\bstyle=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const editorWidth = /\bdata-editor-width=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
    const settings = imageSettingsFromStyleText(style, editorWidth);
    if (settings.align === "free") {
      rememberPlacedImage(src, { ...settings, alt });
      return htmlImage(src, alt, settings.width, "free", settings.x, settings.y);
    }
    return markdownImage(src, alt);
  }

  function normalizeImageMarkupForStorage(markdown) {
    const normalized = String(markdown || "").replace(/<img\b[^>]*>/gi, (tag) => imageHtmlTagForStorage(tag));
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
    workbench.hidden = false;
    document.body.classList.add("is-authenticated");
    if (logoutButton) logoutButton.hidden = false;
    setSidebarOpen(true);
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileView(workbench.dataset.mobileView || "write", { focus: false });
    } else {
      setPreviewOpen(workbench.classList.contains("is-preview-open"));
    }
    if (!fields.date.value) fields.date.value = today();
    ensureRichEditor();
    if (editSlug) {
      loadPostForEditing(editSlug);
    } else {
      restoreDraft();
    }
    loadDrafts({ quiet: true });
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
    workbench.hidden = true;
    document.body.classList.remove("is-authenticated");
    if (logoutButton) logoutButton.hidden = true;
    setStatus(saveStatus, "Locked");
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin"
    });
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(body && body.error ? body.error : `Request failed: ${response.status}`);
    }
    return body;
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
    return applyRememberedImageStyles(readRichEditorMarkdown());
  }

  function setMarkdown(value) {
    const markdown = String(value || "");
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
      }, 80);
    }
  }

  function focusEditor() {
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
      link.title = "Hover note - double-click to edit";
      link.dataset.inlineAnnotation = "true";
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
    return { range: range.cloneRange(), text, oldHref: existingHref };
  }

  function rememberEditorSelection() {
    const snapshot = editorSelectionSnapshot();
    if (snapshot) lastEditorSelection = snapshot;
  }

  function openAnnotationDialog(snapshot = editorSelectionSnapshot() || lastEditorSelection) {
    if (!annotationDialog || !annotationForm || !window.MichelAnnotations) return;
    if (!snapshot) {
      setStatus(saveStatus, "Select text in WYSIWYG mode, then choose the annotation tool");
      focusEditor();
      return;
    }
    const payload = snapshot.oldHref ? window.MichelAnnotations.decode(snapshot.oldHref) : null;
    lastEditorSelection = snapshot;
    pendingAnnotation = { ...snapshot, markdownBefore: getMarkdown() };
    annotationHeading.textContent = payload ? "Edit hover annotation" : "Explain selected text";
    annotationSelected.textContent = snapshot.text;
    annotationForm.elements.type.value = payload?.type || "note";
    annotationForm.elements.title.value = payload?.title || "";
    annotationForm.elements.body.value = payload?.body || "";
    annotationForm.elements.label.value = payload?.label || "";
    annotationForm.elements.url.value = payload?.url || "";
    annotationRemoveButton.hidden = !payload;
    annotationDialog.showModal();
    window.setTimeout(() => annotationForm.elements.body.focus(), 40);
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
    if (!richEditor) return;
    if (sanitizeRichEditorImageHtmlText()) return;
    capturePlacedImageNodes();
    restorePlacedImageNodes();
    fields.markdown.value = getMarkdown();
    lastKnownMarkdown = fields.markdown.value;
    disableNativeImageDrag();
    schedulePlacedImageRestore();
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
    const textNode = selection.anchorNode;
    if (textNode.nodeType !== Node.TEXT_NODE || !textNodeIsEditableMathCandidate(textNode)) return false;
    const offset = selection.anchorOffset;
    return inlineMathMatches(textNode.nodeValue).some((match) => {
      return offset > match.start && offset < match.end;
    });
  }

  function selectionInsideAnyInlineMathLine(root) {
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || !root?.contains(selection.anchorNode)) return false;
    const textNode = selection.anchorNode;
    return textNode.nodeType === Node.TEXT_NODE
      && textNodeIsEditableMathCandidate(textNode)
      && inlineMathMatches(textNode.nodeValue).length > 0;
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
      const parenStart = value.indexOf("\\(", index);
      const dollarStart = value.indexOf("$", index);
      let start = -1;
      let kind = "";
      if (parenStart >= 0 && (dollarStart < 0 || parenStart < dollarStart)) {
        start = parenStart;
        kind = "paren";
      } else {
        start = dollarStart;
        kind = "dollar";
      }
      if (start < 0) break;
      if (kind === "dollar") {
        if (value[start + 1] === "$" || isEscapedAt(value, start)) {
          index = start + 1;
          continue;
        }
        let end = value.indexOf("$", start + 1);
        while (end >= 0 && (value[end + 1] === "$" || isEscapedAt(value, end))) {
          end = value.indexOf("$", end + 1);
        }
        if (end < 0) break;
        const tex = value.slice(start + 1, end).trim();
        if (tex && !tex.includes("\n")) matches.push({ start, end: end + 1, tex, display: false });
        index = end + 1;
      } else {
        const end = value.indexOf("\\)", start + 2);
        if (end < 0) break;
        const tex = value.slice(start + 2, end).trim();
        if (tex) matches.push({ start, end: end + 2, tex, display: false });
        index = end + 2;
      }
    }
    return matches;
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
    try {
      window.katex.render(normalizeMathTexShortcuts(tex), node, {
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

  function appendMathLineFormula(line, tex, editableTarget) {
    const node = document.createElement("span");
    node.className = "writer-math-line-formula";
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", "Edit formula");
    try {
      window.katex.render(normalizeMathTexShortcuts(tex), node, {
        displayMode: false,
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

  function placeInlineMathLineOverlay(layer, textNode, matches) {
    if (!layer || !textNode || !matches.length) return null;
    const fullRange = document.createRange();
    fullRange.setStart(textNode, 0);
    fullRange.setEnd(textNode, textNode.nodeValue.length);
    const rect = rectFromRange(fullRange);
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
      appendMathLineSegment(line, textNode.nodeValue.slice(cursor, match.start));
      const closeOffset = textNode.nodeValue.slice(match.start, match.end).startsWith("\\(") ? 2 : 1;
      const editableTarget = {
        container: textNode,
        offset: Math.max(match.start + 1, match.end - closeOffset)
      };
      const formulaNode = appendMathLineFormula(line, match.tex, editableTarget);
      if (formulaNode) formulaNodes.push({ node: formulaNode, target: editableTarget });
      cursor = match.end;
    });
    appendMathLineSegment(line, textNode.nodeValue.slice(cursor));
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
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (excludedTextNodes.has(node) || !textNodeIsEditableMathCandidate(node)) return NodeFilter.FILTER_REJECT;
        return inlineMathMatches(node.nodeValue).length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    let rendered = 0;
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const matches = inlineMathMatches(textNode.nodeValue);
      if (!matches.length) continue;
      if (matches.some((match) => selectionInsideTextSpan(textNode, match.start, match.end))) continue;
      if (placeInlineMathLineOverlay(layer, textNode, matches)) rendered += matches.length;
    }
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
    const rawHtml = md.render(normalizeMathShortcutsInMarkdown(preserveVisualIndentation(markdown)));
    fields.preview.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ["target", "rel", "style", "width", "height", "class", "data-editor-width"]
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
      img.style.boxSizing = "border-box";
      img.style.width = `${Math.round(width)}px`;
      img.style.left = `${Math.round(left)}px`;
      img.style.top = `${Math.round(top)}px`;
      img.style.maxWidth = `calc(100% - ${visualPadding}px)`;
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
      markdown: getMarkdown()
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
    return draft;
  }

  function clearPublishedDraftCache(draftId) {
    const id = String(draftId || "").trim();
    try {
      if (id) {
        window.localStorage.removeItem(draftSlotKey(id));
        window.sessionStorage.removeItem(draftSlotKey(id));
      }
      const cached = parseDraft(window.localStorage.getItem(draftKey));
      if (!id || cached?.draftId === id) window.localStorage.removeItem(draftKey);
      const session = parseDraft(window.sessionStorage.getItem(draftSessionKey));
      if (!id || session?.draftId === id) window.sessionStorage.removeItem(draftSessionKey);
      if (!id || window.localStorage.getItem(draftActiveKey) === id) window.localStorage.removeItem(draftActiveKey);
      if (!id || window.sessionStorage.getItem(draftActiveKey) === id) window.sessionStorage.removeItem(draftActiveKey);
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

  async function loadDrafts(options = {}) {
    if (!csrfToken || workbench.hidden) return;
    try {
      const result = await api("/api/admin/posts?status=draft");
      draftList = Array.isArray(result.posts) ? result.posts : [];
      const localDraft = parseDraft(window.localStorage.getItem(draftSlotKey(activeDraftId)));
      if (localDraft?.draftId && hasDraftContent(localDraft) && !draftList.some((draft) => draft.draftId === localDraft.draftId)) {
        draftList.unshift({
          ...localDraft,
          slug: localDraft.slug || "",
          status: "local",
          updatedAt: localDraft.savedAt || "",
          createdAt: localDraft.savedAt || ""
        });
      }
      renderDraftList();
      if (!options.quiet) setStatus(saveStatus, `Loaded ${draftList.length} drafts`);
    } catch (error) {
      if (!options.quiet) setStatus(saveStatus, error.message);
    }
  }

  function scheduleAutosave() {
    if (!csrfToken || workbench.hidden || deleteInProgress) return;
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
    const { quiet = true, force = false, summarize = false } = options;
    if (!csrfToken || workbench.hidden || deleteInProgress) return null;
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
          summarize
        })
      });
      if (result.slug) {
        activeDraftSlug = result.slug;
        if (!fields.slug.value.trim() && current.title.trim()) {
          fields.slug.value = result.slug;
          fields.slug.dataset.touched = "1";
        }
      }
      if (result.excerptMode) setExcerptMode(result.excerptMode);
      if (typeof result.excerpt === "string") fields.excerpt.value = result.excerpt;
      lastSavedSignature = draftSignature(readDraft(), "draft");
      saveLocalDraft({ quiet: true });
      await loadDrafts({ quiet: true });
      setStatus(saveStatus, `${quiet ? "Autosaved" : "Draft saved"} ${clockTime()}${result.slug ? ` · ${result.slug}` : ""}`);
      return result;
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

  function restoreDraft() {
    try {
      const localDraft = parseDraft(window.localStorage.getItem(draftKey));
      const sessionDraft = parseDraft(window.sessionStorage.getItem(draftSessionKey));
      const activeId = window.sessionStorage.getItem(draftActiveKey) || window.localStorage.getItem(draftActiveKey) || "";
      const localSlotDraft = parseDraft(window.localStorage.getItem(draftSlotKey(activeId)));
      const sessionSlotDraft = parseDraft(window.sessionStorage.getItem(draftSlotKey(activeId)));
      const candidates = [localDraft, sessionDraft, localSlotDraft, sessionSlotDraft].filter(Boolean);
      const draft = candidates.sort((a, b) => draftTime(b) - draftTime(a))[0] || {};
      Object.entries(draft).forEach(([key, value]) => {
        if (fields[key] && typeof value === "string") fields[key].value = value;
      });
      activeDraftId = typeof draft.draftId === "string" ? draft.draftId : "";
      activeOriginalSlug = typeof draft.originalSlug === "string" ? draft.originalSlug : "";
      activeLegacySource = typeof draft.legacySource === "string" ? draft.legacySource : "";
      activeImportedFromLegacy = Boolean(draft.importedFromLegacy || activeLegacySource);
      setExcerptMode(draft.excerptMode || (draft.excerpt ? "manual" : "auto"));
      activeSourceMarkdownPath = typeof draft.sourceMarkdownPath === "string" ? draft.sourceMarkdownPath : "";
      activeImportedFromMarkdown = Boolean(draft.importedFromMarkdown || activeSourceMarkdownPath);
      if (typeof draft.markdown === "string") setMarkdown(draft.markdown);
      activeDraftSlug = fields.slug.value.trim();
      ensureDraftId();
      lastSavedSignature = "";
      if (draft.savedAt) setStatus(saveStatus, `Restored cache ${clockTime(new Date(draft.savedAt))}`);
    } catch (_) {
      // Ignore malformed old drafts.
    }
  }

  function toDateInput(value) {
    const normalized = String(value || "").replaceAll("/", "-");
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : today();
  }

  function setDraftFields(post) {
    activePostStatus = post.status === "published" ? "published" : "draft";
    activeDraftId = post.draftId || (activePostStatus === "draft" ? createDraftId() : "");
    activeDraftSlug = post.slug || "";
    activeOriginalSlug = post.originalSlug || post.slug || "";
    activeLegacySource = post.legacySource || "";
    activeImportedFromLegacy = Boolean(post.importedFromLegacy || post.legacySource);
    activeSourceMarkdownPath = post.sourceMarkdownPath || "";
    activeImportedFromMarkdown = Boolean(post.importedFromMarkdown || post.sourceMarkdownPath);
    fields.title.value = post.title || "";
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
      saveLocalDraft({ quiet: true });
      setStatus(saveStatus, result.post?.importedFromLegacy
        ? `Imported legacy Markdown: ${result.post?.slug || slug}`
        : `Editing: ${result.post?.slug || slug}`);
      window.requestAnimationFrame(focusEditor);
    } catch (error) {
      setStatus(saveStatus, error.message);
      restoreDraft();
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
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (_) {
      // Session may already be gone.
    }
    csrfToken = "";
    showLogin();
  });

  async function switchDraft(identity) {
    if (!identity || identity === activeDraftId || identity === activeDraftSlug) return;
    try {
      await autosaveDraft({ quiet: true, force: false });
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
    activePostStatus = "draft";
    activeDraftId = createDraftId();
    activeDraftSlug = "";
    activeOriginalSlug = "";
    activeLegacySource = "";
    activeImportedFromLegacy = false;
    activeSourceMarkdownPath = "";
    activeImportedFromMarkdown = false;
    lastSavedSignature = "";
    fields.title.value = "";
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
    renderDraftList();
    renderPreview();
    setStatus(saveStatus, message);
    window.requestAnimationFrame(() => fields.title.focus());
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
    const identity = String(target?.draftId || target?.slug || "");
    return Boolean(identity && (identity === activeDraftId || identity === activeDraftSlug));
  }

  async function requestDeletePost(target = currentDeleteTarget()) {
    if (deleteInProgress) return;
    const identity = String(target?.draftId || target?.slug || "").trim();
    if (!identity) {
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
      if (target.status !== "local") {
        await api(`/api/admin/posts/${encodeURIComponent(identity)}`, { method: "DELETE" });
      }
      clearPublishedDraftCache(target.draftId || identity);
      draftList = draftList.filter((draft) => {
        const draftIdentity = String(draft.draftId || draft.slug || "");
        return draftIdentity !== identity;
      });
      if (isCurrent) resetToBlankDraft(`Deleted “${target.title || "Untitled"}”`);
      else renderDraftList();
      await loadDrafts({ quiet: true });
      if (!isCurrent) setStatus(saveStatus, `Deleted “${target.title || "Untitled"}”`);
    } catch (error) {
      setStatus(saveStatus, error.message);
    } finally {
      deleteInProgress = false;
    }
  }

  function undoLastChange() {
    if (workbench.hidden) return;
    try {
      if (richEditor && typeof richEditor.exec === "function") {
        richEditor.exec("undo");
      } else {
        document.execCommand("undo");
      }
    } catch (_) {
      document.execCommand("undo");
    }
    window.setTimeout(() => {
      if (richEditor) syncFromRichEditor();
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
      await autosaveDraft({ quiet: false, force: true, summarize: true });
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
  }

  async function publishPost() {
    normalizeExcerptField();
    const cachedDraft = saveLocalDraft();
    setStatus(saveStatus, "Publishing...");
    try {
      const result = await api("/api/admin/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload("published"), summarize: true })
      });
      if (result.excerptMode) setExcerptMode(result.excerptMode);
      if (typeof result.excerpt === "string") fields.excerpt.value = result.excerpt;
      if (result.slug) activeDraftSlug = result.slug;
      lastSavedSignature = draftSignature(readDraft(), "published");
      window.localStorage.setItem(publishedBackupKey, JSON.stringify({
        ...cachedDraft,
        publishedAt: new Date().toISOString(),
        publishedUrl: result.url
      }));
      clearPublishedDraftCache(cachedDraft?.draftId || activeDraftId);
      activeDraftId = "";
      await loadDrafts({ quiet: true });
      setStatus(saveStatus, `Published: ${result.url} · removed from drafts`);
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        window.open(result.url, "_blank", "noopener");
      }
    } catch (error) {
      setStatus(saveStatus, error.message);
    }
  }

  undoButton?.addEventListener("click", undoLastChange);
  deletePostButton?.addEventListener("click", () => requestDeletePost());
  newDraftButton?.addEventListener("click", newDraft);
  refreshDraftsButton?.addEventListener("click", () => loadDrafts({ quiet: false }));
  document.querySelector("[data-save-draft]")?.addEventListener("click", saveDraft);
  document.querySelector("[data-publish]")?.addEventListener("click", publishPost);

  function insertMarkdown(text) {
    if (richEditor) {
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

  function insertUploadedImage(result, file) {
    const markdown = imageMarkdown(result, file);
    const alt = result.alt || (file?.name || "image").replace(/\.[^.]+$/, "");
    if (result.url && insertEditorImage(result.url, alt)) {
      saveLocalDraft({ quiet: true });
      scheduleAutosave();
      renderPreview();
      window.setTimeout(() => selectImageBySrc(result.url), 160);
      return;
    }
    appendMarkdownBlock(markdown);
    if (result.url) window.setTimeout(() => selectImageBySrc(result.url), 160);
  }

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

  function handlePastedImage(event) {
    if (workbench.hidden) return false;
    const file = imageFromClipboard(event);
    const imageUrl = file ? "" : imageUrlFromClipboard(event);
    if (!file && !imageUrl) return false;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (file) {
      uploadImage(file);
    } else {
      insertMarkdown(`![image](${imageUrl})`);
      setStatus(saveStatus, "Inserted image link from clipboard.");
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
    if (!src || settings?.align !== "free") return;
    const snapshot = {
      src,
      alt: settings.alt || "",
      width: clampImageWidth(settings.width || defaultImageWidth),
      align: "free",
      x: imageOffset(settings.x || 0),
      y: imageOffset(settings.y || 0),
      editorWidth: editorWidthValue(settings.editorWidth || imageEditorWidthSnapshot())
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
      editorWidth: editorWidthValue(editorWidth)
    };
  }

  function rememberPlacedImagesFromMarkdown(markdown) {
    String(markdown || "").replace(/<img\b[^>]*>/gi, (tag) => {
      const src = /\bsrc=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const alt = /\balt=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const style = /\bstyle=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const editorWidth = /\bdata-editor-width=(["'])(.*?)\1/i.exec(tag)?.[2] || "";
      const settings = imageSettingsFromStyleText(style, editorWidth);
      if (src && settings.align === "free") rememberPlacedImage(src, { ...settings, alt });
      return tag;
    });
  }

  function applyRememberedImageStyles(markdown) {
    let next = String(markdown || "");
    next = next.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
      const settings = rememberedImageSettings(src);
      return settings?.align === "free"
        ? htmlImage(src, alt, settings.width, "free", settings.x, settings.y)
        : match;
    });
    next = next.replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => {
      const settings = rememberedImageSettings(src);
      if (settings?.align !== "free") return match;
      const alt = /\balt=(["'])(.*?)\1/i.exec(match)?.[2] || settings.alt || "Blog image";
      return htmlImage(src, alt, settings.width, "free", settings.x, settings.y);
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
      if (remembered?.align === "free") {
        applyPlacedImageSettings(img, remembered);
        expandImageCanvas(img, remembered.y);
        return;
      }
      const settings = imageSettingsFromNode(img);
      if (settings.align === "free") {
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
    return Math.max(-2400, Math.min(2400, Math.round(offset)));
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

  function imageStyle(widthValue, align = "free", xValue, yValue = 0) {
    const width = align === "full" ? 100 : clampImageWidth(widthValue);
    const base = `width: ${width}%; max-width: 100%; height: auto;`;
    const x = align === "full" ? 0 : imageOffset(xValue);
    const y = imageOffset(yValue);
    if (align === "full" || align === "flow") {
      return `${base} display: block; position: relative; float: none; margin: 1em auto; transform: none;`;
    }
    return `${base} display: block; position: absolute; left: ${x}px; top: ${y}px; float: none; margin: 0; transform: none; z-index: 2;`;
  }

  function applyPlacedImageSettings(img, settings) {
    if (!img || settings?.align !== "free") return;
    img.setAttribute("style", imageStyle(settings.width, "free", settings.x, settings.y));
    img.setAttribute("data-editor-width", String(settings.editorWidth || imageEditorWidthSnapshot()));
  }

  function htmlImage(src, alt, widthValue, align, xValue, yValue) {
    const widthAttr = align === "free" ? ` data-editor-width="${imageEditorWidthSnapshot()}"` : "";
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || "Blog image")}"${widthAttr} style="${escapeAttr(imageStyle(widthValue, align, xValue, yValue))}">`;
  }

  function imageSettingsFromNode(img) {
    const src = img?.getAttribute("src") || img?.src || "";
    const remembered = src ? rememberedImageSettings(src) : null;
    if (remembered) return { ...remembered };
    const style = img?.getAttribute("style") || "";
    const storedEditorWidth = editorWidthValue(img?.getAttribute("data-editor-width") || "");
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
    return { width, align, x, y, editorWidth: storedEditorWidth || imageEditorWidthSnapshot() };
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
      imageStyle(settings.width, "free", imageOffset(settings.x + driftX), imageOffset(settings.y + driftY))
    );
  }

  function ensureImageOverlay() {
    if (imageOverlay) return imageOverlay;
    imageOverlay = document.createElement("div");
    imageOverlay.className = "image-drag-overlay";
    imageOverlay.innerHTML = [
      '<div class="image-drag-outline"></div>',
      '<div class="image-drag-label"></div>',
      '<button class="image-drag-handle is-nw" type="button" data-resize-edge="left" aria-label="Resize image from left"></button>',
      '<button class="image-drag-handle is-ne" type="button" data-resize-edge="right" aria-label="Resize image from right"></button>',
      '<button class="image-drag-handle is-se" type="button" data-resize-edge="right" aria-label="Resize image"></button>'
    ].join("");
    document.body.appendChild(imageOverlay);
    imageOverlay.querySelectorAll(".image-drag-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", startImageResize);
      handle.addEventListener("mousedown", startImageResize);
    });
    return imageOverlay;
  }

  function overlayLabel() {
    return ensureImageOverlay().querySelector(".image-drag-label");
  }

  function setOverlayLabel(width, align, x, y = 0) {
    const label = overlayLabel();
    const nextWidth = clampImageWidth(width);
    const nextX = align === "full" ? 0 : imageOffset(x);
    if (label) {
      label.textContent = align === "flow"
        ? `${nextWidth}% · flow`
        : `${nextWidth}% · x ${nextX}px · y ${imageOffset(y)}px`;
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
    const width = selectedImage?.width || imageWidthFromRect(selectedImageNode);
    setOverlayLabel(width, selectedImage?.align || "free", selectedImage?.x ?? 0, selectedImage?.y ?? 0);
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

  function replaceSelectedImage(widthValue, alignValue, xValue, yValue) {
    if (!selectedImage?.src) {
      setStatus(saveStatus, "Click an image first.");
      return false;
    }
    const align = alignValue || selectedImage.align || "free";
    const width = align === "full" ? 100 : clampImageWidth(widthValue || selectedImage.width || defaultImageWidth);
    const x = align === "full" ? 0 : imageOffset(xValue ?? selectedImage.x ?? 0);
    const y = imageOffset(yValue ?? selectedImage.y ?? 0);
    const editorWidth = align === "free" ? imageEditorWidthSnapshot() : 0;
    const srcs = imageSrcCandidates(selectedImage.src);
    const markdown = getMarkdown();
    let changed = false;

    const next = markdown
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
        if (changed || !srcs.has(src)) return match;
        changed = true;
        return imageMarkupForStorage(src, alt, width, align, x, y);
      })
      .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*>/gi, (match, quote, src) => {
        if (changed || !srcs.has(src)) return match;
        const alt = /alt=(["'])(.*?)\1/i.exec(match)?.[2] || selectedImage.alt || "Blog image";
        changed = true;
        return imageMarkupForStorage(src, alt, width, align, x, y);
      });

    if (!changed) {
      setStatus(saveStatus, "Could not find that image in Markdown.");
      return false;
    }
    selectedImage = { ...selectedImage, width, align, x, y, editorWidth };
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
    setStatus(saveStatus, `Image ${width}% · x ${x}px · y ${y}px`);
    window.setTimeout(refreshSelectedImage, 160);
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
      selectedImage = { ...selectedImage, ...imageSettingsFromNode(img) };
      if (selectedImage.align === "free") {
        applyPlacedImageSettings(img, selectedImage);
        expandImageCanvas(img, selectedImage.y);
      }
      img.classList.add("is-selected-writer-image");
      selectedImageNode = img;
      positionImageOverlay();
    } else {
      selectedImageNode = null;
      imageOverlay?.classList.remove("is-active");
    }
  }

  richEditorEl?.addEventListener("click", (event) => {
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
    setStatus(saveStatus, "Image selected. Drag freely in any direction, drag corner to resize.");
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
      y: 0
    };
    refreshSelectedImage();
    setStatus(saveStatus, `Image inserted ${defaultImageWidth}% · centered. Drag image to place it freely.`);
  }

  function applyLiveImagePreview(width, align, x, y) {
    if (!selectedImageNode) return;
    const nextWidth = clampImageWidth(width);
    const nextX = align === "full" ? 0 : imageOffset(x ?? selectedImage?.x ?? 0);
    const nextY = imageOffset(y ?? selectedImage?.y ?? 0);
    selectedImageNode.setAttribute("style", imageStyle(nextWidth, align, nextX, nextY));
    selectedImage = { ...selectedImage, width: nextWidth, align, x: nextX, y: nextY, editorWidth: align === "free" ? imageEditorWidthSnapshot() : 0 };
    expandImageCanvas(selectedImageNode, nextY);
    setOverlayLabel(nextWidth, align, nextX, nextY);
    positionImageOverlay();
  }

  function startImageMove(event) {
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
    imageDrag = {
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      width: selectedImage.width,
      align: "free",
      originX: selectedImage.x ?? 0,
      originY: selectedImage.y ?? 0,
      x: selectedImage.x ?? 0,
      y: selectedImage.y ?? 0
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
      align: selectedImage?.align || "center",
      originX: selectedImage?.x ?? 0,
      originY: selectedImage?.y ?? 0,
      x: selectedImage?.x ?? 0,
      y: selectedImage?.y ?? 0,
      direction: event.currentTarget?.dataset?.resizeEdge === "left" ? -1 : 1
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setStatus(saveStatus, "Resize image; release to save.");
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
      applyLiveImagePreview(imageDrag.width, "free", x, y);
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
      applyLiveImagePreview(width, imageDrag.align, x, imageDrag.y);
    }
  }

  function finishImageDrag() {
    if (!imageDrag) return;
    if (!imageDrag.started) {
      imageDrag = null;
      return;
    }
    const { width, align, x, y } = imageDrag;
    imageDrag = null;
    replaceSelectedImage(width, align, x, y);
  }

  richEditorEl?.addEventListener("pointerdown", startImageMove);
  richEditorEl?.addEventListener("mousedown", startImageMove);
  window.addEventListener("pointermove", handleImageDragMove);
  window.addEventListener("mousemove", handleImageDragMove);
  window.addEventListener("pointerup", finishImageDrag);
  window.addEventListener("mouseup", finishImageDrag);
  window.addEventListener("scroll", positionImageOverlay, true);
  window.addEventListener("resize", positionImageOverlay);

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
  richEditorEl?.addEventListener("dblclick", (event) => {
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
      url: String(values.get("url") || "").trim()
    };
    if (!payload.body) {
      annotationForm.elements.body.focus();
      return;
    }
    applyAnnotation(payload);
    annotationDialog.close();
  });

  annotationCancelButton?.addEventListener("click", () => {
    pendingAnnotation = null;
    annotationDialog.close();
    focusEditor();
  });

  annotationRemoveButton?.addEventListener("click", removeAnnotation);

  annotationDialog?.addEventListener("close", () => {
    pendingAnnotation = null;
  });

  function trackImageLayoutMutation(event) {
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
    if (!mod) return;
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!workbench.hidden) saveDraft();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!workbench.hidden) publishPost();
    }
  });

  window.addEventListener("pagehide", () => {
    if (!workbench.hidden) saveLocalDraft({ quiet: true });
  });

  window.addEventListener("beforeunload", () => {
    if (!workbench.hidden) saveLocalDraft({ quiet: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!workbench.hidden && document.visibilityState === "hidden") {
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
