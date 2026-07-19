(function () {
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
  const mountedPosts = (Array.isArray(window.MICHEL_POSTS) ? window.MICHEL_POSTS : []).concat(authoredPosts);
  const allPosts = (Array.isArray(window.MICHEL_ALL_POSTS) ? window.MICHEL_ALL_POSTS : []).concat(authoredPosts);
  const postsBySlug = new Map();
  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\u3400-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
  }
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
  const sourceLink = document.getElementById("source-link");
  const editButton = document.querySelector("[data-edit-post]");
  const pinButton = document.querySelector("[data-pin-post]");
  const editModal = document.querySelector("[data-edit-modal]");
  const editForm = document.querySelector("[data-edit-form]");
  const editClose = document.querySelector("[data-edit-close]");
  const editStatus = document.querySelector("[data-edit-status]");
  const editHeading = document.querySelector("[data-edit-heading]");
  const editCopy = document.querySelector("[data-edit-copy]");
  const editSubmit = document.querySelector("[data-edit-submit]");
  let initialPinnedPosts = Array.isArray(window.MICHEL_PINNED_POSTS) ? window.MICHEL_PINNED_POSTS : [];
  try {
    const localPins = JSON.parse(window.localStorage.getItem("michel:pinned-posts") || "null");
    if (Array.isArray(localPins)) initialPinnedPosts = localPins;
  } catch (_) {
    // Use the generated pin file when storage is unavailable.
  }
  const pinnedPostSet = new Set(initialPinnedPosts);
  let pinIsActive = Boolean(post && [post.slug, post.originalSlug, slug].some((value) => pinnedPostSet.has(String(value || "").trim())));
  let pendingAdminAction = "edit";
  let adminCsrfToken = "";

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
      if (Array.isArray(result.pins)) {
        window.localStorage.setItem("michel:pinned-posts", JSON.stringify(result.pins));
      }
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

  function normalizeArticle(root) {
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
      const isWriterPlaced = img.hasAttribute("data-editor-width");
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
        img.style.boxSizing = "border-box";
        img.style.width = `${Math.round(width)}px`;
        img.style.left = `${Math.round(left)}px`;
        img.style.top = `${Math.round(top)}px`;
        img.style.maxWidth = `calc(100% - ${visualPadding}px)`;
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

  function setArticleHtml(html) {
    content.innerHTML = html;
    normalizeArticle(content);
    if (window.renderMathInElement) {
      window.renderMathInElement(content, {
        delimiters: mathDelimiters(),
        throwOnError: false,
        preProcess: normalizeMathTexShortcuts
      });
    }
    if (window.hljs) {
      content.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
    }
    fitAbsoluteImages(content);
    window.MichelAnnotations?.enhance(content);
  }

  function renderMarkdownPost(markdown) {
    if (!window.markdownit) {
      setArticleHtml(`<pre><code>${escapeHtml(markdown)}</code></pre>`);
      return;
    }
    const md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true
    });
    const rawHtml = md.render(normalizeMathShortcutsInMarkdown(preserveVisualIndentation(markdown)));
    const cleanHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ["target", "rel", "style", "width", "height", "class", "aria-label"]
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

  if (!post) {
    makeErrorPage();
    return;
  }

  bindCodeCopy(content);

  const safeTitle = post.title || "Untitled";
  const safeCategory = post.category || "Note";
  const safeDate = post.date || "Undated";

  document.title = `${safeTitle} · Michel Johnson`;
  meta.textContent = `${safeCategory} · ${safeDate}`;
  title.textContent = safeTitle;
  if (/[^\x00-\x7F]/.test(safeTitle)) title.classList.add("is-cjk-title");
  excerpt.textContent = plainTextSummary(post.excerpt) || summaryFromMarkdown(post.markdown) || "";
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
    editButton.hidden = false;
    editButton.addEventListener("click", beginEdit);
  }

  if (pinButton) {
    renderPinState();
    pinButton.addEventListener("click", beginPinToggle);
  }

  if (post.authored) {
    sourceLink.href = "./?home=1#blog";
    sourceLink.textContent = "Back to blog shelf";
  } else if (post.source) {
    sourceLink.href = post.source;
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";
    sourceLink.textContent = "Open archived source";
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
