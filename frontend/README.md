# Blog application

This directory contains the frontend, article reader, private writer, and
Node.js backend currently used by `micheljohnson.top`. `admin-server.mjs` is
the backend entry point; its server-side modules live in `lib/`. The HTML,
CSS, browser JavaScript, fonts, and `assets/` are the deployed frontend.

## Ownership boundary

- `frontend/`: custom UI and private writer (this directory)
- `source/`: Hexo-owned Markdown articles (repository root)
- Hexo output must never be deployed over the frontend directory.

Production keeps the same boundary:

```text
/opt/michel-blog/current/frontend  -> application source and static assets
/opt/michel-blog/current/website   -> Hexo-generated legacy pages
/opt/michel-blog/shared/runtime-data -> writable drafts, metadata and uploads
```

## Run locally

The server uses only Node.js built-ins.

```bash
cd frontend
ADMIN_PASSWORD='replace-me' \
ZHIPU_API_KEY='replace-me' \
BLOG_DATA_ROOT='../runtime-data' \
HEXO_SOURCE_ROOT='../source' \
node admin-server.mjs
```

Open:

```text
http://127.0.0.1:8787/
http://127.0.0.1:8787/admin.html
```

If `ADMIN_PASSWORD` is omitted, the server creates a temporary password for
that process. Set `BLOG_DATA_ROOT` to a writable directory outside this source
tree for persistent content and uploads. Never put real credentials in source
files or commit them.

## Environment

See `.env.example` and `../deploy/compose.blog-writer.override.example.yaml`.
Production secrets are injected from a separate environment file. The browser
never receives the administrator password or Zhipu API key.

## Runtime data

These directories are intentionally ignored by Git and are not included in
this source synchronization:

```text
content/
data/
uploads/
```

They contain drafts, generated metadata, activity data, and uploaded media.
Back them up separately from the application source. `node_modules/`, release
backups, and generated `website/` output are likewise not committed as source.

## Verification

Syntax-check the committed JavaScript:

```bash
find . -maxdepth 1 -type f \( -name '*.js' -o -name '*.mjs' \) \
  -exec node --check {} \;
```

Browser regression scripts live in `scripts/`. They expect Playwright and a
running local or production site.

For the Hexo publishing boundary and deployment rules, read
`docs/hexo-agent-publish-guide.md` before publishing articles.
