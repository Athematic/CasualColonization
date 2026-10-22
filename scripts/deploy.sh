#!/usr/bin/env bash
# Uploads the release build in site/ to the web server and removes the bundles of earlier builds.
#
#   scripts/deploy.sh "<lftp open command>" <remote folder> [--dry-run]
#
# The GitHub Deploy workflow passes `open --env-password -u USER -p PORT ftp://HOST` (password in
# LFTP_PASSWORD). Order matters: assets first, then index.html, so the live page never points at a
# file that is not there yet; old bundles go last. Only files named like Vite's bundles
# (assets/index-*.js|css, assets/cover-*.webp) that the new build does not have are deleted, so the
# images hosted on the server (assets/sprites, thumbs, runtime, boxart) and any server files such as
# web.config are never touched.
set -euo pipefail
OPEN="$1"
REMOTE="${2%/}"
DRY="${3:-}"

L() { lftp -c "set xfer:make-backup no; set sftp:auto-confirm no; set net:max-retries 3; set net:timeout 30; $OPEN; $1"; }

test -f site/index.html || { echo "site/index.html is missing: run npm run release and commit site/." >&2; exit 1; }
local_assets=$(cd site/assets && ls -1)
remote_assets=$(L "cls -1 '$REMOTE/assets/'" 2>/dev/null | sed 's#/$##' | xargs -r -n1 basename || true)
stale=$(comm -23 \
  <(printf '%s\n' $remote_assets | grep -E '^(index|cover)-.*\.(js|css|webp)$' | sort -u) \
  <(printf '%s\n' $local_assets | sort -u) || true)

echo "Upload to ${REMOTE:-/}: index.html and $(printf '%s\n' $local_assets | wc -l) files in assets/"
echo "Remove from ${REMOTE}/assets (earlier builds):"; printf '  %s\n' ${stale:-none}
if [ "$DRY" = "--dry-run" ]; then echo "Dry run: nothing changed."; exit 0; fi

L "mkdir -pf '$REMOTE/assets'; mput -O '$REMOTE/assets' site/assets/*; put -O '$REMOTE' site/index.html"
for f in $stale; do L "rm '$REMOTE/assets/$f'"; done
echo "Deployed."
