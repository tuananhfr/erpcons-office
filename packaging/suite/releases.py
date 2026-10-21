"""Snapshot public releases, then download and verify only the platform's inputs."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def gh(*args):
    return subprocess.check_output(["gh", *args], text=True)


def editors():
    source = Path("src/config/editors.ts").read_text(encoding="utf-8")
    entries = re.findall(r"desktop: '([^']+)', name: '[^']+', extension: '[^']+', fork: '([^']+)'", source)
    if len(entries) != 4:
        raise ValueError("Expected four desktop editors in the registry")
    return entries


def files(base, platform):
    prefix = f"ERPCons-{base}"
    linux = f"erpcons-{base.lower()}"
    return {
        "windows": [f"{prefix}-windows-x64.msi", f"{prefix}-windows-x64-portable.zip"],
        "macos": [f"{prefix}-macos-universal.dmg"],
        "linux": [f"{prefix}-linux-x86_64.AppImage", f"{linux}_amd64.deb", f"{linux}.x86_64.rpm"],
    }[platform]


def verify(path, sums):
    matches = re.findall(r"^([a-fA-F0-9]{64}) [ *]" + re.escape(path.name) + r"$", sums, re.MULTILINE)
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if len(matches) != 1 or digest.hexdigest() != matches[0].lower():
        raise ValueError(f"Missing, ambiguous or incorrect SHA256: {path}")
    print(f"SHA256 OK: {path.name}")


def main():
    mode = sys.argv[1]
    if mode == "snapshot":
        releases = []
        for base, fork in editors():
            release = json.loads(gh("api", f"repos/tuananhfr/{fork}/releases/latest"))
            releases.append({"base": base, "fork": fork, "tag": release["tag_name"]})
        Path("releases.json").write_text(json.dumps(releases, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        for release in json.loads(Path("releases.json").read_text(encoding="utf-8")):
            target = Path("inputs") / release["base"]
            target.mkdir(parents=True, exist_ok=True)
            names = files(release["base"], mode)
            args = ["release", "download", release["tag"], "--repo", f"tuananhfr/{release['fork']}", "--dir", str(target)]
            for name in ["SHA256SUMS.txt", *names]:
                args.extend(["--pattern", name])
            gh(*args)
            sums = (target / "SHA256SUMS.txt").read_text(encoding="utf-8-sig")
            for name in names:
                verify(target / name, sums)


if __name__ == "__main__":
    main()
