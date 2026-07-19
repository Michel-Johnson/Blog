# Sketch Blog Frontend

This directory contains the custom Sketch frontend, article reader, private
writer, and the server-side proxy used by `micheljohnson.top`.

## Ownership boundary

- `frontend/`: custom UI and private writer (this directory)
- `source/`: Hexo-owned Markdown articles (repository root)
- Hexo output must never be deployed over the frontend directory.

Production currently keeps the same boundary:

```text
/home/www/frontend  -> Sketch frontend and admin service
/home/www/website   -> Hexo-generated article pages
```

## Run locally

The server uses only Node.js built-ins.

```bash
cd frontend
ADMIN_PASSWORD='replace-me' \
ZHIPU_API_KEY='replace-me' \
HEXO_SOURCE_ROOT='../source' \
node admin-server.mjs
```

Open:

```text
http://127.0.0.1:8787/
http://127.0.0.1:8787/admin.html
```

If `ADMIN_PASSWORD` is omitted, the server creates a temporary password for
that process. Never put real credentials in source files or commit them.

## Environment

See `.env.example`. Production secrets should be injected by the service
manager. The browser never receives the administrator password or Zhipu API
key.

## Runtime data

These directories are intentionally ignored by Git:

```text
content/
data/
uploads/
```

They contain drafts, generated metadata, activity data, and uploaded media.
Back them up separately from the application source.

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
