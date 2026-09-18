(async () => {
  if (window.MichelLanguage?.en) await window.MichelLanguage.ready;
  const english = window.MichelLanguage?.en === true;
  const params = new URLSearchParams(window.location.search);
  const bookSlug = String(params.get("book") || "").trim();
  const posts = (Array.isArray(window.MICHEL_AUTHORED_POSTS) ? window.MICHEL_AUTHORED_POSTS : [])
    .filter((post) => String(post?.bookSlug || "") === bookSlug)
    .sort((a, b) => {
      const order = Number(a.chapterOrder || 0) - Number(b.chapterOrder || 0);
      return order || String(a.date || "").localeCompare(String(b.date || "")) || String(a.title || "").localeCompare(String(b.title || ""));
    });
  const title = document.querySelector("[data-book-title]");
  const summary = document.querySelector("[data-book-summary]");
  const contents = document.querySelector("[data-book-contents]");
  const empty = document.querySelector("[data-book-empty]");
  const continueLink = document.querySelector("[data-book-continue]");
  const progressNote = document.querySelector("[data-book-progress-note]");
  const progressKey = `michel-book-progress-v1:${bookSlug}${english ? ':en' : ''}`;

  function readProgress() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(progressKey) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function chapterHref(post, resume = false) {
    const url = new URL("./post.html", window.location.href);
    url.searchParams.set("slug", post.slug);
    if (resume) url.searchParams.set("resume", "1");
    return window.MichelLanguage ? window.MichelLanguage.href(url.href) : url.href;
  }

  if (!bookSlug || !posts.length) {
    title.textContent = english ? "No chapters yet" : "这本书还没有目录";
    summary.textContent = "";
    empty.hidden = false;
    contents.hidden = true;
    return;
  }

  const bookTitle = posts.find((post) => post.bookTitle)?.bookTitle || bookSlug;
  const progress = readProgress();
  const lastIndex = Math.max(0, posts.findIndex((post) => post.slug === progress?.chapterSlug));
  const lastPost = posts[lastIndex] || posts[0];
  document.title = `${bookTitle} · Michel Johnson`;
  title.textContent = bookTitle;
  summary.textContent = english ? `${posts.length} ${posts.length === 1 ? 'chapter' : 'chapters'}. This contents page updates automatically.` : `共 ${posts.length} 章。章节更新后目录会自动同步。`;
  continueLink.href = chapterHref(lastPost, true);
  continueLink.hidden = false;
  continueLink.firstChild.textContent = english ? (progress ? "Continue reading " : "Start reading ") : (progress ? "继续阅读 " : "开始阅读 ");
  if (progress) {
    progressNote.textContent = english ? `Last read: Chapter ${lastIndex + 1} · ${lastPost.title}` : `上次读到：第 ${lastIndex + 1} 章 · ${lastPost.title}`;
    progressNote.hidden = false;
  }

  posts.forEach((post, index) => {
    const item = document.createElement("li");
    if (post.slug === progress?.chapterSlug) item.className = "is-last-read";
    const link = document.createElement("a");
    link.href = chapterHref(post);
    const chapterTitle = document.createElement("span");
    chapterTitle.className = "book-chapter-title";
    chapterTitle.textContent = post.title || `第 ${index + 1} 章`;
    const meta = document.createElement("span");
    meta.className = "book-chapter-meta";
    meta.textContent = post.date || "";
    link.append(chapterTitle, meta);
    item.append(link);
    contents.append(item);
  });
})();
