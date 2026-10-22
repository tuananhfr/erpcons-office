"""Publish a verified suite; an existing tag is always an error."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from sbom import write_sbom


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


version = os.environ['SUITE_VERSION']
tag = f'vanphong-v{version}'
repo = os.environ['GH_REPO']
# ERPCONS_SKIP_MACOS: hosted Mac runners were unavailable, so the suite ships Windows and Linux only.
skip_macos = os.environ.get('SKIP_MACOS') == 'true'
# A missing release does not imply a missing tag (including lightweight tags).
refs = run('gh', 'api', f'repos/{repo}/git/matching-refs/tags/{tag}')
if any(ref['ref'] == f'refs/tags/{tag}' for ref in json.loads(refs)):
    raise ValueError(f'Refusing existing tag: {tag}')
root = Path('artifacts')
expected = {
    'ERPCons-VanPhong-windows-x64-setup.exe', 'ERPCons-VanPhong-windows-x64-portable.zip',
    'ERPCons-VanPhong-macos-universal.dmg', 'ERPCons-VanPhong-linux-x86_64-AppImage.tar.gz',
    'erpcons-vanphong_amd64-deb.tar.gz', 'erpcons-vanphong.x86_64-rpm.tar.gz',
}
if skip_macos:
    expected.discard('ERPCons-VanPhong-macos-universal.dmg')
if {path.name for path in root.iterdir()} != expected:
    raise ValueError(f'Expected exactly {len(expected)} suite artifacts')
releases = json.loads(Path('releases.json').read_text(encoding='utf-8'))
write_sbom(root, releases)
expected.add('sbom.cdx.json')
checksums = []
for name in sorted(expected):
    with (root / name).open('rb') as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
        checksums.append(f'{digest.hexdigest()}  {name}\n')
(root / 'SHA256SUMS.txt').write_text(''.join(checksums), encoding='utf-8')
releases = json.loads(Path('releases.json').read_text(encoding='utf-8'))
notes = f'ERPCons Văn phòng {version} — cả bốn ứng dụng trong một lần tải.\n\nPhiên bản đi kèm:\n'
for release in releases:
    notes += f"- {release['base']}: [{release['tag']}](https://github.com/tuananhfr/{release['fork']}/releases/tag/{release['tag']})\n"
notes += '''
Windows: tải setup.exe để cài cả bốn ứng dụng, hoặc giải nén bản portable.zip.
{macos}
Linux: giải nén gói AppImage (cho phép thực thi trước khi chạy), .deb hoặc .rpm.
Trong thư mục gói .deb chạy `sudo apt install ./erpcons-*.deb`; với .rpm chạy `sudo dnf install ./erpcons-*.rpm`.
Đối chiếu tệp tải về bằng SHA256SUMS.txt.

{signing}
Windows SmartScreen: chọn “More info” → “Run anyway”.
macOS Gatekeeper: nhấp chuột phải vào từng ứng dụng → Open, hoặc chạy trong Terminal:
`xattr -dr com.apple.quarantine "/Applications/<tên ứng dụng>.app"`.

Dùng bản web tại https://office.erpcons.ai.
'''.replace('{signing}', 'Chữ ký bộ cài Windows đã được xác minh.' if os.environ.get('REQUIRE_SIGNING') == 'true' else 'Bộ cài Windows chưa ký mã; macOS chỉ ký ad-hoc, chưa được Apple notarize.').replace('{macos}', 'Bản macOS chưa có trong lần phát hành này.' if skip_macos else 'macOS: mở DMG và kéo bốn ứng dụng vào Applications.')
Path('release-notes.md').write_text(notes, encoding='utf-8')
run('gh', 'release', 'create', tag, '--repo', repo, '--target', os.environ['GITHUB_SHA'], '--latest',
    '--title', f'ERPCons Văn phòng {version}', '--notes-file', 'release-notes.md',
    *(str(path) for path in sorted(root.iterdir())))
print(f'Published {tag}')
