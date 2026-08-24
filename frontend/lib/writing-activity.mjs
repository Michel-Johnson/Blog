export function countWritingCharacters(value) {
  const text = String(value || "")
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, " $1 ")
    .replace(/```[\w-]*\n?/g, "")
    .replace(/[`*_>#~|]/g, "")
    .replace(/\s+/g, "");
  return Array.from(text).length;
}

export function writingIdentities(post) {
  return Array.from(new Set([
    post?.draftId,
    post?.slug,
    post?.originalSlug,
    ...(Array.isArray(post?.aliases) ? post.aliases : [])
  ].map((value) => String(value || "").trim()).filter(Boolean)));
}

export function previousWritingCharacters(activity, post) {
  return writingIdentities(post).reduce((largest, identity) => {
    const characters = Number(activity?.postCounts?.[identity]?.characters || 0);
    return Math.max(largest, characters);
  }, 0);
}

export function updateWritingPostCounts(activity, post, characters, status) {
  writingIdentities(post).forEach((identity) => {
    activity.postCounts[identity] = { characters, status };
  });
}
