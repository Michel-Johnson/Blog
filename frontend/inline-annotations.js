(function () {
  const PREFIX = "#michel-note-v1:";

  function encode(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload || {}));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return PREFIX + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decode(href) {
    const value = String(href || "");
    const marker = value.indexOf(PREFIX);
    if (marker < 0) return null;
    try {
      const token = value.slice(marker + PREFIX.length).split(/[?#&]/)[0];
      const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((token.length + 3) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      return payload && typeof payload === "object" ? payload : null;
    } catch (_) {
      return null;
    }
  }

  function closeAll(root = document) {
    root.querySelectorAll(".article-annotation.is-open").forEach((node) => {
      node.classList.remove("is-open");
      node.setAttribute("aria-expanded", "false");
    });
    document.body.classList.remove("has-open-article-annotation");
  }

  function makePopover(payload) {
    const popover = document.createElement("span");
    popover.className = "article-annotation-popover";
    popover.setAttribute("role", "tooltip");

    const kicker = document.createElement("span");
    kicker.className = "article-annotation-kicker";
    kicker.textContent = payload.type === "source" ? "Source" : payload.type === "definition" ? "Definition" : "Note";
    popover.appendChild(kicker);

    if (payload.title) {
      const title = document.createElement("strong");
      title.textContent = payload.title;
      popover.appendChild(title);
    }
    if (payload.body) {
      const body = document.createElement("span");
      body.className = "article-annotation-body";
      body.textContent = payload.body;
      popover.appendChild(body);
    }
    if (payload.url) {
      const link = document.createElement("a");
      link.href = payload.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = payload.label || "Open source";
      link.addEventListener("click", (event) => event.stopPropagation());
      popover.appendChild(link);
    }
    return popover;
  }

  function positionPopover(trigger) {
    const popover = trigger.querySelector(".article-annotation-popover");
    if (!popover) return;
    if (window.matchMedia("(max-width: 720px), (hover: none)").matches) {
      popover.style.removeProperty("left");
      popover.style.removeProperty("top");
      return;
    }
    window.requestAnimationFrame(() => {
      if (!popover.isConnected) return;
      popover.style.left = "0px";
      popover.style.top = "0px";
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const inset = 14;
      const gap = 12;
      const maxLeft = Math.max(inset, window.innerWidth - inset - popoverRect.width);
      const left = Math.min(
        maxLeft,
        Math.max(inset, triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2),
      );
      let top = triggerRect.top - popoverRect.height - gap;
      if (top < inset) top = triggerRect.bottom + gap;
      top = Math.min(
        Math.max(inset, top),
        Math.max(inset, window.innerHeight - inset - popoverRect.height),
      );
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
    });
  }

  function enhance(root) {
    if (!root) return;
    let enhanced = false;
    root.querySelectorAll(`a[href*="${PREFIX}"]`).forEach((link) => {
      if (link.dataset.annotationEnhanced === "true") return;
      const payload = decode(link.getAttribute("href"));
      if (!payload) return;
      const trigger = document.createElement("span");
      trigger.className = "article-annotation";
      trigger.tabIndex = 0;
      trigger.setAttribute("aria-haspopup", "true");
      trigger.setAttribute("aria-expanded", "false");
      trigger.dataset.annotationHref = link.getAttribute("href") || "";
      trigger.dataset.annotationOrigin = payload.origin === "glm" ? "glm" : "author";
      trigger.append(...Array.from(link.childNodes));
      trigger.appendChild(makePopover(payload));
      let pointerStart = null;
      let dragged = false;
      const togglePinned = () => {
        const open = !trigger.classList.contains("is-open");
        closeAll(document);
        trigger.classList.toggle("is-open", open);
        trigger.setAttribute("aria-expanded", String(open));
        document.body.classList.toggle("has-open-article-annotation", open);
        if (open) positionPopover(trigger);
      };
      trigger.addEventListener("pointerdown", (event) => {
        pointerStart = { x: event.clientX, y: event.clientY };
        dragged = false;
      });
      trigger.addEventListener("pointermove", (event) => {
        if (!pointerStart) return;
        if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) dragged = true;
      });
      trigger.addEventListener("pointerup", () => { pointerStart = null; });
      trigger.addEventListener("pointerenter", () => positionPopover(trigger));
      trigger.addEventListener("focus", () => positionPopover(trigger));
      trigger.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        const selection = window.getSelection();
        if (dragged || (selection && !selection.isCollapsed)) {
          dragged = false;
          return;
        }
        event.stopPropagation();
        togglePinned();
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        togglePinned();
      });
      link.dataset.annotationEnhanced = "true";
      link.replaceWith(trigger);
      enhanced = true;
    });
    if (enhanced || root.querySelector(".article-annotation")) {
      root.classList.add("has-inline-annotations");
      root.closest(".post-paper, .admin-preview-paper")?.classList.add("has-inline-annotations");
    }
  }

  function repositionVisiblePopovers() {
    document.querySelectorAll(".article-annotation").forEach((trigger) => {
      if (trigger.classList.contains("is-open") || trigger.matches(":hover") || trigger.contains(document.activeElement)) {
        positionPopover(trigger);
      }
    });
  }

  document.addEventListener("click", () => closeAll(document));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll(document);
  });
  window.addEventListener("resize", repositionVisiblePopovers, { passive: true });
  window.addEventListener("scroll", repositionVisiblePopovers, { passive: true, capture: true });

  window.MichelAnnotations = { PREFIX, encode, decode, enhance, closeAll };
})();
