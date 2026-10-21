#!/usr/bin/env bash
set -euo pipefail
stage=$(mktemp -d)
mountpoint=$(mktemp -d)
mounted=false
cleanup() {
  if $mounted; then hdiutil detach "$mountpoint"; fi
  rm -rf "$stage" "$mountpoint"
}
trap cleanup EXIT
for base in VanBan BangTinh TrinhChieu PDF; do
  hdiutil attach "inputs/$base/ERPCons-$base-macos-universal.dmg" -readonly -nobrowse -mountpoint "$mountpoint"
  mounted=true
  count=0
  for app in "$mountpoint/"*.app; do
    test -d "$app"
    # Finder metadata from the mounted DMG makes codesign --strict reject the copy.
    ditto --norsrc --noextattr --noqtn "$app" "$stage/$(basename "$app")"
    codesign --verify --deep --strict "$stage/$(basename "$app")"
    count=$((count + 1))
  done
  test "$count" -eq 1
  hdiutil detach "$mountpoint"
  mounted=false
done
ln -s /Applications "$stage/Applications"
mkdir -p artifacts
hdiutil create -volname 'ERPCons Văn phòng' -srcfolder "$stage" -ov -format UDZO artifacts/ERPCons-VanPhong-macos-universal.dmg
hdiutil attach artifacts/ERPCons-VanPhong-macos-universal.dmg -readonly -nobrowse -mountpoint "$mountpoint"
mounted=true
count=0
for app in "$mountpoint/"*.app; do
  codesign --verify --deep --strict "$app"
  count=$((count + 1))
done
test "$count" -eq 4
test "$(readlink "$mountpoint/Applications")" = /Applications
echo 'Suite DMG mount and four signatures verified'
