(function () {
  "use strict";

  const aliases = Object.freeze({
    asm: "x86asm",
    bash: "bash",
    c: "c",
    "c#": "csharp",
    "c++": "cpp",
    cs: "csharp",
    csharp: "csharp",
    docker: "dockerfile",
    dockerfile: "dockerfile",
    erl: "erlang",
    ex: "elixir",
    fs: "fsharp",
    fsharp: "fsharp",
    golang: "go",
    html: "xml",
    js: "javascript",
    jsx: "javascript",
    kt: "kotlin",
    kts: "kotlin",
    md: "markdown",
    objc: "objectivec",
    "objective-c": "objectivec",
    plaintext: "plaintext",
    proto: "protobuf",
    ps1: "powershell",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    shell: "bash",
    shellsession: "shell",
    text: "plaintext",
    tex: "latex",
    ts: "typescript",
    tsx: "typescript",
    vue: "xml",
    yml: "yaml"
  });

  const localModules = new Set([
    "clojure", "cmake", "dart", "dockerfile", "elixir", "erlang", "fsharp",
    "gradle", "groovy", "haskell", "julia", "latex", "matlab", "nginx",
    "ocaml", "powershell", "protobuf", "scala", "vim", "x86asm"
  ]);

  const labels = Object.freeze({
    bash: "Shell", csharp: "C#", cpp: "C++", dockerfile: "Dockerfile",
    fsharp: "F#", javascript: "JavaScript", objectivec: "Objective-C",
    plaintext: "Text", powershell: "PowerShell", protobuf: "Protocol Buffers",
    typescript: "TypeScript", x86asm: "x86 Assembly", xml: "HTML / XML"
  });

  const loading = new Map();

  function normalizeName(value) {
    const name = String(value || "").trim().toLowerCase().replace(/^language-/, "");
    if (!/^[a-z0-9_+#.-]+$/.test(name)) return "";
    return aliases[name] || name;
  }

  function languageOf(code) {
    const className = String(code?.className || "");
    const match = /(?:^|\s)language-([^\s]+)/i.exec(className);
    return normalizeName(match?.[1]);
  }

  function displayName(language) {
    if (!language) return "";
    return labels[language] || language.replace(/(^|[-_])([a-z])/g, (_, prefix, letter) => `${prefix ? " " : ""}${letter.toUpperCase()}`);
  }

  function loadLanguage(language) {
    if (!language || !window.hljs || window.hljs.getLanguage(language)) return Promise.resolve(true);
    if (!localModules.has(language)) return Promise.resolve(false);
    if (loading.has(language)) return loading.get(language);

    const request = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `./assets/highlight/languages/${language}.min.js?v=11.9.0-local-1`;
      script.async = true;
      script.onload = () => resolve(Boolean(window.hljs?.getLanguage(language)));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    loading.set(language, request);
    return request;
  }

  function decorate(code, language) {
    if (!language) return;
    const pre = code.closest?.("pre");
    if (pre) pre.dataset.codeLanguage = displayName(language);
    const wrapper = pre?.closest?.(".code-block");
    if (!wrapper || wrapper.querySelector(".code-language-badge")) return;
    const badge = document.createElement("span");
    badge.className = "code-language-badge";
    badge.textContent = displayName(language);
    wrapper.prepend(badge);
  }

  function useCanonicalClass(code, language) {
    if (!language || !window.hljs?.getLanguage(language) || !code.classList) return;
    Array.from(code.classList).forEach((name) => {
      if (/^language-/i.test(name)) code.classList.remove(name);
    });
    code.classList.add(`language-${language}`);
  }

  async function highlightAll(root) {
    const scope = root || document;
    const blocks = Array.from(scope.querySelectorAll?.("pre code") || []);
    if (!window.hljs || !blocks.length) return;

    await Promise.all(Array.from(new Set(blocks.map(languageOf).filter(Boolean))).map(loadLanguage));
    blocks.forEach((code) => {
      const language = languageOf(code);
      decorate(code, language);
      if (language && !window.hljs.getLanguage(language)) {
        code.classList.add("hljs");
        return;
      }
      useCanonicalClass(code, language);
      try {
        window.hljs.highlightElement(code);
      } catch (_) {
        code.classList.add("hljs");
      }
    });
  }

  window.MichelCodeHighlight = Object.freeze({
    displayName,
    highlightAll,
    languageOf,
    normalizeName
  });
})();
