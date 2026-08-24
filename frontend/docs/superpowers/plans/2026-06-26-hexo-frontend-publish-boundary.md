# Hexo / Frontend Publish Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hexo article publishes unable to overwrite the custom sketch frontend.

**Architecture:** Keep Hexo output in `/home/www/website`, create `/home/www/frontend` for the custom UI, and update nginx route ownership so frontend paths are served from the frontend root while article/archive paths are served from the Hexo root.

**Tech Stack:** nginx, static HTML/CSS/JS, rsync, curl.

## Global Constraints

- Do not expose the server password in logs, docs, or final output.
- Back up remote nginx configs before editing.
- Run `nginx -t` before `systemctl reload nginx`.
- Keep Hexo article paths intact.
- Do not delete Hexo article output.

---

### Task 1: Prepare Frontend Root

**Files:**
- Remote create/update: `/home/www/frontend`
- Remote source remains: `/home/www/website`

**Interfaces:**
- Produces: a stable frontend root with the current custom UI files.

- [ ] **Step 1: Create frontend root**

Run:

```bash
ssh root@8.218.56.89 'mkdir -p /home/www/frontend'
```

Expected: command exits 0.

- [ ] **Step 2: Sync frontend files**

Run from `/Users/bytedance/ui`:

```bash
rsync -av index.html post.html styles.css home.js post.js blog-theme.js motion.js posts.js all-posts.js assets root@8.218.56.89:/home/www/frontend/
```

Expected: files exist in `/home/www/frontend`, and fonts exist under `/home/www/frontend/assets/fonts/`.

### Task 2: Update Nginx Routing

**Files:**
- Remote modify: `/etc/nginx/vhost/blog.conf`
- Remote modify: `/etc/nginx/vhost/wwwblog.conf`

**Interfaces:**
- Consumes: `/home/www/frontend` from Task 1.
- Produces: route ownership split between frontend and Hexo roots.

- [ ] **Step 1: Back up configs**

Run:

```bash
ssh root@8.218.56.89 'mkdir -p /root/nginx-backups && cp /etc/nginx/vhost/blog.conf /root/nginx-backups/blog.conf.$(date +%Y%m%d-%H%M%S) && cp /etc/nginx/vhost/wwwblog.conf /root/nginx-backups/wwwblog.conf.$(date +%Y%m%d-%H%M%S)'
```

Expected: backup files are created.

- [ ] **Step 2: Replace server root rules**

Set each HTTPS server block to:

```nginx
root /home/www/frontend;
index index.html;

location ^~ /assets/ {
    root /home/www/frontend;
}

location ~ ^/(styles\.css|home\.js|post\.js|blog-theme\.js|motion\.js|posts\.js|all-posts\.js)$ {
    root /home/www/frontend;
}

location ~ ^/(2025|2026|archives|categories|tags|page|css|js|images)/ {
    root /home/www/website;
    try_files $uri $uri/ =404;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Expected: nginx parses the config.

- [ ] **Step 3: Test and reload nginx**

Run:

```bash
ssh root@8.218.56.89 'nginx -t && systemctl reload nginx'
```

Expected: `syntax is ok`, `test is successful`, reload exits 0.

### Task 3: Verify Production Behavior

**Files:**
- No file changes.

**Interfaces:**
- Consumes: nginx route split from Task 2.
- Produces: proof that frontend and Hexo paths both work.

- [ ] **Step 1: Check root and frontend assets**

Run:

```bash
curl -L -sS https://micheljohnson.top/ | grep 'Michel Johnson · Personal Site'
curl -L -sS -o /dev/null -w '%{http_code}\n' https://micheljohnson.top/styles.css
curl -L -sS -o /dev/null -w '%{http_code}\n' https://micheljohnson.top/post.html
```

Expected: grep finds the title and both status checks print `200`.

- [ ] **Step 2: Check Hexo article path**

Run:

```bash
curl -L -sS -o /dev/null -w '%{http_code}\n' https://micheljohnson.top/2026/06/01/michael-diary/michael-diary-2026-06-01/
```

Expected: prints `200`.

- [ ] **Step 3: Check post reader shell**

Run:

```bash
curl -L -sS 'https://micheljohnson.top/post.html?slug=michael-diary-2026-06-01&theme=sketch' | grep 'post.js'
```

Expected: grep finds `post.js`.
