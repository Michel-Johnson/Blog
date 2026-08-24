# Hexo / Frontend Publish Boundary Design

## Goal

Prevent the Hexo article agent from overwriting Michel Johnson's custom sketch frontend while allowing that agent to keep publishing articles.

## Problem

`micheljohnson.top` currently serves from `/home/www/website`. The Hexo agent also writes generated output into that directory. When Hexo publishes, it can replace `index.html` and remove or shadow the custom frontend files, causing the site to fall back to Hexo's default UI.

## Design

Use separate deployment roots:

- `/home/www/frontend`: custom sketch frontend owned by this UI project.
- `/home/www/website`: Hexo output owned by the article agent.

Nginx serves the frontend root by default and explicitly routes Hexo content paths to the Hexo root:

- Frontend: `/`, `/index.html`, `/post.html`, `/styles.css`, `/home.js`, `/post.js`, `/blog-theme.js`, `/motion.js`, `/posts.js`, `/all-posts.js`, `/assets/`.
- Hexo: `/2025/`, `/2026/`, `/archives/`, `/categories/`, `/tags/`, `/page/`, `/css/`, `/js/`, `/images/`.

`post.js` can continue fetching article bodies from the existing Hexo paths such as `/2026/06/01/.../`.

## Operational Rules

- The Hexo agent should keep deploying to `/home/www/website`.
- The UI agent should deploy frontend files to `/home/www/frontend`.
- Do not use `rsync --delete` across both roots.
- Back up nginx config before editing and run `nginx -t` before reload.

## Verification

- `https://micheljohnson.top/` returns `Michel Johnson · Personal Site`.
- Frontend assets return 200 from `/home/www/frontend`.
- A Hexo article path such as `/2026/06/01/michael-diary/michael-diary-2026-06-01/` returns 200 from `/home/www/website`.
- `post.html?slug=michael-diary-2026-06-01&theme=sketch` loads the custom reader.
