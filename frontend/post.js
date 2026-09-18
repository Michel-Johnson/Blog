(async function () {
  if (window.MichelLanguage?.en) await window.MichelLanguage.ready;
  const english = window.MichelLanguage?.en === true;
  const stableFlowImageMode = true;
  const createLinks = document.querySelectorAll('[data-create-link]');
  if (createLinks.length) {
    const { protocol, hostname, port } = window.location;
    const localHost = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
    const href = localHost && port !== '8787' ? `${protocol}//${hostname}:8787/admin.html` : './admin.html';
    createLinks.forEach((link) => {
      link.href = href;
    });
  }

  const authoredPosts = Array.isArray(window.MICHEL_AUTHORED_POSTS) ? window.MICHEL_AUTHORED_POSTS : [];
  const hiddenPostIdentities = Array.isArray(window.MICHEL_HIDDEN_POSTS) ? window.MICHEL_HIDDEN_POSTS : [];
  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\u3400-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
  }
  const hiddenPostSlugs = new Set(hiddenPostIdentities.map(slugify).filter(Boolean));
  const isHiddenLegacyPost = (post) => {
    return [post?.slug, post?.originalSlug, ...(Array.isArray(post?.aliases) ? post.aliases : [])]
      .map(slugify)
      .some((identity) => identity && hiddenPostSlugs.has(identity));
  };
  const mountedPosts = (Array.isArray(window.MICHEL_POSTS) ? window.MICHEL_POSTS : [])
    .filter((post) => !isHiddenLegacyPost(post))
    .concat(authoredPosts);
  const allPosts = (Array.isArray(window.MICHEL_ALL_POSTS) ? window.MICHEL_ALL_POSTS : [])
    .filter((post) => !isHiddenLegacyPost(post))
    .concat(authoredPosts);
  const postsBySlug = new Map();
  function rememberPostSlug(item, base = {}) {
    if (!item || !item.slug) return;
    const merged = { ...base, ...item };
    postsBySlug.set(item.slug, merged);
    const normalized = slugify(item.slug);
    if (normalized) postsBySlug.set(normalized, merged);
  }
  allPosts.forEach((item) => {
    rememberPostSlug(item);
  });
  mountedPosts.forEach((item) => {
    const indexed = postsBySlug.get(item?.slug) || postsBySlug.get(slugify(item?.slug)) || {};
    rememberPostSlug(item, indexed);
  });
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || "";
  const exactPost = postsBySlug.get(slug);
  const normalizedPost = postsBySlug.get(slugify(slug));
  const post = normalizedPost?.authored ? normalizedPost : exactPost || normalizedPost;

  const page = document.getElementById("post-page");
  const meta = document.getElementById("post-meta");
  const title = document.getElementById("post-title");
  const excerpt = document.getElementById("post-excerpt");
  const content = document.getElementById("post-content");
  const htmlReadingWidthHandle = document.querySelector("[data-html-reading-width-handle]");
  const htmlReadingWidthOutput = document.querySelector("[data-html-reading-width-output]");
  const sourceLink = document.getElementById("source-link");
  const postFooter = document.getElementById("post-footer");
  const editButton = document.querySelector("[data-edit-post]");
  const pinButton = document.querySelector("[data-pin-post]");
  const editModal = document.querySelector("[data-edit-modal]");
  const editForm = document.querySelector("[data-edit-form]");
  const editClose = document.querySelector("[data-edit-close]");
  const editStatus = document.querySelector("[data-edit-status]");
  const editHeading = document.querySelector("[data-edit-heading]");
  const editCopy = document.querySelector("[data-edit-copy]");
  const editSubmit = document.querySelector("[data-edit-submit]");
  const initialPinnedPosts = Array.isArray(window.MICHEL_PINNED_POSTS) ? window.MICHEL_PINNED_POSTS : [];
  const pinnedPostSet = new Set(initialPinnedPosts);
  let pinIsActive = Boolean(post && [post.slug, post.originalSlug, slug].some((value) => pinnedPostSet.has(String(value || "").trim())));
  let pendingAdminAction = "edit";
  let adminCsrfToken = "";
  const htmlReadingWidthStorageKey = "michel-html-reading-width-v2";
  const htmlReadingWidthMin = 640;
  const htmlReadingWidthMax = 1200;
  const htmlReadingWidthDefault = 860;
  let htmlReadingWidth = htmlReadingWidthDefault;
  let htmlReadingWidthDrag = null;

  function clampHtmlReadingWidth(value) {
    const numeric = Number(value);
    return Math.round(Math.min(htmlReadingWidthMax, Math.max(htmlReadingWidthMin,
      Number.isFinite(numeric) ? numeric : htmlReadingWidthDefault)));
  }

  function applyHtmlReadingWidth(value, { persist = false } = {}) {
    htmlReadingWidth = clampHtmlReadingWidth(value);
    document.body.style.setProperty("--reading-measure", `${htmlReadingWidth}px`);
    document.body.style.setProperty("--reading-paper", `${htmlReadingWidth + 68}px`);
    htmlReadingWidthHandle?.setAttribute("aria-valuenow", String(htmlReadingWidth));
    if (htmlReadingWidthOutput) htmlReadingWidthOutput.value = `${htmlReadingWidth}px`;
    if (persist) {
      try {
        window.localStorage.setItem(htmlReadingWidthStorageKey, String(htmlReadingWidth));
      } catch (_) {
        // Private browsing may reject storage; the current page still keeps the width.
      }
    }
  }

  function setupHtmlReadingWidthControl() {
    if (post?.contentFormat !== "html" || !htmlReadingWidthHandle) return;
    document.body.classList.add("is-html-post");
    htmlReadingWidthHandle.hidden = false;
    let storedWidth = htmlReadingWidthDefault;
    try {
      storedWidth = window.localStorage.getItem(htmlReadingWidthStorageKey) || htmlReadingWidthDefault;
    } catch (_) {
      storedWidth = htmlReadingWidthDefault;
    }
    applyHtmlReadingWidth(storedWidth);

    htmlReadingWidthHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      htmlReadingWidthDrag = { pointerId: event.pointerId, startX: event.clientX, startWidth: htmlReadingWidth };
      htmlReadingWidthHandle.classList.add("is-active");
      htmlReadingWidthHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    htmlReadingWidthHandle.addEventListener("pointermove", (event) => {
      if (!htmlReadingWidthDrag || htmlReadingWidthDrag.pointerId !== event.pointerId) return;
      const centeredScale = document.body.classList.contains("is-assistant-docked-left") ? 1 : 2;
      applyHtmlReadingWidth(htmlReadingWidthDrag.startWidth + (event.clientX - htmlReadingWidthDrag.startX) * centeredScale);
    });
    const finishDrag = (event) => {
      if (!htmlReadingWidthDrag || htmlReadingWidthDrag.pointerId !== event.pointerId) return;
      htmlReadingWidthDrag = null;
      htmlReadingWidthHandle.classList.remove("is-active");
      applyHtmlReadingWidth(htmlReadingWidth, { persist: true });
    };
    htmlReadingWidthHandle.addEventListener("pointerup", finishDrag);
    htmlReadingWidthHandle.addEventListener("pointercancel", finishDrag);
    htmlReadingWidthHandle.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 50 : 20;
      const nextWidth = event.key === "ArrowLeft" ? htmlReadingWidth - step
        : event.key === "ArrowRight" ? htmlReadingWidth + step
          : event.key === "Home" ? htmlReadingWidthMin
            : event.key === "End" ? htmlReadingWidthMax
              : null;
      if (nextWidth === null) return;
      event.preventDefault();
      applyHtmlReadingWidth(nextWidth, { persist: true });
    });
  }

  function makeErrorPage() {
    document.title = "Post not found · Michel Johnson";
    page.classList.add("post-missing");
    meta.textContent = "Missing note";
    title.textContent = "This post is not in the sketch reader yet.";
    excerpt.textContent = "Go back to the blog shelf and choose one of the mounted notes.";
    content.innerHTML = '<p class="empty-note">I could not find this slug in the local post bundle.</p>';
    sourceLink.href = "./?home=1#blog";
    sourceLink.textContent = "Back to blog shelf";
  }

  function editAdminHref() {
    const { protocol, hostname, port } = window.location;
    const localHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    const base = localHost && port !== "8787" ? `${protocol}//${hostname}:8787/admin.html` : "./admin.html";
    const url = new URL(base, window.location.href);
    url.searchParams.set("edit", slug);
    url.searchParams.set("return", window.location.href);
    return url.href;
  }

  function postViewApiHref() {
    const { protocol, hostname, port } = window.location;
    const localHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    const base = localHost && port !== "8787" ? `${protocol}//${hostname}:8787` : window.location.origin;
    return `${base}/api/post-views/${encodeURIComponent(post?.slug || slug)}`;
  }

  function recordPostView() {
    fetch(postViewApiHref(), {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Accept": "application/json" }
    }).catch(() => {
      // Statistics must never interrupt article reading.
    });
  }

  function usesExternalLocalAdmin() {
    const { hostname, port } = window.location;
    const localHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    return localHost && port !== "8787";
  }

  function adminApiUrl(path) {
    const { protocol, hostname, port } = window.location;
    const localHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    if (localHost && port !== "8787") return `${protocol}//${hostname}:8787${path}`;
    return path;
  }

  async function adminApi(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (adminCsrfToken && String(options.method || "GET").toUpperCase() !== "GET") {
      headers.set("X-CSRF-Token", adminCsrfToken);
    }
    const response = await fetch(adminApiUrl(path), {
      ...options,
      credentials: usesExternalLocalAdmin() ? "include" : "same-origin",
      headers
    });
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(body?.error || `Request failed: ${response.status}`);
    }
    if (body && typeof body === "object" && body.csrfToken) {
      adminCsrfToken = body.csrfToken;
    }
    return body;
  }

  function openEditModal(message = "", mode = "edit") {
    if (!editModal || !editForm) return;
    pendingAdminAction = mode;
    if (editHeading) editHeading.textContent = mode === "pin" ? "Pin this note" : "Edit this note";
    if (editCopy) editCopy.textContent = mode === "pin"
      ? "Enter the writer password to change this post's pinned position."
      : "Enter the writer password to edit this post.";
    if (editSubmit) editSubmit.textContent = mode === "pin" ? "Unlock pin" : "Unlock editor";
    editModal.hidden = false;
    if (editStatus) editStatus.textContent = message;
    window.setTimeout(() => editForm.querySelector("input")?.focus(), 40);
  }

  function closeEditModal() {
    if (editModal) editModal.hidden = true;
    if (editStatus) editStatus.textContent = "";
    editForm?.reset();
  }

  async function beginEdit() {
    if (!post) return;
    if (usesExternalLocalAdmin()) {
      window.location.href = editAdminHref();
      return;
    }
    if (editStatus) editStatus.textContent = "";
    try {
      await adminApi("/api/admin/session");
      window.location.href = editAdminHref();
    } catch (_) {
      openEditModal();
    }
  }

  function renderPinState() {
    if (!pinButton) return;
    pinButton.classList.toggle("is-pinned", pinIsActive);
    pinButton.setAttribute("aria-pressed", String(pinIsActive));
    pinButton.setAttribute("aria-label", pinIsActive ? "Unpin this post" : "Pin this post");
    pinButton.title = pinIsActive ? "Remove from pinned posts" : "Pin this post";
  }

  function pinAnimationDelay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function setPinState() {
    if (!post || !pinButton || pinButton.disabled) return;
    const nextPinned = !pinIsActive;
    pinButton.disabled = true;
    pinButton.classList.remove("is-error", "is-driving", "is-removing");
    pinButton.classList.add(nextPinned ? "is-driving" : "is-removing");
    try {
      await pinAnimationDelay(nextPinned ? 170 : 120);
      const result = await adminApi(`/api/admin/pins/${encodeURIComponent(post.slug || slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned })
      });
      pinIsActive = Boolean(result.pinned);
      if (Array.isArray(result.pins)) window.MICHEL_PINNED_POSTS = result.pins.slice();
      renderPinState();
    } catch (error) {
      pinButton.classList.add("is-error");
      throw error;
    } finally {
      window.setTimeout(() => {
        pinButton.classList.remove("is-driving", "is-removing", "is-error");
        pinButton.disabled = false;
      }, 430);
    }
  }

  async function beginPinToggle() {
    if (!post) return;
    try {
      await adminApi("/api/admin/session");
    } catch (_) {
      openEditModal("", "pin");
      return;
    }
    try {
      await setPinState();
    } catch (error) {
      openEditModal(error.message, "pin");
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function plainTextSummary(value) {
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

  function summaryFromMarkdown(markdown) {
    if (!markdown) return "";
    const withoutBlocks = String(markdown)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#>*_`~\-[\]()]/g, " ");
    return plainTextSummary(withoutBlocks).slice(0, 180);
  }

  function unescapedDollarCount(value) {
    let count = 0;
    String(value || "").replace(/(^|[^\\])\$/g, () => {
      count += 1;
      return "";
    });
    return count;
  }

  function siblingText(node, direction) {
    const values = [];
    let current = node[direction];
    while (current) {
      values.push(current.textContent || "");
      current = current[direction];
    }
    if (direction === "previousSibling") values.reverse();
    return values.join("");
  }

  function repairLegacySuperscript(parent) {
    parent.querySelectorAll(":scope > sup").forEach((sup) => {
      const next = sup.nextSibling;
      if (!next || next.nodeType !== Node.TEXT_NODE) return;
      const broken = /^(\{[^}]+\}\))([+\-])([A-Za-z][A-Za-z0-9_]*)$/.exec(sup.textContent || "");
      const continuation = /^(\{[^}]+\})/.exec(next.textContent || "");
      if (!broken || !continuation) return;
      sup.replaceWith(document.createTextNode(
        `^${broken[1]}${broken[2]}${broken[3]}^${continuation[1]}`
      ));
      next.textContent = (next.textContent || "").slice(continuation[1].length);
    });
  }

  function repairLegacyMixedMath(root) {
    root.querySelectorAll("span.katex").forEach((katex) => {
      if (katex.parentElement?.closest("span.katex")) return;
      const parent = katex.parentElement;
      if (!parent || !parent.matches("p, li, td, th")) return;

      const annotation = katex.querySelector('annotation[encoding="application/x-tex"]');
      const source = (annotation?.textContent || "").trim();
      const words = source.match(/[A-Za-z]+/g) || [];
      const looksLikeProse = words.length >= 2
        && !/[\\_^{}=<>]/.test(source)
        && !/\b(?:frac|sum|theta|alpha|beta|vec|left|right)\b/i.test(source);
      if (!looksLikeProse) return;

      const before = siblingText(katex, "previousSibling");
      const after = siblingText(katex, "nextSibling");
      if (unescapedDollarCount(before) % 2 !== 1 || unescapedDollarCount(after) % 2 !== 1) return;

      katex.replaceWith(document.createTextNode(`$${source} $`));
      repairLegacySuperscript(parent);
      parent.normalize();
      parent.dataset.legacyMathRepaired = "true";
    });
  }

  function normalizeLegacyMathSource(source) {
    return normalizeMathTexShortcuts(String(source || ""))
      .replace(/\u00a0/g, " ")
      .replace(/([xy])\{\(i\)\}/g, "$1^{(i)}")
      .replace(/tmp\\?_([wb])/g, "\\mathrm{tmp}_$1")
      .replace(/…/g, "\\dots")
      .replace(/\.\.\./g, "\\dots")
      .replace(/^L-->loss$/i, "L \\longrightarrow \\text{loss}")
      .replace(
        /^L\((f_[\s\S]+?\^\{\(i\)\})\s*,\s*(y\^\{\(i\)\})\s*\)=/,
        "L($1), $2) ="
      )
      .trim();
  }

  function rebuildLegacyKatex(root) {
    if (!window.katex) return;
    const formulas = Array.from(root.querySelectorAll("span.katex"))
      .filter((node) => !node.parentElement?.closest("span.katex"));

    formulas.forEach((formula) => {
      const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
      let source = (annotation?.textContent || "").trim();
      if (!source) return;

      let proseBefore = "";
      let proseAfter = "";
      source = source.replace(/^\s*,?\s*the\s*cost\s*function\s*/i, () => {
        proseBefore = "the cost function ";
        return "";
      });
      source = source.replace(/\s*,?\s*the\s*cost\s*function\s*$/i, () => {
        proseAfter = ", the cost function";
        return "";
      });
      source = normalizeLegacyMathSource(source);
      if (!source) {
        formula.replaceWith(document.createTextNode(`${proseBefore}${proseAfter}`));
        return;
      }

      const displayWrapper = formula.parentElement?.classList.contains("katex-display")
        ? formula.parentElement
        : null;
      const target = displayWrapper || formula;
      const holder = document.createElement("span");
      try {
        window.katex.render(source, holder, {
          displayMode: Boolean(displayWrapper),
          throwOnError: false,
          strict: "ignore"
        });
      } catch (_) {
        return;
      }
      const replacement = holder.firstElementChild;
      if (!replacement) return;
      if (proseBefore) target.before(document.createTextNode(proseBefore));
      target.replaceWith(replacement);
      if (proseAfter) replacement.after(document.createTextNode(proseAfter));
    });
  }

  function firstArticleTextNode(node) {
    for (const child of node?.childNodes || []) {
      if (child.nodeType === Node.TEXT_NODE) return child;
      if (child.nodeType === Node.ELEMENT_NODE) {
        const nested = firstArticleTextNode(child);
        if (nested) return nested;
      }
    }
    return null;
  }

  function stripLegacyParagraphIndent(root) {
    root.querySelectorAll("p").forEach((paragraph) => {
      const first = firstArticleTextNode(paragraph);
      if (!first) return;
      first.textContent = (first.textContent || "").replace(/^[ \t\u00a0\u200b\u2060]+/, "");
    });
  }

  function normalizeArticle(root) {
    const isolateFlowImage = (img) => {
      if (!stableFlowImageMode) return;
      const paragraph = img.parentElement;
      if (paragraph?.tagName !== "P") return;
      const nodes = Array.from(paragraph.childNodes);
      const imageIndex = nodes.indexOf(img);
      if (imageIndex < 0) return;
      const before = nodes.slice(0, imageIndex);
      const after = nodes.slice(imageIndex + 1);
      const hasContent = (items) => items.some((node) => node.nodeType === Node.ELEMENT_NODE || String(node.textContent || "").trim());
      if (!hasContent(before) && !hasContent(after)) return;
      if (hasContent(before)) {
        const beforeParagraph = document.createElement("p");
        before.forEach((node) => beforeParagraph.appendChild(node));
        paragraph.before(beforeParagraph);
      } else {
        before.forEach((node) => node.remove());
      }
      if (hasContent(after)) {
        const afterParagraph = document.createElement("p");
        after.forEach((node) => afterParagraph.appendChild(node));
        paragraph.after(afterParagraph);
      } else {
        after.forEach((node) => node.remove());
      }
    };
    stripLegacyParagraphIndent(root);
    root.querySelectorAll("p, li, td, th").forEach((parent) => {
      if (unescapedDollarCount(parent.textContent || "") >= 2) {
        repairLegacySuperscript(parent);
      }
    });
    repairLegacyMixedMath(root);
    rebuildLegacyKatex(root);

    root.querySelectorAll("figure.highlight").forEach((figure) => {
      const codeCell = figure.querySelector("td.code");
      const codePre = codeCell ? codeCell.querySelector("pre") : figure.querySelector("pre");
      if (!codePre) return;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      const language = Array.from(figure.classList).find((name) => name !== "highlight");
      if (language) code.className = `language-${language}`;
      const lines = codePre.querySelectorAll(".line");
      if (lines.length) {
        code.innerHTML = Array.from(lines).map((line) => line.innerHTML).join("\n");
      } else {
        code.innerHTML = codePre.innerHTML;
      }
      pre.appendChild(code);
      figure.replaceWith(pre);
    });

    root.querySelectorAll(".gutter, .line-numbers, .line-number").forEach((node) => node.remove());

    root.querySelectorAll("li").forEach((item) => {
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

    root.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let pdfUrl = null;
      try {
        const candidate = new URL(href, window.location.href);
        if (/\.pdf$/i.test(candidate.pathname)) pdfUrl = candidate;
      } catch (_) {
        // Leave malformed or non-URL links unchanged.
      }
      if (pdfUrl) {
        const label = (link.textContent || pdfUrl.pathname.split("/").pop() || "PDF document").trim();
        const viewer = new URL("./pdf-viewer.html", window.location.href);
        viewer.searchParams.set("file", `${pdfUrl.pathname}${pdfUrl.search}`);
        viewer.searchParams.set("title", label);
        link.classList.add("pdf-attachment");
        link.href = viewer.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.setAttribute("aria-label", `Preview PDF: ${label}`);
        link.innerHTML = `<span class="pdf-attachment-mark" aria-hidden="true">PDF</span><span class="pdf-attachment-copy"><strong>${escapeHtml(label)}</strong><small>Open document preview</small></span><span class="pdf-attachment-arrow" aria-hidden="true">↗</span>`;
        return;
      }
      link.target = "_blank";
      link.rel = "noreferrer";
    });

    root.querySelectorAll("img").forEach((img) => {
      img.loading = "lazy";
      img.decoding = "async";
      if (!img.alt) img.alt = "Blog image";
      const style = img.getAttribute("style") || "";
      if (stableFlowImageMode && /position\s*:\s*absolute/i.test(style)) {
        img.removeAttribute("style");
        img.removeAttribute("data-editor-width");
        img.removeAttribute("data-image-reserve");
        img.removeAttribute("data-image-layer");
        img.classList.remove("writer-image-reservation");
      }
      isolateFlowImage(img);
      const isWriterPlaced = !stableFlowImageMode && img.hasAttribute("data-editor-width");
      const looksLegacyPositioned = /position\s*:\s*absolute/i.test(style) && !isWriterPlaced;
      img.removeAttribute("height");
      if (looksLegacyPositioned) {
        img.classList.add("legacy-media");
        img.removeAttribute("width");
        img.removeAttribute("style");
      } else {
        img.style.height = "auto";
        img.style.objectFit = "contain";
        img.style.maxWidth = "100%";
      }
      const reserve = stableFlowImageMode ? 0 : Math.max(0, Number.parseFloat(img.getAttribute("data-image-reserve") || "0") || 0);
      const layer = Math.max(1, Math.min(99, Number.parseInt(img.getAttribute("data-image-layer") || "2", 10) || 2));
      if (stableFlowImageMode) img.style.removeProperty("z-index");
      else img.style.zIndex = String(layer);
      if (!/position\s*:\s*absolute/i.test(style) && reserve > 0) {
        img.style.marginBottom = `calc(1em + ${Math.round(reserve)}px)`;
      }
      img.addEventListener("error", () => {
        if (img.nextElementSibling?.classList.contains("article-image-fallback")) return;
        const fallback = document.createElement("a");
        fallback.className = "article-image-fallback";
        fallback.href = img.currentSrc || img.src;
        fallback.target = "_blank";
        fallback.rel = "noreferrer";
        fallback.textContent = "Image could not be loaded. Open the original image.";
        img.hidden = true;
        img.insertAdjacentElement("afterend", fallback);
      }, { once: true });
    });

    root.querySelectorAll("table").forEach((table) => {
      if (table.closest("figure.highlight")) return;
      if (table.parentElement && table.parentElement.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.closest(".code-block")) return;
      const wrap = document.createElement("div");
      wrap.className = "code-block";
      const button = document.createElement("button");
      button.className = "code-copy-button";
      button.type = "button";
      button.textContent = "Copy";
      button.setAttribute("aria-label", "Copy code");
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(button);
      wrap.appendChild(pre);
    });
  }

  function fitAbsoluteImages(root) {
    const normalize = () => {
      const rootWidth = root.clientWidth || root.getBoundingClientRect().width || 0;
      if (!rootWidth) return;
      const editorBaseWidth = 920;
      const scale = Math.min(1, rootWidth / editorBaseWidth);
      const visualPadding = 12;
      root.querySelectorAll('img[style*="position: absolute"]').forEach((img) => {
        if (!img.dataset.originalFreeStyle) img.dataset.originalFreeStyle = img.getAttribute("style") || "";
        const style = img.dataset.originalFreeStyle || img.getAttribute("style") || "";
        const widthMatch = /width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(style);
        const leftMatch = /left\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
        const topMatch = /top\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec(style);
        const widthPct = widthMatch ? Math.max(10, Math.min(100, Number.parseFloat(widthMatch[1]))) : 42;
        const rawLeft = leftMatch ? Number.parseFloat(leftMatch[1]) : 0;
        const rawTop = topMatch ? Number.parseFloat(topMatch[1]) : 0;
        const width = Math.min(rootWidth - visualPadding, Math.max(80, rootWidth * (widthPct / 100)));
        const maxLeft = Math.max(0, rootWidth - width - visualPadding);
        const left = Math.max(0, Math.min(maxLeft, rawLeft * scale));
        const top = Math.max(0, rawTop * scale);
        const reserve = Math.max(0, Number.parseFloat(img.getAttribute("data-image-reserve") || "0") || 0) * scale;
        img.style.boxSizing = "border-box";
        img.style.width = `${Math.round(width)}px`;
        img.style.left = `${Math.round(left)}px`;
        img.style.top = `${Math.round(top)}px`;
        img.style.maxWidth = `calc(100% - ${visualPadding}px)`;
        if (reserve > 0) {
          const block = img.closest("p, li, blockquote, figure, div");
          if (block && block !== root) {
            block.style.minHeight = `${Math.ceil(reserve)}px`;
            block.classList.add("writer-image-reservation");
          }
        }
      });
    };
    const update = () => {
      normalize();
      const rootRect = root.getBoundingClientRect();
      let bottom = 0;
      root.querySelectorAll('img[style*="position: absolute"]').forEach((img) => {
        const rect = img.getBoundingClientRect();
        bottom = Math.max(bottom, rect.bottom - rootRect.top);
      });
      if (bottom > 0) {
        root.style.minHeight = `${Math.ceil(bottom + 32)}px`;
      }
    };
    update();
    root.querySelectorAll('img[style*="position: absolute"]').forEach((img) => {
      if (!img.complete) img.addEventListener("load", update, { once: true });
    });
  }

  function resolveArticleUrls(root, baseUrl) {
    root.querySelectorAll("a[href], img[src], img[data-src], source[src], video[src]").forEach((node) => {
      ["href", "src", "data-src"].forEach((attr) => {
        const value = node.getAttribute(attr);
        if (!value || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) return;
        try {
          node.setAttribute(attr, new URL(value, baseUrl).href);
        } catch (_) {
          // Keep the original value if the legacy page used a non-URL token.
        }
      });
    });
  }

  function extractLegacyArticle(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const article = doc.querySelector('.post-body[itemprop="articleBody"], .post-body, article .post-content');
    if (!article) return "";
    article.querySelectorAll("script, style, iframe").forEach((node) => node.remove());
    resolveArticleUrls(article, baseUrl);
    return article.innerHTML.trim();
  }

  function mathDelimiters() {
    return [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false }
    ];
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

  function normalizeOverindentedFences(markdown) {
    const lines = String(markdown || "").split("\n");
    const output = [];
    for (let index = 0; index < lines.length; index += 1) {
      const opening = /^([ \t]{4,})(`{3,}|~{3,})(.*)$/.exec(lines[index]);
      if (!opening) {
        output.push(lines[index]);
        continue;
      }
      let closingIndex = -1;
      let closing = null;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const candidate = /^([ \t]*)(`{3,}|~{3,})\s*$/.exec(lines[cursor]);
        if (candidate && candidate[2][0] === opening[2][0]) {
          closingIndex = cursor;
          closing = candidate;
          break;
        }
      }
      if (closingIndex < 0 || closing[1].length >= opening[1].length) {
        output.push(lines[index]);
        continue;
      }
      output.push(`${opening[2]}${opening[3]}`);
      for (let cursor = index + 1; cursor < closingIndex; cursor += 1) {
        const line = lines[cursor];
        output.push(line.startsWith(opening[1]) ? line.slice(opening[1].length) : line);
      }
      output.push(closing[2]);
      index = closingIndex;
    }
    return output.join("\n");
  }

  function repairEscapedInlineCode(markdown) {
    let fence = "";
    return String(markdown || "").split("\n").map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line);
      if (marker) {
        const type = marker[1][0];
        if (!fence) fence = type;
        else if (fence === type) fence = "";
        return line;
      }
      if (fence) return line;
      return line.replace(/\\`([^`\n]+?)\\`/g, (_match, code) => `\`${code}\``);
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

  function removeTrailingEmptyRenderedNodes(root) {
    const cleanTail = (container) => {
      let node = container.lastChild;
      while (node) {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
          node.remove();
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (/^(ARTICLE|MAIN|SECTION|DIV)$/i.test(node.tagName)) cleanTail(node);
          const visuallyEmpty = /^(BR|P|DIV|SECTION)$/i.test(node.tagName)
            && !node.textContent.trim()
            && !node.querySelector("img, video, iframe, canvas, svg, table, pre, code, hr");
          if (visuallyEmpty) node.remove();
          else break;
        } else {
          break;
        }
        node = container.lastChild;
      }
    };
    cleanTail(root);
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

  function setArticleHtml(html) {
    content.innerHTML = html;
    removeTrailingEmptyRenderedNodes(content);
    normalizeArticle(content);
    const finishMath = () => {
      repairLegacyMixedMath(content);
      rebuildLegacyKatex(content);
      if (window.renderMathInElement) {
        window.renderMathInElement(content, {
          delimiters: mathDelimiters(),
          throwOnError: false,
          preProcess: normalizeMathTexShortcuts
        });
      }
      content.dataset.mathNormalized = "true";
    };
    finishMath();
    window.requestAnimationFrame(finishMath);
    window.setTimeout(finishMath, 250);
    if (window.MichelCodeHighlight) {
      window.MichelCodeHighlight.highlightAll(content);
    } else if (window.hljs) {
      content.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
    }
    if (!stableFlowImageMode) fitAbsoluteImages(content);
    window.MichelAnnotations?.enhance(content);
    window.MichelFoldBlocks?.enhance(content);
  }

  function renderMarkdownPost(markdown) {
    if (!window.markdownit) {
      const fallbackHtml = String(markdown || "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .split(/\n{2,}/)
        .map((block) => {
          const lines = block.split("\n");
          const heading = /^(#{1,6})\s+(.+)$/.exec(lines[0]);
          if (heading && lines.length === 1) {
            const level = heading[1].length;
            return `<h${level}>${escapeHtml(heading[2])}</h${level}>`;
          }
          if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
            return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\s*[-*+]\s+/, ""))}</li>`).join("")}</ul>`;
          }
          return `<p>${lines.map((line) => escapeHtml(line)).join("<br>")}</p>`;
        })
        .join("");
      setArticleHtml(fallbackHtml || '<p class="empty-note">This article could not be rendered.</p>');
      return;
    }
    const md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true
    });
    const normalizedMarkdown = normalizeMathShortcutsInMarkdown(
      preserveVisualIndentation(separateLooseTextLines(separateIntentionalParagraphs(separateStandaloneHtmlBreaks(normalizeOverindentedFences(repairEscapedInlineCode(trimTrailingEmptyContent(markdown)))))))
    );
    const rawHtml = md.render(window.MichelFoldBlocks ? window.MichelFoldBlocks.expand(normalizedMarkdown, md) : normalizedMarkdown);
    const cleanHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ["details", "summary"],
      ADD_ATTR: ["target", "rel", "style", "width", "height", "class", "aria-label", "data-editor-width", "data-image-reserve", "data-image-layer", "data-writer-spacer", "data-fold-block"]
    }) : rawHtml;
    setArticleHtml(cleanHtml);
  }

  function loadLegacyContent(post) {
    if (!post.source) return Promise.reject(new Error("Missing legacy source"));
    content.innerHTML = '<p class="empty-note">Loading full article...</p>';
    return fetch(post.source, { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`Legacy source returned ${response.status}`);
        return response.text().then((html) => ({ html, url: response.url || post.source }));
      })
      .then(({ html, url }) => {
        const extracted = extractLegacyArticle(html, url);
        if (!extracted) throw new Error("Could not find legacy article body");
        setArticleHtml(extracted);
      });
  }

  function copyWithFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    } finally {
      textarea.remove();
    }
  }

  function bindCodeCopy(root) {
    root.addEventListener("click", (event) => {
      const button = event.target.closest(".code-copy-button");
      if (!button || !root.contains(button)) return;
      const pre = button.parentElement.querySelector("pre");
      const text = pre ? pre.innerText.replace(/\n$/, "") : "";
      const write = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(text)
        : copyWithFallback(text);
      write.then(() => {
        button.textContent = "Copied";
        button.classList.add("is-copied");
        window.setTimeout(() => {
          button.textContent = "Copy";
          button.classList.remove("is-copied");
        }, 1500);
      }, () => {
        button.textContent = "Failed";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1500);
      });
    });
  }

  function setupBookReading() {
    const bookSlug = String(post?.bookSlug || "").trim();
    if (!bookSlug) return;
    const chapters = authoredPosts
      .filter((item) => String(item?.bookSlug || "") === bookSlug)
      .sort((a, b) => {
        const order = Number(a.chapterOrder || 0) - Number(b.chapterOrder || 0);
        return order || String(a.date || "").localeCompare(String(b.date || "")) || String(a.title || "").localeCompare(String(b.title || ""));
      });
    const chapterIndex = chapters.findIndex((item) => item.slug === post.slug);
    if (chapterIndex < 0) return;
    const bookTitle = post.bookTitle || chapters.find((item) => item.bookTitle)?.bookTitle || bookSlug;
    const contentsHref = `./book.html?book=${encodeURIComponent(bookSlug)}`;
    const chapterHref = (item) => `./post.html?slug=${encodeURIComponent(item.slug)}`;
    const progressKey = `michel-book-progress-v1:${bookSlug}${english ? ':en' : ''}`;
    let savedProgress = null;
    try {
      savedProgress = JSON.parse(window.localStorage.getItem(progressKey) || "null");
    } catch (_) {
      savedProgress = null;
    }

    const context = document.createElement("nav");
    context.className = "book-reader-context";
    context.setAttribute("aria-label", english ? "Book reading position" : "书籍阅读位置");
    const contentsLink = document.createElement("a");
    contentsLink.href = contentsHref;
    contentsLink.textContent = bookTitle;
    const position = document.createElement("span");
    position.textContent = english ? `Chapter ${chapterIndex + 1} of ${chapters.length}` : `第 ${chapterIndex + 1} / ${chapters.length} 章`;
    context.append(contentsLink, position);
    content.before(context);

    const navigation = document.createElement("nav");
    navigation.className = "book-reader-navigation";
    navigation.setAttribute("aria-label", english ? "Chapter navigation" : "章节导航");
    const previous = chapters[chapterIndex - 1];
    const next = chapters[chapterIndex + 1];
    if (previous) {
      const previousLink = document.createElement("a");
      previousLink.href = chapterHref(previous);
      previousLink.textContent = `← ${previous.title}`;
      navigation.append(previousLink);
    } else {
      navigation.append(document.createElement("span"));
    }
    const directoryLink = document.createElement("a");
    directoryLink.href = contentsHref;
    directoryLink.textContent = english ? "Contents" : "目录";
    navigation.append(directoryLink);
    if (next) {
      const nextLink = document.createElement("a");
      nextLink.href = chapterHref(next);
      nextLink.textContent = `${next.title} →`;
      navigation.append(nextLink);
    } else {
      navigation.append(document.createElement("span"));
    }
    postFooter.before(navigation);
    sourceLink.href = contentsHref;
    sourceLink.textContent = english ? "Back to contents" : "返回目录";
    postFooter.hidden = false;

    const saveProgress = () => {
      const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = {
        chapterSlug: post.slug,
        scrollRatio: Math.max(0, Math.min(1, window.scrollY / maximum)),
        updatedAt: new Date().toISOString()
      };
      try {
        window.localStorage.setItem(progressKey, JSON.stringify(progress));
      } catch (_) {
        // Reading still works when storage is unavailable.
      }
    };
    let progressTimer = 0;
    window.addEventListener("scroll", () => {
      window.clearTimeout(progressTimer);
      progressTimer = window.setTimeout(saveProgress, 350);
    }, { passive: true });
    window.addEventListener("pagehide", saveProgress);

    if (params.get("resume") === "1" && savedProgress?.chapterSlug === post.slug) {
      const ratio = Math.max(0, Math.min(1, Number(savedProgress.scrollRatio || 0)));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ top: maximum * ratio, behavior: "auto" });
      }));
    }
  }

  if (!post) {
    makeErrorPage();
    return;
  }

  recordPostView();
  setupHtmlReadingWidthControl();

  bindCodeCopy(content);

  const safeTitle = post.title || "Untitled";
  const safeCategory = post.category || "Note";
  const safeDate = post.date || "Undated";

  document.title = `${safeTitle} · Michel Johnson`;
  meta.textContent = `${safeCategory} · ${safeDate}`;
  title.textContent = safeTitle;
  if (/[^\x00-\x7F]/.test(safeTitle)) title.classList.add("is-cjk-title");
  const translationPending = english && post.translationStatus !== 'ready';
  excerpt.textContent = translationPending ? '' : plainTextSummary(post.excerpt) || summaryFromMarkdown(post.markdown) || "";
  if (translationPending) excerpt.hidden = true;
  if (post.markdown) {
    renderMarkdownPost(post.markdown);
  } else if (post.content) {
    setArticleHtml(post.content);
  } else if (post.source) {
    loadLegacyContent(post).catch(() => {
      setArticleHtml(post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : "<p>This post has no extracted content yet.</p>");
    });
  } else {
    setArticleHtml(post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : "<p>This post has no extracted content yet.</p>");
  }

  if (editButton) {
    editButton.hidden = english;
    editButton.addEventListener("click", beginEdit);
  }

  if (pinButton) {
    renderPinState();
    pinButton.addEventListener("click", beginPinToggle);
  }

  setupBookReading();

  if (post.authored) {
    if (!post.bookSlug) {
      sourceLink.href = "./?home=1#blog";
      sourceLink.textContent = "Back to blog shelf";
    }
    postFooter.hidden = false;
  }

  editClose?.addEventListener("click", closeEditModal);
  editModal?.addEventListener("click", (event) => {
    if (event.target === editModal) closeEditModal();
  });
  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(editForm).get("password");
    if (editStatus) editStatus.textContent = "Checking...";
    try {
      await adminApi("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (pendingAdminAction === "pin") {
        closeEditModal();
        await setPinState();
      } else {
        window.location.href = editAdminHref();
      }
    } catch (error) {
      if (editStatus) editStatus.textContent = error.message;
    }
  });
})();
