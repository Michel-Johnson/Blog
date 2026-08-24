(function () {
  const backLink = document.querySelector("[data-editor-back]");
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get("return");
  const titleInput = document.querySelector("[data-post-title]");
  const titleSurface = titleInput?.closest(".reader-editor-title");
  const excerptInput = document.querySelector("[data-post-excerpt]");

  function syncReadingFields() {
    if (titleInput) {
      titleSurface?.classList.toggle("is-cjk-title", /[^\x00-\x7F]/.test(titleInput.value.trim()));
    }
    if (excerptInput) {
      excerptInput.rows = 1;
      excerptInput.style.height = "auto";
      excerptInput.style.height = `${excerptInput.scrollHeight}px`;
    }
  }

  titleInput?.addEventListener("input", syncReadingFields);
  excerptInput?.addEventListener("input", syncReadingFields);
  window.addEventListener("resize", syncReadingFields, { passive: true });
  window.requestAnimationFrame(syncReadingFields);
  window.setTimeout(syncReadingFields, 250);
  window.setTimeout(syncReadingFields, 900);

  if (returnUrl && backLink) {
    try {
      const target = new URL(returnUrl, window.location.href);
      if (target.origin === window.location.origin || ["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
        backLink.href = target.href;
        backLink.textContent = "Back to article";
      }
    } catch (_) {
      // Keep the blog shelf fallback for malformed return URLs.
    }
  }

  let editorScrollReset = false;
  const resetInitialEditorScroll = (force = false) => {
    if (editorScrollReset && !force) return;
    const editor = document.querySelector(".rich-editor .ProseMirror");
    const scrollTargets = document.querySelectorAll(
      ".toastui-editor-main, .toastui-editor-main-container, .toastui-editor-ww-container, .rich-editor .ProseMirror"
    );
    if (!scrollTargets.length || !editor || !editor.textContent.trim()) return;
    scrollTargets.forEach((node) => {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    });
    editorScrollReset = true;
  };

  const editorObserver = new MutationObserver(() => {
    window.requestAnimationFrame(resetInitialEditorScroll);
    if (editorScrollReset) editorObserver.disconnect();
  });
  const richEditor = document.querySelector("[data-rich-editor]");
  if (richEditor) {
    editorObserver.observe(richEditor, { childList: true, subtree: true });
    window.setTimeout(() => resetInitialEditorScroll(true), 250);
    window.setTimeout(() => resetInitialEditorScroll(true), 900);
    window.setTimeout(() => resetInitialEditorScroll(true), 1600);
  }

  const saveStatus = document.querySelector("[data-save-status]");
  if (saveStatus) {
    const statusObserver = new MutationObserver(() => {
      if (!/Editing:|Imported legacy Markdown:|Ready/.test(saveStatus.textContent || "")) return;
      syncReadingFields();
      window.setTimeout(() => resetInitialEditorScroll(true), 0);
      window.setTimeout(syncReadingFields, 0);
      window.setTimeout(() => resetInitialEditorScroll(true), 320);
      window.setTimeout(syncReadingFields, 320);
      window.setTimeout(() => resetInitialEditorScroll(true), 900);
      window.setTimeout(syncReadingFields, 900);
      statusObserver.disconnect();
    });
    statusObserver.observe(saveStatus, { childList: true, subtree: true, characterData: true });
  }

})();
