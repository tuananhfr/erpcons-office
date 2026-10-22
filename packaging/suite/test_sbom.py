import unittest
from sbom import aggregate


class SbomTests(unittest.TestCase):
    def test_fallback_lists_four_forks_and_checksums(self):
        releases = [{'fork': name, 'tag': 'v1'} for name in ('word', 'grid', 'deck', 'pdf')]
        bom = aggregate(releases, lambda _: ([], 'a' * 64 + '  setup.exe'))
        self.assertEqual(len(bom['components']), 4)
        self.assertEqual(bom['components'][0]['components'][0]['hashes'][0]['content'], 'a' * 64)

    def test_aggregates_existing_components_with_unique_refs(self):
        releases = [{'fork': str(i), 'tag': 'v1'} for i in range(4)]
        bom = aggregate(releases, lambda _: ([{'bomFormat': 'CycloneDX', 'components': [
            {'type': 'library', 'name': 'dep', 'bom-ref': 'dep'}]}], ''))
        refs = [c['components'][0]['bom-ref'] for c in bom['components']]
        self.assertEqual(len(set(refs)), 4)

    def test_refuses_missing_checksum_inventory(self):
        with self.assertRaises(ValueError):
            aggregate([{'fork': str(i), 'tag': 'v1'} for i in range(4)], lambda _: ([], ''))

    def test_release_exact_artifacts_include_sbom_with_and_without_macos(self):
        import os
        from pathlib import Path
        import runpy
        import tempfile
        from types import SimpleNamespace
        from unittest.mock import patch
        script = Path(__file__).with_name('release.py').resolve()
        names = {'ERPCons-VanPhong-windows-x64-setup.exe', 'ERPCons-VanPhong-windows-x64-portable.zip',
                 'ERPCons-VanPhong-linux-x86_64-AppImage.tar.gz', 'erpcons-vanphong_amd64-deb.tar.gz',
                 'erpcons-vanphong.x86_64-rpm.tar.gz'}
        for skip in ('true', 'false'):
            with self.subTest(skip=skip), tempfile.TemporaryDirectory() as tmp:
                previous = Path.cwd()
                try:
                    os.chdir(tmp)
                    root = Path('artifacts')
                    root.mkdir()
                    selected = names | (set() if skip == 'true' else {'ERPCons-VanPhong-macos-universal.dmg'})
                    for name in selected:
                        (root / name).write_bytes(b'installer')
                    Path('releases.json').write_text('[]')
                    with patch.dict(os.environ, {'SUITE_VERSION': '2026.10.22', 'GH_REPO': 'test/repo',
                                                  'GITHUB_SHA': 'a' * 40, 'SKIP_MACOS': skip}), \
                            patch('subprocess.run', return_value=SimpleNamespace(stdout='[]')) as run, \
                            patch('sbom.write_sbom', side_effect=lambda root, _: (root / 'sbom.cdx.json').write_text('{}')):
                        runpy.run_path(str(script))
                    self.assertEqual({p.name for p in root.iterdir()}, selected | {'sbom.cdx.json', 'SHA256SUMS.txt'})
                    self.assertIn('sbom.cdx.json', (root / 'SHA256SUMS.txt').read_text())
                    self.assertIn('artifacts/sbom.cdx.json', run.call_args.args[0])
                finally:
                    os.chdir(previous)
