import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { artifactHashes, buildInfo, lockedWasmBindgen, PROVENANCE, verifyProvenance } from './provenance.ts'
import { lockfileSbom } from './site-sbom.ts'
import { assetManifest } from './asset-manifest.ts'

vi.mock('node:child_process', () => ({ spawnSync: (_cmd: string, args: string[]) => ({ status: 0, stdout: args[0] === 'rev-parse' ? 'a'.repeat(40) : args[0] === 'branch' ? 'tuananhfr' : '' }) }))
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })
const state = { sha: 'a'.repeat(40), branch: 'tuananhfr', dirty: false, version: '1.0.0' }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-'))
  dirs.push(root)
  for (const { fork } of EDITORS) {
    const dir = path.join(root, fork)
    const dist = path.join(dir, 'dist', 'web')
    fs.mkdirSync(dist, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[workspace.package]\nversion = "1.0.0"\n')
    fs.writeFileSync(path.join(dist, 'main.wasm'), 'wasm')
    fs.writeFileSync(path.join(dist, 'main.js'), 'js')
    fs.writeFileSync(path.join(dist, PROVENANCE), JSON.stringify({ ...state, fork, tools: { rustc: 'rustc 1', cargo: 'cargo 1', 'wasm-bindgen': 'wasm-bindgen 1' }, builtAt: '2026-10-22T00:00:00Z', artifacts: artifactHashes(dist) }))
  }
  return { root, dist: path.join(root, 'wordcraft', 'dist', 'web') }
}
it('refuses reused dist with different SHA', () => {
  const { dist } = fixture()
  expect(() => verifyProvenance(dist, 'wordcraft', { ...state, sha: 'b'.repeat(40) })).toThrow('provenance mismatch')
})
it('refuses dirty checkout and dirty recorded build', () => {
  const { dist } = fixture()
  expect(() => verifyProvenance(dist, 'wordcraft', { ...state, dirty: true })).toThrow('dirty')
  const file = path.join(dist, PROVENANCE)
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), dirty: true }))
  expect(() => verifyProvenance(dist, 'wordcraft', state)).toThrow('dirty')
  expect(verifyProvenance(dist, 'wordcraft', state, true).dirty).toBe(true)
})
it('maps all four forks to actual artifact checksums and records override', () => {
  const { root } = fixture()
  const info = buildInfo(root, root, true)
  expect(Object.keys(info.forks)).toEqual(EDITORS.map((e) => e.fork))
  expect(info.localProvenanceOverride).toBe(true)
  for (const record of Object.values(info.forks)) {
    expect(record.artifacts['main.wasm']).toBe(createHash('sha256').update('wasm').digest('hex'))
    expect(record.artifacts['main.js']).toBe(createHash('sha256').update('js').digest('hex'))
  }
})
it('refuses modified artifacts even with local override', () => {
  const { dist } = fixture()
  fs.writeFileSync(path.join(dist, 'main.js'), 'changed')
  expect(() => verifyProvenance(dist, 'wordcraft', state, true)).toThrow('checksums')
})
it('records the wasm-bindgen version locked by the fork, not a CLI on PATH', () => {
  const { root } = fixture()
  const dir = path.join(root, 'wordcraft')
  fs.writeFileSync(path.join(dir, 'Cargo.lock'), '[[package]]\nname = "wasm-bindgen-macro"\nversion = "9.9.9"\n\n[[package]]\r\nname = "wasm-bindgen"\r\nversion = "0.2.129"\r\n')
  expect(lockedWasmBindgen(dir)).toBe('wasm-bindgen 0.2.129 (Cargo.lock)')
  fs.writeFileSync(path.join(dir, 'Cargo.lock'), '[[package]]\nname = "serde"\nversion = "1.0.0"\n')
  expect(() => lockedWasmBindgen(dir)).toThrow('Missing wasm-bindgen')
})
it('excludes site SBOM from precache and includes build-info', () => {
  const { root } = fixture()
  fs.writeFileSync(path.join(root, 'sbom.cdx.json'), '{}')
  fs.writeFileSync(path.join(root, 'build-info.json'), '{}')
  const manifest = assetManifest(root)
  expect(manifest.urls).not.toContain('/sbom.cdx.json')
  expect(manifest.urls).toContain('/build-info.json')
})
it('generates production component inventory from lockfile', () => {
  const bom = lockfileSbom({ packages: { '': {}, 'node_modules/a': { version: '1' }, 'node_modules/dev': { version: '2', dev: true } } })
  expect(bom.components.map((c) => c.name)).toEqual(['a'])
})
