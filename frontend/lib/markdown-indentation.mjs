export function encodeIntentionalParagraphIndents(markdown) {
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
