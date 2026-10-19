import { describe, expect, it } from 'vitest'
import { cargoCyclonedxArgs, componentCount, npmSbomPackageJson, sbomFileName, sbomIndex, workspaceMemberDirs, type SbomEntry } from './sbom.ts'

describe('sbomFileName', () => {
  it('names the file after the component and the commit', () => {
    expect(sbomFileName('wordcraft-web', 'a044ae0')).toBe('wordcraft-web-a044ae0.cdx.json')
    expect(sbomFileName('erpcons-office', '0123456789abcdef0123456789abcdef01234567')).toBe('erpcons-office-0123456789abcdef0123456789abcdef01234567.cdx.json')
  })

  it('refuses names that could leave the sbom directory or are not lowercase', () => {
    for (const name of ['../x', 'a/b', 'a\\b', '', '.hidden', 'Upper']) expect(() => sbomFileName(name, 'a044ae0')).toThrow(/name/)
  })

  it('refuses anything that is not a git sha', () => {
    for (const sha of ['', 'abc', 'HEAD', 'A044AE0', 'a044ae0\n', 'g044ae0']) expect(() => sbomFileName('x', sha)).toThrow(/sha/)
  })
})

describe('componentCount', () => {
  it('counts nested components but not the root', () => {
    expect(componentCount({ components: [{}, { components: [{}, { components: [{}] }] }] })).toBe(5)
  })

  it('is 0 for a BOM without components', () => {
    expect(componentCount({})).toBe(0)
    expect(componentCount({ components: [] })).toBe(0)
  })
})

function entry(name: string): SbomEntry {
  return { name, file: `${name}-a044ae0.cdx.json`, repo: name, commit: 'a044ae0', branch: 'tuananhfr', dirty: false, covers: 'x', components: 1 }
}

describe('sbomIndex', () => {
  it('lists the SBOMs by name with the time they were made', () => {
    const index = sbomIndex([entry('wordcraft-web'), entry('erpcons-office'), entry('deckcraft-web')], new Date(Date.UTC(2026, 9, 20, 1, 2, 3)))
    expect(index.generatedAt).toBe('2026-10-20T01:02:03.000Z')
    expect(index.sboms.map((s) => s.name)).toEqual(['deckcraft-web', 'erpcons-office', 'wordcraft-web'])
  })

  it('refuses two SBOMs with one name', () => {
    expect(() => sbomIndex([entry('a'), entry('a')], new Date())).toThrow(/two SBOMs named a/)
  })

  it('leaves the caller list alone', () => {
    const list = [entry('b'), entry('a')]
    sbomIndex(list, new Date())
    expect(list.map((s) => s.name)).toEqual(['b', 'a'])
  })
})

describe('cargoCyclonedxArgs', () => {
  it('asks for CycloneDX 1.5 JSON for the wasm target under a fixed file name', () => {
    expect(cargoCyclonedxArgs('/w/wordcraft/apps/wordcraft-web/Cargo.toml', 'stem')).toEqual([
      'cyclonedx', '--manifest-path', '/w/wordcraft/apps/wordcraft-web/Cargo.toml', '--format', 'json', '--spec-version', '1.5',
      '--target', 'wasm32-unknown-unknown', '--override-filename', 'stem',
    ])
  })
})

describe('npmSbomPackageJson', () => {
  it('adds a placeholder version only when there is none', () => {
    expect(npmSbomPackageJson({ name: 'erpcons-office', private: true })).toEqual({ name: 'erpcons-office', private: true, version: '0.0.0' })
    expect(npmSbomPackageJson({ name: 'x', version: '1.2.3' })).toEqual({ name: 'x', version: '1.2.3' })
  })
})

describe('workspaceMemberDirs', () => {
  it('strips Cargo.toml from Windows and POSIX manifest paths', () => {
    expect(workspaceMemberDirs({ packages: [{ manifest_path: 'G:\\w\\crates\\doc\\Cargo.toml' }, { manifest_path: '/w/apps/web/Cargo.toml' }] }))
      .toEqual(['G:\\w\\crates\\doc', '/w/apps/web'])
  })
})
