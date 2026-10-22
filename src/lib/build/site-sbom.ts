import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { npmSbomPackageJson } from './sbom.ts'

export function lockfileSbom(lock: { name?: string; version?: string; packages: Record<string, { name?: string; version?: string; dev?: boolean; resolved?: string }> }) {
  return { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { component: { type: 'application', name: lock.name ?? 'erpcons-office', version: lock.version ?? '0.0.0' } },
    components: Object.entries(lock.packages).filter(([key, pkg]) => key && !pkg.dev && pkg.version).map(([key, pkg]) => ({
      type: 'library', 'bom-ref': key, name: pkg.name ?? key.split('node_modules/').pop(), version: pkg.version,
      ...(pkg.resolved ? { externalReferences: [{ type: 'distribution', url: pkg.resolved }] } : {}),
    })) }
}
export function siteSbom(root: string): unknown {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-sbom-'))
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(npmSbomPackageJson(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')))))
    fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(tmp, 'package-lock.json'))
    const result = spawnSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev', '--package-lock-only'], { cwd: tmp, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    if (result.status === 0) {
      const bom = JSON.parse(result.stdout) as { bomFormat?: string }
      if (bom.bomFormat !== 'CycloneDX') throw new Error('npm returned invalid SBOM')
      return bom
    }
    return lockfileSbom(JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
