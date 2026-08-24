# Agent Handoff: Michel Johnson Personal Site / Kenji Gallery Theme

Last updated: 2026-06-13 (Asia/Shanghai)

## 1. Current task objective

The active goal from the user is:

> 要求与原作者所有页面所有动效完全一致，和原作者代码保证完全一致

In practice, this currently means the `gallery` site theme should stop using our approximate/custom Michel implementation and should instead be a local mirror of `http://kenjiendo.com/` with the original Kenji Endo HTML/CSS/JS/animation behavior preserved. The user is especially sensitive to any black overlay / black mask / gradient veil / custom text-particle layer that is not in the original.

Important recent user complaint:

> 你这黑色遮罩更明显了

So the next agent should prioritize restoring source fidelity and removing any custom overlay/title-deconstruction code paths that create extra black-mask artifacts.

## 2. Repository and local preview

Workspace root:

```bash
/Users/bytedance/ui
```

Local static preview server currently expected on:

```text
http://127.0.0.1:8081/
```

Known local command:

```bash
cd /Users/bytedance/ui
python3 -m http.server 8081 --bind 127.0.0.1
```

There may already be one or more `python3 -m http.server 8081` processes running. Check with:

```bash
ps aux | rg 'http.server 8081|python3 -m http.server|8081'
```

Important URLs:

```text
Sketch/default personal site:
http://127.0.0.1:8081/index.html?home=1&theme=sketch

Gallery entry (currently redirects to exact Kenji mirror):
http://127.0.0.1:8081/index.html?home=1&theme=gallery

Exact mirror target:
http://127.0.0.1:8081/kenji-exact-home.html?home=1&theme=gallery

Live production domain:
https://micheljohnson.top/
```

## 3. Server / deployment info

Production host provided by the user earlier:

```text
Host: 8.218.56.89
User: root
Password: not stored here; get it from the user's private credential source when needed
Domain: micheljohnson.top
```

Do not record SSH or admin passwords in this repository. Treat deployment credentials as out-of-band secrets, and prefer SSH key auth once configured.

Current production split after the 2026-06-26 publish-boundary fix:

- Custom sketch frontend root: `/home/www/frontend`
- Hexo article output root: `/home/www/website`
- Nginx vhosts: `/etc/nginx/vhost/blog.conf` and `/etc/nginx/vhost/wwwblog.conf`
- Config backups for the split change: `/root/nginx-backups/publish-boundary-20260626-132557`

`micheljohnson.top` must serve `/`, `/index.html`, `/post.html`, frontend JS/CSS, and `/assets/` from `/home/www/frontend`. Hexo paths such as `/2025/`, `/2026/`, `/archives/`, `/categories/`, `/tags/`, `/page/`, `/css/`, `/js/`, and `/images/` are served from `/home/www/website`.

The Hexo article agent can keep deploying generated content to `/home/www/website`; it should not be responsible for the custom frontend. The UI agent should deploy the custom frontend to `/home/www/frontend`.

Give the Hexo article agent this focused guide before it publishes new posts:

```text
/Users/bytedance/ui/docs/hexo-agent-publish-guide.md
```

The exact remote routing can be verified with:

```bash
ssh root@8.218.56.89 'nginx -T 2>/dev/null | rg -n "server_name|root|micheljohnson|memflow" -C 2'
ssh root@8.218.56.89 'find /var/www /usr/share/nginx /www -maxdepth 3 -type d 2>/dev/null | sort | sed -n "1,120p"'
```

Suggested safe UI deploy pattern:

```bash
cd /Users/bytedance/ui
rsync -av \
  index.html post.html styles.css home.js post.js blog-theme.js motion.js \
  posts.js all-posts.js authored-posts.js admin.html admin.js admin-server.mjs \
  assets data \
  root@8.218.56.89:/home/www/frontend/
```

Do not deploy the UI with `--delete` against `/home/www/website`. That directory is Hexo-owned article output.

For user-requested frontend changes, the default workflow is now: verify locally, then deploy the verified production files to `/home/www/frontend` in the same task. Only stop at local preview when the user explicitly asks for a local-only review. Keep using an explicit production-file allowlist; never sync `tests/`, `tmp-debug/`, screenshots, experimental lab pages, or editor backup files into the public frontend root.
For the private writer, `/admin.html`, `/admin.js`, and `/api/admin/` must be served with `Cache-Control: no-store`; the admin API should be proxied to `127.0.0.1:8787`.

## 4. Current architecture / route behavior

## 4A. Primary development files vs test/reference files

The folder has many generated, captured, and visual-audit files. Future agents should not treat every HTML/PNG as an active development surface.

### Main production files for Michel personal site

These are the main files to edit for the normal personal website and blog:

- `/Users/bytedance/ui/index.html` — main entry, intro shell, theme redirect, homepage markup.
- `/Users/bytedance/ui/styles.css` — primary CSS for sketch/default site, post pages, and old/custom gallery experiments.
- `/Users/bytedance/ui/home.js` — homepage behavior, contact modal, blog/app rendering, old/custom gallery builder.
- `/Users/bytedance/ui/motion.js` — initial question-mark-to-insight animation.
- `/Users/bytedance/ui/blog-theme.js` — theme state and routing; currently sends `theme=gallery` to exact Kenji mirror.
- `/Users/bytedance/ui/posts.js` — selected/featured post data.
- `/Users/bytedance/ui/all-posts.js` and `/Users/bytedance/ui/all_posts_index.json` — full post archive data.
- `/Users/bytedance/ui/post.html` and `/Users/bytedance/ui/post.js` — blog post reader page.
- `/Users/bytedance/ui/assets/` — production assets for Michel personal site.

### Main files for Kenji exact/source-fidelity work

These files matter for the current Gallery/Kenji objective:

- `/Users/bytedance/ui/kenji-exact-home.html` — Gallery entry target and exact home mirror.
- `/Users/bytedance/ui/kenji-exact-about.html`
- `/Users/bytedance/ui/kenji-exact-album.html`
- `/Users/bytedance/ui/kenji-exact-news.html`
- `/Users/bytedance/ui/kenji-exact-contact.html`
- `/Users/bytedance/ui/kenji-exact-news-page-*.html`
- `/Users/bytedance/ui/kenji-exact-blog-*.html`
- `/Users/bytedance/ui/vendor/kenjiendo_v2/` — original Kenji theme CSS/JS/images/fonts.
- `/Users/bytedance/ui/vendor/kenjiendo_wp/` — mirrored WordPress plugin/assets/uploads.
- `/Users/bytedance/ui/vendor/kenjiendo_live/pages/manifest.json` — crawl manifest used by builders/verifiers.
- `/Users/bytedance/ui/scripts/crawl-kenji-pages.py` — fetches source pages from `kenjiendo.com`.
- `/Users/bytedance/ui/scripts/build-kenji-exact.py` — generates local exact pages with deterministic URL rewrites.
- `/Users/bytedance/ui/scripts/verify-kenji-exact.py` — checks source/vendor fidelity.
- `/Users/bytedance/ui/scripts/compare-kenji-normalized.py` — compares normalized generated pages to captured originals.
- `/Users/bytedance/ui/scripts/verify-kenji-interactions.mjs` — browser smoke verification for major interactions.
- `/Users/bytedance/ui/scripts/verify-kenji-all-pages.mjs` — broader browser smoke across generated pages.

### Reference / comparison files

These are useful references, but should usually not be hand-edited as production surfaces:

- `/Users/bytedance/ui/kenji-original-home.html`
- `/Users/bytedance/ui/kenji-original-about.html`
- `/Users/bytedance/ui/kenji-original-album.html`
- `/Users/bytedance/ui/kenji-original-news.html`
- `/Users/bytedance/ui/kenji-original-contact.html`
- `/Users/bytedance/ui/kenji-home.html`
- `/Users/bytedance/ui/kenji-reverse.html`
- `/Users/bytedance/ui/kenji-reverse.previous-custom.html`
- `/Users/bytedance/ui/kenji-script.js`
- `/Users/bytedance/ui/kenji-*-report.json`

### Test/debug/generated artifacts

These are mostly screenshots, audit outputs, experiments, or historical debugging artifacts. Do not treat them as production files unless a verifier explicitly references them:

- `audit-*.png`, `verify-*.png`, `current-*.png`, `debug-*.png`, `compare-*.png`, `canvas*.png`, `analysis-*.png`, etc.
- `/Users/bytedance/ui/verify-kenji-all-pages/`
- `/Users/bytedance/ui/verify-kenji-interactions/`
- `/Users/bytedance/ui/verify-kenji-runtime-20260611/`
- `/Users/bytedance/ui/kenji-verify-shots/`
- `/Users/bytedance/ui/tmp/`, `/Users/bytedance/ui/tmp_kenji_live/`
- `/Users/bytedance/ui/manim_insight.py`, `/Users/bytedance/ui/manim_preview_frames/`, `/Users/bytedance/ui/media/` — old Manim experiment, not current main route.
- `.venv-manim/`, `.kenji_origin_check/`, `.claude/` — local tooling/experiment folders.

### Why we are cloning Kenji Endo's site

The Kenji clone is **not** the final personal-site content strategy by itself. It is being used for two related purposes:

1. **As an interaction/style reference**: the user liked the original site's hover line animation, title particle/wire deformation, panel/menu behavior, border path animations, PJAX transitions, preload behavior, side index, and subpage cover transitions.
2. **As a Gallery theme option**: the Michel personal site should keep the existing Sketch/default theme, while adding a completely different Gallery/Kenji-inspired option. The current user objective is stronger than inspiration: make the Gallery/Kenji route match the original code and all original page interactions as closely as possible, then later decide how to map Michel content into that system without losing source-fidelity.

Practical interpretation for future agents: first preserve/verify an exact local mirror of the original. Do not invent custom black masks, title particles, or approximate line systems unless the user explicitly changes direction again.

### Default Michel site

Main files:

- `/Users/bytedance/ui/index.html`
- `/Users/bytedance/ui/styles.css`
- `/Users/bytedance/ui/home.js`
- `/Users/bytedance/ui/motion.js`
- `/Users/bytedance/ui/blog-theme.js`
- `/Users/bytedance/ui/posts.js`
- `/Users/bytedance/ui/all-posts.js`
- `/Users/bytedance/ui/post.html`
- `/Users/bytedance/ui/post.js`

### Gallery theme

`index.html` has an early redirect when `theme=gallery`:

```js
if (theme === 'gallery') {
  const target = new URL('./kenji-exact-home.html', window.location.href);
  for (const [key, value] of params.entries()) target.searchParams.set(key, value);
  target.searchParams.set('theme', 'gallery');
  window.location.href = `${target.pathname}${target.search}${window.location.hash || ''}`;
}
```

`blog-theme.js` also redirects index/gallery to `kenji-exact-home.html`.

Therefore, the user-facing gallery theme currently resolves to the Kenji exact mirror page, not the old custom Michel gallery layout.

## 5. Kenji exact mirror files

Exact mirror top-level pages:

- `/Users/bytedance/ui/kenji-exact-home.html`
- `/Users/bytedance/ui/kenji-exact-about.html`
- `/Users/bytedance/ui/kenji-exact-album.html`
- `/Users/bytedance/ui/kenji-exact-news.html`
- `/Users/bytedance/ui/kenji-exact-contact.html`
- `/Users/bytedance/ui/kenji-exact-news-page-2.html` ... `kenji-exact-news-page-10.html`
- many `kenji-exact-blog-*.html` pages

Original/captured comparison pages also exist:

- `/Users/bytedance/ui/kenji-original-home.html`
- `/Users/bytedance/ui/kenji-original-about.html`
- `/Users/bytedance/ui/kenji-original-album.html`
- `/Users/bytedance/ui/kenji-original-news.html`
- `/Users/bytedance/ui/kenji-original-contact.html`

Vendored Kenji assets:

- `/Users/bytedance/ui/vendor/kenjiendo_v2/css/style.css`
- `/Users/bytedance/ui/vendor/kenjiendo_v2/js/script.js`
- `/Users/bytedance/ui/vendor/kenjiendo_v2/js/script-local.js`
- `/Users/bytedance/ui/vendor/kenjiendo_v2/img/*`
- `/Users/bytedance/ui/vendor/kenjiendo_wp/*`
- `/Users/bytedance/ui/vendor/kenjiendo_live/pages/manifest.json` (expected by builder/verifiers)

`script-local.js` is supposed to be the original `script.js` plus deterministic local path rewrites only.

## 6. Verification scripts already in repo

Use these instead of ad-hoc visual guessing where possible:

```bash
cd /Users/bytedance/ui
python3 scripts/verify-kenji-exact.py
python3 scripts/compare-kenji-normalized.py
NODE_PATH=/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules   /Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/verify-kenji-interactions.mjs
NODE_PATH=/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules   /Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/verify-kenji-all-pages.mjs
```

Output folders:

- `/Users/bytedance/ui/verify-kenji-interactions/`
- `/Users/bytedance/ui/verify-kenji-all-pages/`
- `/Users/bytedance/ui/kenji-normalized-compare-report.json`
- `/Users/bytedance/ui/final-audit-report.json`

## 7. Important current findings

1. Current `theme=gallery` redirects to `kenji-exact-home.html`.
2. Browser screenshot taken on 2026-06-11 confirmed exact page loads and source animation canvas exists:
   - `#kenjiendo` visible, 800x3918, transparent background.
   - `.create_t` visible.
   - `#mask` was hidden with opacity 0, so the visible complaint was not the menu mask.
3. The title hover effect on exact page uses the original canvas animation: white glyph fragments and line mesh around the pointer.
4. A likely source of the ugly black/white artifact was polluted/incorrect resource state and/or prior custom Michel gallery/title code. The file `/Users/bytedance/ui/vendor/kenjiendo_v2/img/main.jpg` should be treated suspiciously and compared to the remote original.
5. I started checking remote original asset paths. Confirmed URL exists:

```text
http://kenjiendo.com/wp-content/themes/kenjiendo_v2/img/main.jpg
```

Remote content-type was `image/jpeg`, content-length around `473887`.

Potential issue: original builder/verifier constants use `http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2` while direct asset check succeeded under `http://kenjiendo.com/wp-content/themes/kenjiendo_v2`. The next agent should verify the correct canonical source paths before overwriting assets.

## 8. Current worktree state / caution

The worktree is dirty and contains many untracked files. Do **not** run destructive cleanup unless explicitly requested.

Known tracked modified files:

- `index.html`
- `motion.js`
- `styles.css`

Many important files are currently untracked, including:

- `blog-theme.js`
- `home.js`
- `posts.js`
- `all-posts.js`
- `post.html`
- `post.js`
- `vendor/`
- `kenji-exact-*.html`
- `scripts/`

Do not assume untracked means disposable; many are required for the current site.

## 9. Recommended next steps for the next agent

### A. Freeze custom gallery experiments

Because the objective is now source fidelity, avoid continuing approximate Michel gallery text/particle experiments.

In `home.js` and `styles.css`, there is a lot of older custom gallery code (`gallery-name-wire`, `gallery-source-title-fragments`, `gallery-profile-card`, etc.). Since `theme=gallery` redirects to exact pages, that custom path should not be user-visible for index/gallery. Keep it from leaking into exact pages.

### B. Restore exact mirror assets/code from source

Check and restore original vendor files:

```bash
cd /Users/bytedance/ui
python3 scripts/verify-kenji-exact.py
```

If remote path problems occur, manually compare these likely URLs:

```text
http://kenjiendo.com/wp-content/themes/kenjiendo_v2/css/style.css
http://kenjiendo.com/wp-content/themes/kenjiendo_v2/js/script.js
http://kenjiendo.com/wp-content/themes/kenjiendo_v2/img/main.jpg
http://kenjiendo.com/wp-content/themes/kenjiendo_v2/img/kenjiendo2.png
```

Then regenerate local `script-local.js` from original `script.js` with only path rewrites. The builder/verifier already documents the intended rewrite behavior.

### C. Rebuild exact pages if needed

Scripts:

```bash
python3 scripts/crawl-kenji-pages.py
python3 scripts/build-kenji-exact.py
python3 scripts/compare-kenji-normalized.py
```

Only do this if needed, because it can touch many generated HTML files.

### D. Visual verification before reporting

Use in-app browser or headless Chrome. Minimum screenshots:

```text
/Users/bytedance/ui/verify-current-exact-idle.png
/Users/bytedance/ui/verify-current-exact-hover.png
```

Test URL:

```text
http://127.0.0.1:8081/index.html?v=<cache-bust>&home=1&theme=gallery
```

Expected behavior:

- Redirects to `kenji-exact-home.html`.
- No Michel custom title particle/mask layer appears.
- `#mask` remains hidden unless menu is toggled.
- Hover over the large title letters produces the original source-like line/particle deformation.
- Panel/menu, nav, side index, border hover, PJAX transitions, preload and subpage cover animations behave like original.

## 10. Known production history

The personal site had earlier features before the current Kenji exact-theme task:

- Intro animation from question mark to `insight`.
- Sketch homepage for Michel Johnson.
- Blog mounted from old Hexo content.
- `View all posts` behavior.
- App card for MemFlow linking to `https://memflow.micheljohnson.top/`.
- Contact modal with GitHub, WeChat (`Michel-Johnson`), Gmail (`micheljohnsonofficial@gmail.com`), LinkedIn.
- Light-mode lock / Samsung browser dark-mode workarounds.

Do not break these while fixing gallery/exact.

## 11. Useful commands

```bash
# Local preview
cd /Users/bytedance/ui
python3 -m http.server 8081 --bind 127.0.0.1

# Check server process
ps aux | rg 'http.server 8081|python3 -m http.server|8081'

# Verify Kenji exact static source fidelity
python3 scripts/verify-kenji-exact.py
python3 scripts/compare-kenji-normalized.py

# Browser interaction verification
NODE_PATH=/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules   /Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/verify-kenji-interactions.mjs

# Exhaustive browser smoke across generated pages
NODE_PATH=/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules   /Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/verify-kenji-all-pages.mjs

# Deploy target discovery
ssh root@8.218.56.89 'nginx -T 2>/dev/null | rg -n "server_name|root|micheljohnson|memflow" -C 2'
```

## 12. Do not do

- Do not add black overlays, black plates, gradient masks, or approximate title particle effects to satisfy the user.
- Do not claim completion without screenshots and source-fidelity checks.
- Do not delete untracked files casually; many are current site artifacts.
- The server password is intentionally stored in this handoff file at the user's request. Do not publish or expose this file.
- Do not deploy custom UI files into `/home/www/website`; that directory is Hexo-owned. Deploy UI files to `/home/www/frontend`.
- Do not deploy with `rsync --delete` across the frontend and Hexo roots.
