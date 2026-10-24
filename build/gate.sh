#!/usr/bin/env bash
# Local equivalent of the fork's "ERPCons CI / Linux gate" job (.github/workflows/erpcons-ci.yml), widened to the
# whole workspace like `cargo xtask ci`: file readers/writers (xlsx, docx, ...) live outside the app crates.
# Usage: gate.sh <fork> [--dir <worktree>] [--no-wasm]. rustfmt is checked against GATE_BASE (default: the last
# erpcons-v* tag).
set -uo pipefail
. "$(dirname "$0")/lib.sh"

parse_fork_args "$@"
fork=$FORK; dir=$DIR
wasm=1; [[ " ${REST[*]} " == *" --no-wasm "* ]] && wasm=0
cd "$dir"
use_fonts "$dir" erpcons-ci.yml
logs=$(log_dir); stamp=$(date -u +%Y%m%dT%H%M%SZ)
test_log="$logs/gate-$(basename "$dir")-$stamp-test.log"
echo "gate $fork @ $(git rev-parse --short HEAD) ($(git branch --show-current)), dirty files: $(git status --porcelain | wc -l)"

failed=()
step() { local name=$1; shift; echo; echo "==> $name"; "$@" || failed+=("$name"); }

# Upstream is not rustfmt-clean: fail only for changed files that were clean at the base and are not now.
rustfmt_changed() {
  local base=${GATE_BASE:-$(git describe --tags --abbrev=0 --match 'erpcons-v*' 2>/dev/null)}
  [ -n "$base" ] || base=HEAD~1
  local changed now before bad tmp
  changed=$( { git diff --name-only --diff-filter=AM "$base" -- '*.rs'; git ls-files --others --exclude-standard -- '*.rs'; } | sort -u)
  echo "base: $base; changed .rs files: $(echo "$changed" | sed '/^$/d' | wc -l)"
  [ -n "$changed" ] || return 0
  unformatted() { (cd "$1" && cargo fmt --all -- --check 2>/dev/null | sed -n "s|^Diff in $1/\(.*\):[0-9]*:$|\1|p" | sort -u); }
  now=$(unformatted "$PWD")
  tmp=$(mktemp -d)
  git worktree add -q --detach "$tmp/base" "$base"
  before=$(unformatted "$tmp/base")
  git worktree remove --force "$tmp/base"
  bad=$(comm -12 <(echo "$changed") <(echo "$now") | comm -23 - <(echo "$before") | sed '/^$/d')
  [ -z "$bad" ] || { echo "not rustfmt-clean: $bad"; return 1; }
}

step "rustfmt (changed files)" rustfmt_changed
step "clippy (workspace)" cargo clippy --workspace --all-targets -- -D warnings
step "tests (workspace)" bash -c 'set -o pipefail; cargo test --workspace --no-fail-fast 2>&1 | tee "$0"' "$test_log"
[ $wasm = 1 ] && step "clippy (web app, wasm32)" cargo clippy -p "$fork-web" --target wasm32-unknown-unknown -- -D warnings

echo; echo "### Failing tests"
grep -E '^test .* \.\.\. FAILED$' "$test_log" | sed 's/^test /- /; s/ \.\.\. FAILED$//' || echo "none"
grep -E '^test result' "$test_log" | awk '{p+=$4; f+=$6} END {print "passed=" p " failed=" f}'
echo "test log: ${test_log#/ws/}"
if [ ${#failed[@]} -gt 0 ]; then printf 'FAILED step: %s\n' "${failed[@]}"; exit 1; fi
echo "gate $fork: all steps passed"
