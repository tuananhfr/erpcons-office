#!/usr/bin/env bash
# Cross-build the fork's Windows x64 binaries (what packaging/windows/package.ps1 builds) with cargo-xwin, then
# copy them to <fork>/target/x86_64-pc-windows-msvc/release/ for `package.ps1 -Arch x64 -SkipBuild` on the host.
# Usage: desktop-win.sh <fork> [--allow-dirty]
set -euo pipefail
. "$(dirname "$0")/lib.sh"

fork=${1:-}; dir=$(fork_dir "$fork")
use_target "$fork" "$dir"
cd "$dir"
[ "${2:-}" = "--allow-dirty" ] || require_clean "$dir"
use_fonts "$dir" erpcons-desktop.yml

target=x86_64-pc-windows-msvc
up=${fork^^}
export CRAFT_FONTS_REQUIRED=1
export "${up}_REQUIRE_WINRES=1"
export "${up}_BUILD_SHA=$(git rev-parse HEAD)" "${up}_BUILD_DATE=$(date -u +%F)"
# Static CRT like package.ps1: the installers ship no VC++ redistributable.
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-C target-feature=+crt-static"

echo "==> cargo xwin build $fork $(git rev-parse --short HEAD) for $target"
cargo xwin build --release --locked --target "$target" -p "$fork" -p "$fork-cli"

out="$dir/target/$target/release"
mkdir -p "$out"
for exe in "$fork.exe" "$fork-cli.exe"; do
  src="$CARGO_TARGET_DIR/$target/release/$exe"
  [ -f "$src" ] || die "missing $src"
  # A dynamic CRT import means crt-static was lost (cargo-xwin owns the target's rustflags too).
  if llvm-objdump -p "$src" | grep -iE 'DLL Name: (vcruntime|msvcp)' ; then die "$exe links the dynamic VC++ runtime"; fi
  # Only the GUI app embeds the icon/VERSIONINFO; the CLIs have no build.rs resources.
  if [ "$exe" = "$fork.exe" ]; then
    llvm-objdump -h "$src" | grep -q '\.rsrc' || die "$exe has no .rsrc section (icon/VERSIONINFO missing)"
  fi
  cp "$src" "$out/"
  echo "ok $exe -> ${out#/ws/}/$exe ($(du -h "$out/$exe" | cut -f1))"
done
