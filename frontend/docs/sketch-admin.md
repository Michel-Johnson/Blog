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

## Generated Files

- `content/drafts/*.md`: private drafts.
- `content/posts/*.md`: published Markdown originals.
- `uploads/YYYY/MM/*`: uploaded images.
- `data/authored-posts.json`: source registry for authored posts.
- `authored-posts.js`: public static bundle read by `index.html` and `post.html`.

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
- Do not let Hexo overwrite `/home/www/frontend`, because this writer updates frontend-owned files such as `authored-posts.js` and `uploads/`.
- Back up `content/`, `uploads/`, `data/authored-posts.json`, and `authored-posts.js`.

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
