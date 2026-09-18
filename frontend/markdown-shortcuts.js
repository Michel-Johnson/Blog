(function () {
  "use strict";

  function match(value, options = {}) {
    const marker = String(value || "");
    const inListItem = Boolean(options.inListItem);

    if (inListItem && /^\s*\[(?: |x|X)\]$/.test(marker)) {
      return { command: "taskList" };
    }
    if (inListItem) return null;

    const heading = /^\s{0,3}(#{1,6})$/.exec(marker);
    if (heading) return { command: "heading", payload: { level: heading[1].length } };
    if (/^\s{0,3}[-+*]$/.test(marker)) return { command: "bulletList" };
    if (/^\s{0,3}\d+[.)]$/.test(marker)) return { command: "orderedList" };
    if (/^\s{0,3}>$/.test(marker)) return { command: "blockQuote" };
    return null;
  }

  window.MichelMarkdownShortcuts = Object.freeze({ match });
})();
