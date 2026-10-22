"""Aggregate published CycloneDX BOMs or explicitly inventory release artifacts."""
import json
from pathlib import Path
import re
import subprocess
import tempfile


def aggregate(releases, fetch):
    components = []
    if len(releases) != 4 or len({r['fork'] for r in releases}) != 4:
        raise ValueError('Expected four distinct fork releases')
    for release in releases:
        boms, sums = fetch(release)
        component = {'type': 'application', 'name': release['fork'], 'version': release['tag'],
                     'bom-ref': f"{release['fork']}@{release['tag']}"}
        children = []
        if boms:
            for bom in boms:
                if bom.get('bomFormat') != 'CycloneDX':
                    raise ValueError('Invalid upstream CycloneDX SBOM')
                # Namespace references to avoid collisions between independent fork BOMs.
                children.extend(bom.get('components', []))
        else:
            for line in sums.splitlines():
                match = re.fullmatch(r'([a-fA-F0-9]{64}) [ *](.+)', line)
                if match:
                    children.append({'type': 'file', 'name': match[2], 'version': release['tag'],
                                     'hashes': [{'alg': 'SHA-256', 'content': match[1].lower()}]})
            if not children:
                raise ValueError('Missing release checksums for SBOM fallback')
            component['description'] = 'Release artifact inventory; transitive dependencies unavailable'
        def namespace(value):
            if isinstance(value, dict):
                return {k: (f"{component['bom-ref']}:{v}" if k == 'bom-ref' else namespace(v)) for k, v in value.items()}
            if isinstance(value, list):
                return [namespace(v) for v in value]
            return value
        component['components'] = namespace(children)
        components.append(component)
    return {'bomFormat': 'CycloneDX', 'specVersion': '1.5', 'version': 1, 'components': components}


def fetch_release(release):
    repo = f"tuananhfr/{release['fork']}"
    data = json.loads(subprocess.check_output(['gh', 'api', f"repos/{repo}/releases/tags/{release['tag']}"], text=True))
    names = [a['name'] for a in data['assets'] if a['name'].endswith(('.cdx.json', '.cyclonedx.json', '.sbom.json')) or a['name'] == 'sbom.json']
    with tempfile.TemporaryDirectory() as tmp:
        args = ['gh', 'release', 'download', release['tag'], '--repo', repo, '--dir', tmp]
        for name in names or ['SHA256SUMS.txt']:
            args.extend(['--pattern', name])
        subprocess.run(args, check=True)
        return ([json.loads((Path(tmp) / name).read_text(encoding='utf-8-sig')) for name in names],
                '' if names else (Path(tmp) / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig'))


def write_sbom(root, releases):
    (root / 'sbom.cdx.json').write_text(json.dumps(aggregate(releases, fetch_release), indent=2) + '\n', encoding='utf-8')
