export function hiddenPostIdentities(posts = []) {
  return Array.from(new Set(posts
    .filter((post) => post?.status === "draft" && (post.importedFromLegacy || post.importedFromMarkdown))
    .flatMap((post) => [post.slug, post.originalSlug, ...(Array.isArray(post.aliases) ? post.aliases : [])])
    .map((identity) => String(identity || "").trim())
    .filter(Boolean)));
}

export function serializeAuthoredPostsBundle(posts = []) {
  const publicPosts = posts.filter((post) => post?.status === "published");
  return [
    `window.MICHEL_AUTHORED_POSTS = ${JSON.stringify(publicPosts, null, 2)};`,
    `window.MICHEL_HIDDEN_POSTS = ${JSON.stringify(hiddenPostIdentities(posts), null, 2)};`,
    ""
  ].join("\n");
}
