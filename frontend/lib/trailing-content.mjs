const trailingBreakLine = /(?:^|\n)[ \t]*(?:<br\s*\/?>|<(p|div)>[ \t]*(?:<br\s*\/?>)?[ \t]*<\/\1>)[ \t]*$/i;

export function trimTrailingEmptyContent(value) {
  let output = String(value || "").replace(/\r\n?/g, "\n");
  let previous = "";
  while (output !== previous) {
    previous = output;
    output = output.replace(/[ \t]+$/gm, "").replace(/\n+$/, "");
    output = output.replace(trailingBreakLine, "");
  }
  return output;
}
