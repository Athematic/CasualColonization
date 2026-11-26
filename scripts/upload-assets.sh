#!/usr/bin/env bash
# Uploads generated art masters, comics, and runtime sprites from your local checkout
# to the hosted server over FTPS/SFTP using lftp — without committing large PNGs to git
# and without ever passing passwords on the command line.
#
# Targets:
#   sprites  tools/image-gen/output/sprites -> <DEPLOY_PATH>/assets/sprites
#   thumbs   tools/image-gen/output/thumbs  -> <DEPLOY_PATH>/assets/thumbs
#   boxart   tools/image-gen/output/boxart  -> <DEPLOY_PATH>/assets/boxart
#   comics   tools/image-gen/output/comics  -> <DEPLOY_PATH>/assets/comics
#   runtime  tools/sprite-pipeline/out      -> <DEPLOY_PATH>/assets/runtime
#            (excludes index.html and _sheet/, never touches web.config)
#   all      uploads every target above whose local folder exists
#
# Usage:
#   scripts/upload-assets.sh <target> [options]
#   scripts/upload-assets.sh comics --comic a-landfall --dry-run
#   scripts/upload-assets.sh thumbs --dry-run
#   scripts/upload-assets.sh runtime
#
# Configuration (environment variables, or ~/.config/casual-colonization/deploy.env):
#   DEPLOY_HOST       FTP/SFTP host (required)
#   DEPLOY_USER       username (required)
#   DEPLOY_PATH       remote site root, e.g. /site/wwwroot (required)
#   DEPLOY_PORT       port (default: 21 for ftps/ftp, 22 for sftp)
#   DEPLOY_PROTOCOL   ftps (default), ftp, or sftp
#   DEPLOY_TLS_VERIFY true (default) or false for self-signed certs
#
# Password handling (never passed as a CLI arg):
#   1. If ~/.netrc has an entry for DEPLOY_HOST, lftp uses it automatically (recommended on macOS: chmod 600 ~/.netrc).
#   2. Otherwise, if LFTP_PASSWORD is set in the environment, lftp reads it via --env-password.
#   3. Otherwise, the script prompts interactively with hidden input (not echoed, not saved).
set -euo pipefail

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
}

if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  usage
  exit 0
fi

TARGET="$1"
shift

DRY_RUN=false
DELETE=false
FORCE_ALL=false
COMIC_SLUG=""
CONFIG_FILE="${DEPLOY_CONFIG:-$HOME/.config/casual-colonization/deploy.env}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=true ;;
    --delete)    DELETE=true ;;
    --force)     FORCE_ALL=true ;;
    --comic)
      shift
      [ $# -gt 0 ] || { echo "--comic requires a slug (e.g. a-landfall)" >&2; exit 2; }
      COMIC_SLUG="$1"
      ;;
    --config)
      shift
      [ $# -gt 0 ] || { echo "--config requires a file path" >&2; exit 2; }
      CONFIG_FILE="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

case "$TARGET" in
  sprites|thumbs|boxart|comics|runtime|all) ;;
  *)
    echo "Unknown target '$TARGET'. Expected one of: sprites, thumbs, boxart, comics, runtime, all." >&2
    exit 2
    ;;
esac

if [ -n "$COMIC_SLUG" ] && [ "$TARGET" != "comics" ]; then
  echo "--comic can only be used with the 'comics' target." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load optional local config outside the repository (only fills unset variables).
if [ -f "$CONFIG_FILE" ]; then
  while IFS='=' read -r k v; do
    k="${k#"${k%%[![:space:]]*}"}"
    [ -z "$k" ] && continue
    case "$k" in \#*) continue ;; esac
    v="${v#\"}" ; v="${v%\"}"
    v="${v#\'}" ; v="${v%\'}"
    if [ -z "${!k:-}" ]; then
      export "$k=$v"
    fi
  done < "$CONFIG_FILE"
fi

if ! command -v lftp >/dev/null 2>&1; then
  echo "lftp is not installed. On macOS: brew install lftp  (Ubuntu/Debian: sudo apt-get install lftp)" >&2
  exit 1
fi

for req in DEPLOY_HOST DEPLOY_USER DEPLOY_PATH; do
  if [ -z "${!req:-}" ]; then
    echo "Missing $req. Export it or set it in $CONFIG_FILE." >&2
    exit 1
  fi
done

PROTOCOL="${DEPLOY_PROTOCOL:-ftps}"
TLS_VERIFY="${DEPLOY_TLS_VERIFY:-true}"
REMOTE_BASE="${DEPLOY_PATH%/}"

case "$PROTOCOL" in
  ftps)
    SCHEME=ftp
    PORT="${DEPLOY_PORT:-21}"
    LFTP_SETTINGS="set ftp:ssl-force true; set ftp:ssl-protect-data true; set ftp:passive-mode true; set ssl:verify-certificate $TLS_VERIFY;"
    ;;
  ftp)
    SCHEME=ftp
    PORT="${DEPLOY_PORT:-21}"
    echo "Warning: plain FTP sends credentials and files unencrypted. Prefer DEPLOY_PROTOCOL=ftps or sftp." >&2
    LFTP_SETTINGS="set ftp:ssl-allow false; set ftp:passive-mode true;"
    ;;
  sftp)
    SCHEME=sftp
    PORT="${DEPLOY_PORT:-22}"
    LFTP_SETTINGS="set sftp:auto-confirm no;"
    ;;
  *)
    echo "Unsupported DEPLOY_PROTOCOL '$PROTOCOL' (expected ftps, ftp, or sftp)." >&2
    exit 2
    ;;
esac

# Check whether ~/.netrc already has credentials for DEPLOY_HOST.
USE_NETRC=false
if [ -f "$HOME/.netrc" ] && grep -Eq "^[[:space:]]*machine[[:space:]]+${DEPLOY_HOST}([[:space:]]|$)" "$HOME/.netrc"; then
  USE_NETRC=true
fi

if [ "$USE_NETRC" = false ] && [ -z "${LFTP_PASSWORD:-}" ]; then
  read -r -s -p "Password for ${DEPLOY_USER}@${DEPLOY_HOST}: " LFTP_PASSWORD
  echo ""
  export LFTP_PASSWORD
fi

if [ "$USE_NETRC" = true ]; then
  OPEN_CMD="open -p $PORT ${SCHEME}://${DEPLOY_HOST}"
else
  OPEN_CMD="open --env-password -u \"$DEPLOY_USER\" -p $PORT ${SCHEME}://${DEPLOY_HOST}"
fi

upload_one() {
  local name="$1"
  local local_dir="$2"
  local remote_dir="$3"
  shift 3
  local extra_excludes=("$@")

  if [ ! -d "$local_dir" ]; then
    echo "Skip $name: local folder not found ($local_dir)"
    return 0
  fi

  local mirror_flags="-R --verbose --parallel=3"
  if [ "$FORCE_ALL" = false ]; then
    mirror_flags="$mirror_flags --only-newer"
  fi
  if [ "$DELETE" = true ]; then
    mirror_flags="$mirror_flags --delete"
  fi
  if [ "$DRY_RUN" = true ]; then
    mirror_flags="$mirror_flags --dry-run"
  fi

  local ex_args="--exclude-glob .DS_Store --exclude-glob *.tmp* --exclude-glob web.config"
  for ex in "${extra_excludes[@]}"; do
    ex_args="$ex_args $ex"
  done

  echo "==> $name: $local_dir -> ${SCHEME}://${DEPLOY_HOST}:${PORT}${remote_dir}$([ "$DRY_RUN" = true ] && echo ' [DRY RUN]')"
  lftp -c "set xfer:make-backup no; set net:max-retries 3; set net:timeout 30; $LFTP_SETTINGS $OPEN_CMD; mkdir -pf '$remote_dir'; mirror $mirror_flags $ex_args '$local_dir' '$remote_dir'"
}

run_target() {
  case "$1" in
    sprites)
      upload_one "sprites" "$REPO_ROOT/tools/image-gen/output/sprites" "$REMOTE_BASE/assets/sprites"
      ;;
    thumbs)
      upload_one "thumbs" "$REPO_ROOT/tools/image-gen/output/thumbs" "$REMOTE_BASE/assets/thumbs"
      ;;
    boxart)
      upload_one "boxart" "$REPO_ROOT/tools/image-gen/output/boxart" "$REMOTE_BASE/assets/boxart"
      ;;
    comics)
      if [ -n "$COMIC_SLUG" ]; then
        upload_one "comics/$COMIC_SLUG" "$REPO_ROOT/tools/image-gen/output/comics/$COMIC_SLUG" "$REMOTE_BASE/assets/comics/$COMIC_SLUG"
      else
        upload_one "comics" "$REPO_ROOT/tools/image-gen/output/comics" "$REMOTE_BASE/assets/comics"
      fi
      ;;
    runtime)
      upload_one "runtime" "$REPO_ROOT/tools/sprite-pipeline/out" "$REMOTE_BASE/assets/runtime" \
        "--exclude ^index\\.html$" "--exclude ^_sheet/"
      ;;
  esac
}

if [ "$TARGET" = "all" ]; then
  for t in sprites thumbs boxart comics runtime; do
    run_target "$t"
  done
else
  run_target "$TARGET"
fi

echo "Done."
