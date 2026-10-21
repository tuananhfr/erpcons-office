"""Offline checks for release input verification."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from releases import editors, files, verify


class ReleaseInputsTest(unittest.TestCase):
    def test_registry_covers_four_editors(self):
        self.assertEqual([base for base, _ in editors()], ['VanBan', 'BangTinh', 'TrinhChieu', 'PDF'])
        for base, _ in editors():
            self.assertEqual(len(files(base, 'windows')), 2)
            self.assertEqual(len(files(base, 'macos')), 1)
            self.assertEqual(len(files(base, 'linux')), 3)

    def test_checksum_accepts_text_and_binary_markers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'app.msi'
            path.write_bytes(b'verified package')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            for marker in [' ', '*']:
                verify(path, f'{digest} {marker}{path.name}\n')

    def test_checksum_rejects_missing_ambiguous_or_corrupt_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'app.msi'
            path.write_bytes(b'verified package')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            valid = f'{digest}  {path.name}\n'
            for sums in ['', valid.replace('app.msi', 'other.msi'), valid + valid, f'{"0" * 64}  app.msi\n']:
                with self.assertRaises(ValueError):
                    verify(path, sums)
            path.write_bytes(b'tampered package')
            with self.assertRaises(ValueError):
                verify(path, valid)


if __name__ == '__main__':
    unittest.main()
