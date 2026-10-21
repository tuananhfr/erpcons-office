#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
for format in AppImage deb rpm; do
  stage=$(mktemp -d)
  mkdir "$stage/ERPCons-VanPhong"
  for base in VanBan BangTinh TrinhChieu PDF; do
    case $format in
      AppImage) file="ERPCons-$base-linux-x86_64.AppImage" ;;
      deb) file="erpcons-${base,,}_amd64.deb" ;;
      rpm) file="erpcons-${base,,}.x86_64.rpm" ;;
    esac
    cp "inputs/$base/$file" "$stage/ERPCons-VanPhong/"
  done
  case $format in
    AppImage)
      chmod +x "$stage/ERPCons-VanPhong/"*.AppImage
      name=ERPCons-VanPhong-linux-x86_64-AppImage.tar.gz
      guide='Cho phép thực thi rồi mở từng tệp AppImage để chạy ứng dụng.' ;;
    deb)
      name=erpcons-vanphong_amd64-deb.tar.gz
      guide='Mở Terminal tại thư mục này và chạy: sudo apt install ./erpcons-*.deb' ;;
    rpm)
      name=erpcons-vanphong.x86_64-rpm.tar.gz
      guide='Mở Terminal tại thư mục này và chạy: sudo dnf install ./erpcons-*.rpm' ;;
  esac
  printf 'ERPCons Văn phòng — Văn bản, Bảng tính, Trình chiếu và PDF.\n%s\n' "$guide" > "$stage/ERPCons-VanPhong/HUONG-DAN.txt"
  tar -czf "artifacts/$name" -C "$stage" ERPCons-VanPhong
  tar -tzf "artifacts/$name" | sort > "$stage/actual"
  { printf 'ERPCons-VanPhong/\nERPCons-VanPhong/HUONG-DAN.txt\n';
    for file in "$stage/ERPCons-VanPhong/"*.$format; do printf 'ERPCons-VanPhong/%s\n' "${file##*/}"; done;
  } | sort > "$stage/expected"
  diff -u "$stage/expected" "$stage/actual"
  if [[ $format == AppImage ]]; then
    mkdir "$stage/check"
    tar -xzf "artifacts/$name" -C "$stage/check"
    for file in "$stage/check/ERPCons-VanPhong/"*.AppImage; do test -x "$file"; done
  fi
  echo "Contents verified: $name"
  rm -rf "$stage"
done
