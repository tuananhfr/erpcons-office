#!/usr/bin/env bash
# Keep cargo target dirs under a size budget: the erpcons-target volume plus target/ dirs of the workspace checkouts
# (cadcraft and ad hoc builds run cargo on the host). Cargo never deletes stale artifacts, and one gate round of the
# four forks wrote ~150 GB of debug test binaries.
# Usage: prune.sh [--dry-run] [--protect <target dir>]. Budget: ERPCONS_TARGET_BUDGET_GB (default 120, 0 = all).
set -uo pipefail

budget_kb=$(( ${ERPCONS_TARGET_BUDGET_GB:-120} * 1024 * 1024 ))
keep=2
quiet_s=$(( 30 * 60 ))
dry=0; protect=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1; shift ;;
    --protect) protect=${2:-}; shift 2 ;;
    *) sed -n '2,5p' "$0" >&2; exit 2 ;;
  esac
done

lock=/target/.erpcons-prune.lock
# Automatic runs (before each build step) skip when a prune finished recently; du over the volume takes a while.
if [ -n "$protect" ] && [ -n "$(find "$lock" -mmin -30 2>/dev/null)" ]; then exit 0; fi
exec 9>>"$lock"
flock -n 9 || { echo "prune: another prune is running"; exit 0; }
now=$(date +%s)

remove() { echo "  rm $*"; [ $dry = 1 ] || rm -rf -- "$@"; }
gb() { awk -v k="$1" 'BEGIN { printf "%.1f GB", k / 1048576 }'; }

# A unit is a dir cargo tagged as its target (CACHEDIR.TAG). /target is one too and holds other units below it.
mapfile -t units < <({ find /target -maxdepth 3 -name CACHEDIR.TAG
  ls -d /ws/*/target/CACHEDIR.TAG /ws/tmp/*/target/CACHEDIR.TAG 2>/dev/null; } | xargs -r -n1 dirname | sort -u)

# own_entries <unit>: its children, minus nested units and the dirs holding them (/target/wt).
own_entries() {
  local c u nested
  for c in "$1"/* "$1"/.[!.]*; do
    [ -e "$c" ] && [ "$c" != "$lock" ] || continue
    nested=0
    for u in "${units[@]}"; do case "$u/" in "$c"/*) nested=1; break ;; esac; done
    [ $nested = 1 ] || printf '%s\n' "$c"
  done
}

# last_used <unit>: newest file mtime (dir mtimes change when prune itself deletes); use_target also rewrites
# .erpcons-source on every run.
last_used() {
  own_entries "$1" | xargs -r -d '\n' -I{} find {} -maxdepth 3 -type f -printf '%T@\n' 2>/dev/null |
    sort -n | tail -1 | cut -d. -f1
}

# busy <unit>: a cargo holds its build lock, or something was written lately (host cargo locks are not visible here).
busy() {
  local t lk
  t=$(last_used "$1"); [ -n "$t" ] && [ $(( now - t )) -lt $quiet_s ] && return 0
  for lk in "$1"/*/.cargo-lock "$1"/*/*/.cargo-lock; do
    [ -f "$lk" ] && ! flock -n "$lk" true && return 0
  done
  return 1
}

# trim <unit>: keep the newest $keep builds of each test/bin executable. A test edited N times leaves N binaries of
# hundreds of MB each; two survive because one test can be built with two feature sets (-p vs --workspace).
trim() {
  local d base n=0
  for d in "$1"/*/deps "$1"/*/examples "$1"/*/*/deps "$1"/*/*/examples; do
    [ -d "$d" ] || continue
    while IFS= read -r base; do
      [ $dry = 1 ] || rm -f -- "$d/$base" "$d/$base".{exe,wasm,pdb,d}
      n=$(( n + 1 ))
    done < <(find "$d" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[^/]+-[0-9a-f]{16}(\.exe|\.wasm)?' \
        -printf '%T@ %f\n' | sort -rn |
      awk -v keep=$keep '{ f = $2; sub(/\.(exe|wasm)$/, "", f); n = f; sub(/-[0-9a-f]{16}$/, "", n)
                           if (++seen[n] > keep) print f }')
  done
  [ $n = 0 ] || echo "trim $1: $n old builds"
}

declare -A size used state
for u in "${units[@]}"; do
  if busy "$u"; then state[$u]=busy; else state[$u]=idle; fi
  src=$(cat "$u/.erpcons-source" 2>/dev/null)
  if [ -n "$src" ] && [ ! -d "$src" ] && [ "${state[$u]}" = idle ]; then
    echo "orphan $u (checkout $src is gone)"
    mapfile -t own < <(own_entries "$u"); [ ${#own[@]} = 0 ] || remove "${own[@]}"
    state[$u]=gone; continue
  fi
  [ "${state[$u]}" = busy ] || trim "$u"
  mapfile -t own < <(own_entries "$u")
  size[$u]=$([ ${#own[@]} = 0 ] && echo 0 || du -sck "${own[@]}" 2>/dev/null | tail -1 | cut -f1)
  used[$u]=$(last_used "$u"); used[$u]=${used[$u]:-0}
done

total=0
for u in "${!size[@]}"; do total=$(( total + size[$u] )); done
echo "targets: $(gb $total) of $(gb $budget_kb) budget"

# Over budget: drop whole units, least recently used first. Busy units and the caller's own target stay.
while IFS=' ' read -r _ u; do
  [ $total -gt $budget_kb ] || break
  echo "evict $u ($(gb "${size[$u]}"), last used $(date -d "@${used[$u]}" '+%F %H:%M'))"
  mapfile -t own < <(own_entries "$u"); [ ${#own[@]} = 0 ] || remove "${own[@]}"
  total=$(( total - size[$u] ))
done < <(for u in "${!size[@]}"; do
  [ "${state[$u]}" = idle ] && [ "$u" != "$protect" ] && echo "${used[$u]} $u"
done | sort -n)
echo "targets after prune: $(gb $total)"

[ $dry = 1 ] || touch "$lock"
