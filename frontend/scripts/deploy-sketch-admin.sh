#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@8.218.56.89}"
REMOTE_FRONTEND="${REMOTE_FRONTEND:-/home/www/frontend/}"
REMOTE_SERVICE="${REMOTE_SERVICE:-michel-writer.service}"
REMOTE_DATA_ROOT="${REMOTE_DATA_ROOT:-}"

cd "$(dirname "$0")/.."

node scripts/verify-production-bookshelf-entry.mjs

SSH=(ssh)
RSYNC=(rsync)
if [[ -n "${SSHPASS:-}" ]]; then
  if command -v sshpass >/dev/null 2>&1; then
    SSH=(sshpass -e ssh)
    RSYNC=(rsync -e "sshpass -e ssh")
  elif [[ -x "$PWD/scripts/ssh-with-password-askpass.sh" ]]; then
    ASKPASS_SSH="$PWD/scripts/ssh-with-password-askpass.sh"
    SSH=("$ASKPASS_SSH")
    RSYNC=(rsync -e "$ASKPASS_SSH")
  else
    echo "SSHPASS is set, but neither sshpass nor the SSH_ASKPASS wrapper is available." >&2
    exit 1
  fi
fi

if [[ -n "$REMOTE_DATA_ROOT" ]]; then
  case "${REMOTE_DATA_ROOT%/}/" in
    "${REMOTE_FRONTEND%/}/"|"${REMOTE_FRONTEND%/}/"*)
      echo "REMOTE_DATA_ROOT must be outside REMOTE_FRONTEND." >&2
      exit 1
      ;;
  esac
  REMOTE_STATE_ROOT="${REMOTE_DATA_ROOT%/}/data"
  "${SSH[@]}" "$REMOTE_HOST" "
    set -eu
    systemctl show '$REMOTE_SERVICE' --property=Environment --value \
      | tr ' ' '\n' \
      | grep -Fx 'BLOG_DATA_ROOT=${REMOTE_DATA_ROOT%/}' >/dev/null
  " || {
    echo "The service is not configured with BLOG_DATA_ROOT=${REMOTE_DATA_ROOT%/}; refusing a mixed-layout deploy." >&2
    exit 1
  }
else
  REMOTE_STATE_ROOT="${REMOTE_FRONTEND%/}/data"
fi

"${RSYNC[@]}" -av \
  index.html post.html styles.css article-content.css mobile.css responsive.css reader-editor.css ask-ai-shell-borderless-v49.css home.js post.js assistant.js blog-theme.js motion.js inline-annotations.js \
  posts.js all-posts.js all-posts-3d.js admin.html admin.js private.html private.css private.js admin-server.mjs \
  assets lib \
  "$REMOTE_HOST:$REMOTE_FRONTEND"

"${SSH[@]}" "$REMOTE_HOST" "install -d -m 0755 /usr/local/lib/michel-blog"
"${RSYNC[@]}" -av bin/michel-blog.mjs "$REMOTE_HOST:/usr/local/lib/michel-blog/michel-blog.mjs"

# Runtime state belongs to the server. Bootstrap generated bundles only when
# absent; subsequent code deploys must never replace mutable state.
"${RSYNC[@]}" -av authored-posts.js "$REMOTE_HOST:${REMOTE_FRONTEND%/}/authored-posts.bootstrap.js"
"${RSYNC[@]}" -av pinned-posts.js "$REMOTE_HOST:${REMOTE_FRONTEND%/}/pinned-posts.bootstrap.js"
"${SSH[@]}" "$REMOTE_HOST" "
  set -eu
  mkdir -p '$REMOTE_STATE_ROOT'
  if [ -n '${REMOTE_DATA_ROOT%/}' ]; then
    mkdir -p '${REMOTE_DATA_ROOT%/}/content' '${REMOTE_DATA_ROOT%/}/uploads'
  fi
  if [ ! -f '$REMOTE_STATE_ROOT/authored-posts.js' ]; then
    mv '${REMOTE_FRONTEND%/}/authored-posts.bootstrap.js' '$REMOTE_STATE_ROOT/authored-posts.js'
  else
    rm -f '${REMOTE_FRONTEND%/}/authored-posts.bootstrap.js'
  fi
  if [ ! -f '$REMOTE_STATE_ROOT/pinned-posts.js' ]; then
    mv '${REMOTE_FRONTEND%/}/pinned-posts.bootstrap.js' '$REMOTE_STATE_ROOT/pinned-posts.js'
  else
    rm -f '${REMOTE_FRONTEND%/}/pinned-posts.bootstrap.js'
  fi
  if [ ! -f '$REMOTE_STATE_ROOT/pinned-posts.json' ]; then
    printf '[]\n' > '$REMOTE_STATE_ROOT/pinned-posts.json'
  fi
  chmod 0755 /usr/local/lib/michel-blog/michel-blog.mjs
  ln -sfn /usr/local/lib/michel-blog/michel-blog.mjs /usr/local/bin/michel-blog
  systemctl restart '$REMOTE_SERVICE'
  systemctl is-active --quiet '$REMOTE_SERVICE'

  if [ -n '${REMOTE_DATA_ROOT%/}' ]; then
    authored_runtime_hash=\$(sha256sum '$REMOTE_STATE_ROOT/authored-posts.js' | awk '{print \$1}')
    authored_public_hash=\$(curl -ksS --resolve micheljohnson.top:443:127.0.0.1 \
      'https://micheljohnson.top/authored-posts.js' | sha256sum | awk '{print \$1}')
    pinned_runtime_hash=\$(sha256sum '$REMOTE_STATE_ROOT/pinned-posts.js' | awk '{print \$1}')
    pinned_public_hash=\$(curl -ksS --resolve micheljohnson.top:443:127.0.0.1 \
      'https://micheljohnson.top/pinned-posts.js' | sha256sum | awk '{print \$1}')
    if [ \"\$authored_runtime_hash\" != \"\$authored_public_hash\" ]; then
      echo 'Public authored-posts.js does not match the protected runtime data bundle.' >&2
      exit 1
    fi
    if [ \"\$pinned_runtime_hash\" != \"\$pinned_public_hash\" ]; then
      echo 'Public pinned-posts.js does not match the protected runtime data bundle.' >&2
      exit 1
    fi
  fi
"

echo "Synced sketch frontend/admin files to $REMOTE_HOST:$REMOTE_FRONTEND"
if [[ -n "$REMOTE_DATA_ROOT" ]]; then
  echo "Protected mutable data root: $REMOTE_DATA_ROOT"
fi
echo "Reminder: do not rsync --delete against /home/www/website; Hexo owns that tree."
