// Marker ranges are resolved against Markdown offsets, never editor node positions.
export function foldNearMention(source, context = {}) {
  let anchor = context.markdownPosition;
  if (!Number.isInteger(anchor) || anchor < 0 || !/^@jerry\b/i.test(source.slice(anchor))) {
    const mentions = [...source.matchAll(/@jerry\b/gi)];
    if (mentions.length === 1) anchor = mentions[0].index;
    else return { reply: "无法确认 @jerry 的位置，请在标记范围旁重新 @jerry。", edits: [] };
  }
  const ranges = [], stack = [];
  let offset = 0, fence = null, folded = false;
  for (const line of source.split('\n')) {
    const clean = line.trim();
    const delimiter = /^(`{3,}|~{3,})/.exec(clean)?.[1];
    if (delimiter) {
      if (!fence) fence = delimiter;
      else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = null;
    } else if (!fence && clean === '$$fold') folded = true;
    else if (folded && clean === '$$') folded = false;
    else if (!fence && !folded) {
      const masked = line.replace(/(`+).*?\1/g, m => ' '.repeat(m.length));
      for (let i = 0; i < masked.length; i++) {
        const ch = masked[i];
        if (ch === '[') stack.push({start: offset+i-(masked[i-1]==='\\'?1:0), bodyStart:offset+i+1, invalid:masked[i-1]==='!' || masked[i+1]==='^'});
        if (ch === ']' && stack.length) {
          const begin = stack.pop();
          const end = offset+i+1;
          const link = /^[\t ]*[([:]/.test(source.slice(end));
          if (!begin.invalid && !link) ranges.push({...begin,bodyEnd:offset+i-(masked[i-1]==='\\'?1:0),end});
        }
      }
    }
    offset += line.length+1;
  }
  if (!ranges.length) return { reply: "请用 [ 和 ] 圈住要折叠的内容，再在旁边 @jerry 折叠。多段内容可把标记各放一行。", edits: [] };
  const distance = r => anchor < r.start ? r.start - anchor : anchor > r.end ? anchor - r.end : 0;
  ranges.sort((a,b) => distance(a)-distance(b) || (a.end-a.start)-(b.end-b.start));
  const range = ranges[0];
  if (ranges[1] && distance(range) === distance(ranges[1]) && distance(range) > 0) {
    return { reply: "两组标记距离相同，请把 @jerry 放进需要折叠的那一组。", edits: [] };
  }
  const body = source.slice(range.bodyStart, range.bodyEnd).replace(/@jerry\b[^\n]*/gi, '').trim();
  if (!body) return { reply: "标记范围内没有正文。", edits: [] };
  const title = body.replace(/[#*`_>]/g, '').split('\n').find(s => s.trim())?.trim().slice(0,24) || '折叠内容';
  const mention = anchor >= range.start && anchor <= range.end ? '\n\n@jerry ' : '';
  return { reply: "已折叠你所在位置附近的标记内容。", edits: [{
    start: range.start, find: source.slice(range.start, range.end),
    replace: (range.start > 0 && source[range.start-1] !== '\n' ? '\n\n' : '') + '$$fold\n' + JSON.stringify({ v:1, title, markdown:body }) + '\n$$' + mention + (range.end < source.length && source[range.end] !== '\n' ? '\n\n' : '')
  }] };
}
