#!/usr/bin/env bash
# Cross-build the fork's Windows x64 app (what packaging/windows/package.ps1 builds) with cargo-xwin, then
# copy it to <fork>/target/x86_64-pc-windows-msvc/release/ for `package.ps1 -Arch x64 -SkipBuild` on the host.
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
# The fork compiles PI sign-in and the editing licence gate in only when the build names an issuer
# (`option_env!`); fixed here so a release can never ship without them or against another PI.
export ERPCONS_PI_ISSUER=https://platform.pih.vn
unset ERPCONS_PI_API_BASE
# Static CRT like package.ps1: the installers ship no VC++ redistributable.
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-C target-feature=+crt-static"

out="$dir/target/$target/release"
# <fork>-cli edits documents without the PI licence gate the app enforces, so the installers ship the app alone.
# A CLI left by an earlier build must not reach `package.ps1 -SkipBuild` of a commit that still packages it.
rm -f "$out/$fork-cli.exe"

echo "==> cargo xwin build $fork $(git rev-parse --short HEAD) for $target (PI $ERPCONS_PI_ISSUER)"
cargo xwin build --release --locked --target "$target" -p "$fork"

mkdir -p "$out"
exe="$fork.exe"
src="$CARGO_TARGET_DIR/$target/release/$exe"
[ -f "$src" ] || die "missing $src"
# A dynamic CRT import means crt-static was lost (cargo-xwin owns the target's rustflags too).
if llvm-objdump -p "$src" | grep -iE 'DLL Name: (vcruntime|msvcp)' ; then die "$exe links the dynamic VC++ runtime"; fi
llvm-objdump -h "$src" | grep -q '\.rsrc' || die "$exe has no .rsrc section (icon/VERSIONINFO missing)"
# A fork commit without the account code ignores the variable and would ship with no licence gate.
grep -qaF "$ERPCONS_PI_ISSUER" "$src" || die "$exe does not contain the PI issuer $ERPCONS_PI_ISSUER (no licence gate)"
cp "$src" "$out/"
echo "ok $exe -> ${out#/ws/}/$exe ($(du -h "$out/$exe" | cut -f1))"
