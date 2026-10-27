# Shared helpers for the in-container build steps; sourced, not executed.

die() { echo "error: $*" >&2; exit 1; }

# fork_dir <fork> [dir]: validate the name and print /ws/<fork>, or a worktree of that fork given relative to /ws.
fork_dir() {
  case "$1" in wordcraft|gridcraft|deckcraft|pdfcraft) ;; *) die "unknown fork '$1' (wordcraft|gridcraft|deckcraft|pdfcraft)";; esac
  [ -n "${2:-}" ] || { echo "/ws/$1"; return; }
  local dir="/ws/${2#/ws/}"
  [ -d "$dir" ] || die "no such directory: $dir"
  [ "$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" = "/ws/$1/.git" ] ||
    die "$dir is not a worktree of $1"
  echo "$dir"
}

# use_target <fork> <dir>: one target dir per checkout. Two checkouts of the same crate version reuse each other's
# artifacts in a shared dir (a stale crate gets linked in), and separate dirs let parallel builds skip the cargo lock.
use_target() {
  if [ "$2" = "/ws/$1" ]; then
    export CARGO_TARGET_DIR="/target/$1"
  else
    export CARGO_TARGET_DIR="/target/wt/$(basename "$2")"
  fi
  # prune.sh drops a target whose checkout is gone, and ranks targets by this file's mtime among others.
  mkdir -p "$CARGO_TARGET_DIR" && printf '%s\n' "$2" > "$CARGO_TARGET_DIR/.erpcons-source"
  bash "$(dirname "${BASH_SOURCE[0]}")/prune.sh" --protect "$CARGO_TARGET_DIR" || echo "warning: prune.sh failed" >&2
}

# parse_fork_args "$@": sets FORK, DIR and REST from `<fork> [--dir <worktree>] [other args...]`.
parse_fork_args() {
  FORK=${1:-}; shift || true
  local dir=""
  REST=()
  while [ $# -gt 0 ]; do
    case "$1" in --dir) dir=${2:-}; shift 2 ;; *) REST+=("$1"); shift ;; esac
  done
  DIR=$(fork_dir "$FORK" "$dir") || exit 1
  use_target "$FORK" "$DIR"
}

# use_fonts <fork dir> <workflow file>: export CRAFT_FONTS_DIR for the craft-fonts commit that workflow pins.
use_fonts() {
  local ref
  ref=$(sed -n 's/^ *CRAFT_FONTS_REF: *\([0-9a-f]\{40\}\).*/\1/p' "$1/.github/workflows/$2" | head -1)
  [ -n "$ref" ] || die "no CRAFT_FONTS_REF in $2"
  export CRAFT_FONTS_DIR="/ws/craft-fonts-refs/$ref"
  if [ ! -d "$CRAFT_FONTS_DIR" ]; then
    git -C /ws/craft-fonts worktree add --relative-paths --detach "$CRAFT_FONTS_DIR" "$ref" || die "cannot create fonts worktree $ref"
  fi
  echo "fonts: $CRAFT_FONTS_DIR"
}

# require_clean <dir>: release builds must be exactly a commit.
require_clean() {
  [ -z "$(git -C "$1" status --porcelain)" ] || { git -C "$1" status --short >&2; die "$1 has uncommitted changes"; }
}

log_dir() {
  local d="/ws/erpcons-office/build/logs"
  mkdir -p "$d" && echo "$d"
}
