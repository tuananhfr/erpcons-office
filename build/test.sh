#!/usr/bin/env bash
# Run `cargo test` in a fork or one of its worktrees with the CI fonts, e.g.
#   test.sh gridcraft --dir tmp/g1 -p gridcraft-ui-egui --test narrow_layout the_status_bar
set -euo pipefail
. "$(dirname "$0")/lib.sh"

parse_fork_args "$@"
cd "$DIR"
use_fonts "$DIR" erpcons-ci.yml
cargo test "${REST[@]}"
