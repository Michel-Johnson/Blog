# Draft persistence and live synchronization

This implementation keeps mutable blog data outside the frontend release directory and is designed for a 0.5 GB server.

## Runtime layout

- `BLOG_DATA_ROOT/content`: draft and published Markdown/HTML source.
- `BLOG_DATA_ROOT/data`: authored index, pins, views, writing activity, generated runtime bundles, revision checkpoints.
- `BLOG_DATA_ROOT/uploads`: user uploads.
- The frontend release directory contains only application code and bootstrap assets.

All primary file replacements use write + `fsync` + atomic rename. A tiny `draft-commit.json` marker bridges the content/index transaction; if the process stops between those writes, the next read completes the interrupted revision automatically. If the authored index is malformed, it is quarantined and rebuilt from self-describing content files. Each post carries a monotonically increasing `revision`; a stale writer receives HTTP 409 instead of overwriting newer data.

## Editing model

- One tab owns a 20-second editing lease and renews it every 5 seconds.
- Other tabs are live mirrors and receive immediate local changes through `BroadcastChannel`.
- Server-confirmed changes and takeovers are delivered through one lightweight SSE connection per open editor.
- A mirror can explicitly take over editing. The previous editor becomes a mirror.
- Local edits are also kept in IndexedDB, localStorage, and sessionStorage. A refresh after a frontend release can restore the newest browser copy before the next server save.

No polling daemon, Redis, worker pool, or resident database is required.

## Initial migration

Dry run first:

```bash
node scripts/migrate-blog-data.mjs \
  --source /home/www/frontend \
  --data-root /var/lib/michel-blog
```

Apply only after reviewing the counts and confirming there are no conflicts:

```bash
node scripts/migrate-blog-data.mjs \
  --source /home/www/frontend \
  --data-root /var/lib/michel-blog \
  --apply
```

Then configure the service with `Environment=BLOG_DATA_ROOT=/var/lib/michel-blog`. Frontend deployment must never synchronize, delete, or replace that directory.

The migration refuses nested source/target paths, never overwrites conflicting files, verifies every copied file by SHA-256, and leaves a marker if interrupted.
