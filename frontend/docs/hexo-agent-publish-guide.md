# Hexo Agent Publish Guide

This document is for the agent that maintains Michel Johnson's Hexo blog articles.

## Read This First

The production site is intentionally split into two roots:

| Responsibility | Remote path | Owner |
| --- | --- | --- |
| Custom sketch frontend | `/home/www/frontend` | UI / frontend agent |
| Hexo generated articles | `/home/www/website` | Hexo article agent |

Do not collapse these two roots back into one directory.

The public domain is:

```text
https://micheljohnson.top/
```

Nginx serves the custom frontend by default. Only Hexo content paths are routed to the Hexo output root.

## Route Ownership

Frontend routes served from `/home/www/frontend`:

```text
/
/index.html
/post.html
/styles.css
/home.js
/post.js
/blog-theme.js
/motion.js
/posts.js
/all-posts.js
/assets/
```

Hexo routes served from `/home/www/website`:

```text
/2025/
/2026/
/archives/
/categories/
/tags/
/page/
/css/
/js/
/images/
```

The custom reader at `/post.html?...` fetches article bodies from the Hexo article paths, so the old Hexo article URLs must keep working.

## Publishing New Blog Posts

Use the normal Hexo source workflow in the Hexo project:

```bash
hexo new post "Your Post Title"
```

Then edit the generated Markdown under the Hexo source tree, for example:

```text
source/_posts/your-post-title.md
```

Generate the static site:

```bash
hexo clean
hexo generate
```

Preview locally if possible:

```bash
hexo server
```

Deploy only the generated Hexo output to the Hexo-owned remote root:

```bash
rsync -av public/ root@8.218.56.89:/home/www/website/
```

Use `--delete` only if `public/` is confirmed to be the complete canonical output containing all historical article, archive, category, tag, image, CSS, and JS paths. If unsure, do not use `--delete`.

## What Not To Do

Do not deploy Hexo output to:

```text
/home/www/frontend
```

Do not overwrite these frontend-owned files:

```text
/home/www/frontend/index.html
/home/www/frontend/post.html
/home/www/frontend/styles.css
/home/www/frontend/home.js
/home/www/frontend/post.js
/home/www/frontend/blog-theme.js
/home/www/frontend/motion.js
/home/www/frontend/posts.js
/home/www/frontend/all-posts.js
/home/www/frontend/assets/
```

Do not edit nginx routing unless the UI/frontend owner explicitly asks you to.

Do not change the site root back to `/home/www/website`.

Do not include passwords or credentials in logs, commits, screenshots, or chat messages.

## After Publishing

Verify at least one new or changed Hexo article path:

```bash
curl -L -sS -o /tmp/hexo-post-check.html -w "%{http_code}\n" \
  https://micheljohnson.top/2026/06/01/michael-diary/michael-diary-2026-06-01/
```

Expected:

```text
200
```

Verify the custom frontend was not overwritten:

```bash
curl -L -sS https://micheljohnson.top/ | grep 'Michel Johnson · Personal Site'
curl -L -sS -o /dev/null -w "%{http_code}\n" https://micheljohnson.top/styles.css
curl -L -sS -o /dev/null -w "%{http_code}\n" https://micheljohnson.top/post.html
```

Expected:

```text
<title>Michel Johnson · Personal Site</title>
200
200
```

If the root page shows Hexo's default UI, stop and notify the UI/frontend owner. That means the publish boundary has been broken.

## Making New Posts Appear In The Custom Bookshelf

Publishing Hexo HTML makes the article URL work, but the custom bookshelf is driven by frontend-owned index files such as:

```text
/home/www/frontend/all-posts.js
/home/www/frontend/posts.js
```

If a new post should appear in the custom sketch bookshelf, notify the UI/frontend agent after Hexo deploy. The UI/frontend agent should regenerate or update the bookshelf index and deploy those frontend files to `/home/www/frontend`.

The Hexo agent should not directly overwrite the frontend index files unless the UI/frontend owner explicitly delegates that step.

## Recovery Signal

The known bad case is:

```text
Hexo publish overwrote the custom frontend, causing https://micheljohnson.top/ to show Hexo UI and frontend assets to return 404.
```

The durable prevention is the two-root split:

```text
/home/www/frontend  -> custom sketch frontend
/home/www/website   -> Hexo article output
```

Keep that split intact.
