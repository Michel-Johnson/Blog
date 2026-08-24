(() => {
  const loginPanel = document.querySelector("[data-login-panel]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginError = document.querySelector("[data-login-error]");
  const workspace = document.querySelector("[data-private-workspace]");
  const logoutButton = document.querySelector("[data-logout]");
  const bookcase = document.querySelector("[data-private-bookcase]");
  const draftsContainer = document.querySelector("[data-private-drafts]");
  const publishedCount = document.querySelector("[data-published-count]");
  const draftCount = document.querySelector("[data-draft-count]");
  const publishedEmpty = document.querySelector("[data-published-empty]");
  const draftsEmpty = document.querySelector("[data-drafts-empty]");
  let csrfToken = "";

  const bookColors = ["#f3eddd", "#e3ece3", "#f1dddd", "#e4e2ed", "#f4e8bd", "#e6e0d5"];
  const leans = [-1.2, .4, -.5, 1, -.8, .6];

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Request failed");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setLocked(locked) {
    loginPanel.hidden = !locked;
    workspace.hidden = locked;
    logoutButton.hidden = locked;
    if (locked) {
      bookcase.querySelectorAll(".private-shelf-row").forEach((row) => row.remove());
      draftsContainer.querySelectorAll(".private-paper").forEach((paper) => paper.remove());
      publishedCount.textContent = "0 volumes";
      draftCount.textContent = "0 sheets";
      publishedEmpty.hidden = true;
      draftsEmpty.hidden = true;
    }
  }

  function identityOf(post) {
    return String(post.draftId || post.slug || "").trim();
  }

  function editorHref(post) {
    const identity = identityOf(post);
    return identity ? `./admin.html?edit=${encodeURIComponent(identity)}` : "./admin.html?new=1";
  }

  function readableTime(value) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return "Recently edited";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function titleLength(title) {
    return Array.from(String(title || "Untitled").replace(/\s+/g, "")).length;
  }

  function bookWidth(title) {
    const length = titleLength(title);
    return Math.round(Math.min(142, 76 + Math.log2(length + 1) * 15));
  }

  function isCjk(title) {
    return /[\u3400-\u9fff\uf900-\ufaff]/u.test(title);
  }

  function makeBook(post, index) {
    const title = String(post.title || "Untitled").trim() || "Untitled";
    const anchor = document.createElement("a");
    anchor.className = "private-book";
    anchor.href = editorHref(post);
    anchor.title = `Edit ${title}`;
    anchor.style.setProperty("--book-width", `${bookWidth(title)}px`);
    anchor.style.setProperty("--book-height", `${252 + (index % 4) * 12}px`);
    anchor.style.setProperty("--book-color", bookColors[index % bookColors.length]);
    anchor.style.setProperty("--book-lean", `${leans[index % leans.length]}deg`);

    const titleElement = document.createElement("span");
    titleElement.className = `private-book-title ${isCjk(title) ? "is-cjk" : "is-latin"}`;
    const titleInner = document.createElement("span");
    titleInner.textContent = title.length > 38 ? `${title.slice(0, 37)}…` : title;
    titleElement.append(titleInner);

    const meta = document.createElement("span");
    meta.className = "private-book-meta";
    meta.textContent = String(post.category || "Notes").slice(0, 8);
    anchor.append(titleElement, meta);
    return anchor;
  }

  function distributeBooks(posts) {
    const rows = [];
    let row = [];
    let used = 0;
    const target = 1050;
    posts.forEach((post) => {
      const width = bookWidth(post.title) + 8;
      if (row.length && used + width > target) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push(post);
      used += width;
    });
    if (row.length) rows.push(row);
    return rows;
  }

  function renderBooks(posts) {
    bookcase.querySelectorAll(".private-shelf-row").forEach((row) => row.remove());
    publishedEmpty.hidden = posts.length !== 0;
    publishedCount.textContent = `${posts.length} ${posts.length === 1 ? "volume" : "volumes"}`;
    distributeBooks(posts).forEach((rowPosts, rowIndex) => {
      const row = document.createElement("div");
      row.className = "private-shelf-row";
      rowPosts.forEach((post, index) => row.append(makeBook(post, rowIndex * 9 + index)));
      bookcase.append(row);
    });
  }

  function makePaper(post, index) {
    const anchor = document.createElement("a");
    anchor.className = "private-paper";
    anchor.href = editorHref(post);
    anchor.style.setProperty("--paper-tilt", `${[-.5, .35, -.2][index % 3]}deg`);

    const status = document.createElement("span");
    status.className = "private-paper-status";
    status.textContent = String(post.category || "Draft");
    const title = document.createElement("h3");
    title.textContent = String(post.title || "Untitled");
    const excerpt = document.createElement("p");
    excerpt.className = "private-paper-excerpt";
    excerpt.textContent = String(post.excerpt || "Continue writing this draft.");
    const time = document.createElement("time");
    time.className = "private-paper-time";
    time.textContent = readableTime(post.updatedAt || post.createdAt || post.date);
    anchor.append(status, title, excerpt, time);
    return anchor;
  }

  function renderDrafts(posts) {
    draftsContainer.querySelectorAll(".private-paper").forEach((paper) => paper.remove());
    draftsEmpty.hidden = posts.length !== 0;
    draftCount.textContent = `${posts.length} ${posts.length === 1 ? "sheet" : "sheets"}`;
    posts.forEach((post, index) => draftsContainer.append(makePaper(post, index)));
  }

  async function loadLibrary() {
    const payload = await request("/api/admin/posts?status=all");
    const posts = Array.isArray(payload.posts) ? payload.posts : [];
    renderBooks(posts.filter((post) => post.status !== "draft"));
    renderDrafts(posts.filter((post) => post.status === "draft"));
  }

  async function unlock(password) {
    const payload = await request("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    csrfToken = payload.csrfToken || "";
    await loadLibrary();
    setLocked(false);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    const submit = loginForm.querySelector("button[type=submit]");
    const idleLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Unlocking...";
    loginForm.setAttribute("aria-busy", "true");
    try {
      await unlock(new FormData(loginForm).get("password") || "");
      loginForm.reset();
    } catch (error) {
      loginError.textContent = error.status === 401 ? "That password did not unlock the library." : "The private library is unavailable.";
      loginError.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = idleLabel;
      loginForm.removeAttribute("aria-busy");
    }
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await request("/api/admin/logout", {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {}
      });
    } finally {
      csrfToken = "";
      setLocked(true);
    }
  });

  (async () => {
    try {
      const session = await request("/api/admin/session");
      csrfToken = session.csrfToken || "";
      await loadLibrary();
      setLocked(false);
    } catch (_) {
      setLocked(true);
    }
  })();
})();
