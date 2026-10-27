#!/usr/bin/env bash
# Run a build step in the ERPCons build image, with the workspace mounted at /ws.
#   build/run.sh gate wordcraft [--dir tmp/<worktree>]  -> build/gate.sh ...
#   build/run.sh test wordcraft [--dir ...] <cargo test args>
#   build/run.sh desktop-win wordcraft    -> build/desktop-win.sh wordcraft
#   build/run.sh prune [--dry-run]        -> build/prune.sh (also runs before each fork step and hourly)
#   build/run.sh bash                     -> any other command
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# Docker Desktop needs a Windows path for the bind mount; `pwd -W` exists only in Git Bash.
ws=$(cd "$here/../.." && { pwd -W 2>/dev/null || pwd; })
[ $# -gt 0 ] || { sed -n '2,7p' "$0"; exit 2; }

# The tag follows the Dockerfile, so an edited Dockerfile always gets a fresh image.
image="erpcons-build:$(sha256sum "$here/Dockerfile" | cut -c1-12)"
docker image inspect "$image" >/dev/null 2>&1 || docker build -t "$image" "$here"

if [ -f "$here/$1.sh" ]; then
  step=$1; shift
  set -- bash "/ws/erpcons-office/build/$step.sh" "$@"
fi

tty=(); [ -t 0 ] && [ -t 1 ] && tty=(-it)
# Build outputs and caches live in volumes: a Windows bind mount is far too slow for target/ and node_modules/.
MSYS_NO_PATHCONV=1 exec docker run --rm "${tty[@]}" \
  -v "$ws:/ws" \
  -v erpcons-target:/target \
  -v erpcons-cargo-registry:/usr/local/cargo/registry \
  -v erpcons-cargo-git:/usr/local/cargo/git \
  -v erpcons-cache:/root/.cache \
  -v erpcons-npm:/root/.npm \
  -v erpcons-office-node-modules:/ws/erpcons-office/node_modules \
  -e CARGO_TARGET_DIR=/target \
  -e CARGO_PROFILE_DEV_DEBUG=line-tables-only \
  -e CARGO_PROFILE_TEST_DEBUG=line-tables-only \
  -e ERPCONS_TARGET_BUDGET_GB \
  -w /ws \
  "$image" "$@"
