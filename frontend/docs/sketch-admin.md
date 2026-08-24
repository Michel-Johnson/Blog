# Sketch Admin Writer

This project now includes a private online writer for the sketch blog.

## Local Run

```bash
ADMIN_PASSWORD='change-this-password' node admin-server.mjs
```

Open:

```text
http://127.0.0.1:8787/admin.html
```

If `ADMIN_PASSWORD` is missing, the server generates a temporary password and prints it in the terminal. That mode is for local testing only.

## Features

- Password login with an HttpOnly session cookie.
- CSRF token required for write APIs.
- Markdown editing and live preview.
- Tables, code fences, raw HTML snippets, links, lists, blockquotes, and normal Markdown syntax through `markdown-it`.
- Math formulas through KaTeX:
  - inline: `$E=mc^2$`
  - display: `$$ ... $$`, `\\[ ... \\]`
- Code highlighting through highlight.js.
- Image uploads for `jpeg`, `png`, `gif`, and `webp`.
- Draft save and publish.
- Local draft cache is written to both `localStorage` and `sessionStorage` on editor changes, image layout changes, `pagehide`, `beforeunload`, and tab hide.
- Selected images can be resized from 10% to 100% and positioned as centered, left float, right float, or full width.

## Codex / Terminal CLI

Install the single-file CLI on the same machine as the writer service:

```bash
sudo ./scripts/install-blog-cli.sh
```

The command talks to the same authenticated writer API as `admin.html`, so
posts created by Codex follow the normal draft, publish, summary, annotation,
pin, and delete workflow. Credentials are read only from the environment or a
root-readable file; there is intentionally no `--password` argument.

```bash
export MICHEL_BLOG_URL=http://127.0.0.1:8787
export MICHEL_BLOG_PASSWORD_FILE=/root/.config/michel-blog/password

# Markdown draft
michel-blog create \
  --title "Training notes" \
  --slug training-notes \
  --category Notes \
  --file ./training-notes.md

# Raw HTML post
michel-blog create \
  --title "Interactive demo" \
  --slug interactive-demo \
  --format html \
  --file ./interactive-demo.html \
  --publish

# Update, publish, inspect, and delete
michel-blog update training-notes --file ./training-notes.md
michel-blog publish training-notes --pin
michel-blog get training-notes --output ./downloaded.md
michel-blog list --status published
michel-blog delete training-notes --yes
```

Use `--file -` to pipe generated content directly from Codex:

```bash
cat post.md | michel-blog create --title "New post" --file -
```

Markdown and HTML are stored losslessly. HTML is passed through the blog's raw
HTML-capable Markdown renderer, while `contentFormat` records the source format
for later editing and export.

## Generated Files

When `BLOG_DATA_ROOT` is set, all mutable files are stored below that independent directory:

- `$BLOG_DATA_ROOT/content/drafts/*.md`: private drafts.
- `$BLOG_DATA_ROOT/content/posts/*.md`: published Markdown originals.
- `$BLOG_DATA_ROOT/uploads/YYYY/MM/*`: uploaded images.
- `$BLOG_DATA_ROOT/data/authored-posts.json`: source registry for authored posts.
- `$BLOG_DATA_ROOT/data/authored-posts.js`: generated public runtime bundle served by the Node service.

Without `BLOG_DATA_ROOT`, the project root remains the compatibility default. Production should use the independent layout described in [draft-persistence.md](./draft-persistence.md).

## Editing Existing Markdown

The writer can open older Markdown files when the admin server can see their source directory.

By default it scans:

- `content/posts/`
- `content/drafts/`
- `source/_posts/`
- `source/_drafts/`

If the Hexo source tree lives elsewhere, start the service with `ADMIN_MARKDOWN_ROOTS`:

```bash
ADMIN_MARKDOWN_ROOTS=/path/to/hexo ADMIN_PASSWORD='change-this-password' node admin-server.mjs
```

Multiple roots can be separated with `:` on macOS/Linux. When an older `.md` file is opened from the reader's `Edit` button, autosave still writes a private draft, but publishing updates both the public `authored-posts.js` bundle and the original `.md` file when that file is inside an allowed Markdown root.

## Frontend Integration

The public sketch site stays static. It loads:

```html
<script src="./authored-posts.js"></script>
```

`home.js` and `post.js` merge `window.MICHEL_AUTHORED_POSTS` with the existing article bundles. If the file is empty, the current blog behaves as before.

## Production Notes

- Run the admin server behind HTTPS.
- Set a strong `ADMIN_PASSWORD` in the process environment.
- Keep the server bound to `127.0.0.1` and expose it through nginx only at the desired admin path.
- Keep `BLOG_DATA_ROOT` outside `/home/www/frontend`; code deployment must never synchronize or delete it.
- Back up the independent data root on a deliberately slower schedule. Live safety comes from atomic writes, revisions, editing leases, and browser recovery rather than frequent full backups.

## Suggested nginx Shape

```nginx
location /admin.html {
    proxy_pass http://127.0.0.1:8787/admin.html;
    add_header Cache-Control "no-store" always;
}

location /admin.js {
    proxy_pass http://127.0.0.1:8787/admin.js;
    add_header Cache-Control "no-store" always;
}

location /api/admin/ {
    proxy_pass http://127.0.0.1:8787/api/admin/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    add_header Cache-Control "no-store" always;
}
```

Static public files can continue to be served from `/home/www/frontend`.

## Safe Deploy

Use the included script after SSH access is available:

```bash
REMOTE_HOST=root@8.218.56.89 ./scripts/deploy-sketch-admin.sh
```

The script syncs only frontend/admin-owned files to `/home/www/frontend/` and does not use `--delete`.
