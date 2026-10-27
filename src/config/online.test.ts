import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOCAL_ONLINE_ENV, ONLINE_ENABLED, buildFlags } from './online.ts'
import { PI_ACCOUNT_ENABLED } from './pi.ts'

const repo = (file: string) => fs.readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8')

describe('online documents flag', () => {
  it('is off in this repository, so production ships no online code or /api/v1/ calls', () => {
    expect(ONLINE_ENABLED).toBe(false)
    expect(buildFlags()).toEqual({ pi: PI_ACCOUNT_ENABLED, online: false, localOverride: false })
  })

  it('needs PI sign-in as well', () => {
    expect(buildFlags({}, [], { pi: false, online: true }).online).toBe(false)
    expect(buildFlags({}, [], { pi: true, online: true })).toEqual({ pi: true, online: true, localOverride: false })
  })
})

describe('local override', () => {
  it('turns PI sign-in and online documents on only together with the local-provenance override', () => {
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '1', ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toEqual({ pi: true, online: true, localOverride: true })
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '1' }, ['node', 'assemble.mts', '--allow-local-provenance']).localOverride).toBe(true)
  })

  it('fails the build instead of shipping a deployable out/ with it', () => {
    expect(() => buildFlags({ [LOCAL_ONLINE_ENV]: '1' })).toThrow(/local builds only/)
    expect(() => buildFlags({ [LOCAL_ONLINE_ENV]: '1', ERPCONS_ALLOW_LOCAL_PROVENANCE: '0' }, ['node', 'assemble.mts'])).toThrow(/local builds only/)
    expect(() => buildFlags({ [LOCAL_ONLINE_ENV]: 'true', ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toThrow(/must be 1/)
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '' })).toEqual({ pi: PI_ACCOUNT_ENABLED, online: false, localOverride: false })
  })

  it('cannot reach the production build: npm run build passes neither override, and build-info records the one it needs', () => {
    const scripts = JSON.parse(repo('package.json')).scripts as Record<string, string>
    for (const name of ['build', 'build:site']) {
      expect(scripts[name]).not.toContain(LOCAL_ONLINE_ENV)
      expect(scripts[name]).not.toContain('ERPCONS_ALLOW_LOCAL_PROVENANCE')
      expect(scripts[name]).not.toContain('--allow-local-provenance')
    }
    // deploy-office.sh (outside the repo) refuses an out/ whose build-info has localProvenanceOverride !== false.
    expect(repo('src/lib/build/provenance.ts')).toMatch(/localProvenanceOverride: override/)
    const assemble = repo('scripts/assemble.mts')
    expect(assemble).toContain('buildFlags(process.env, process.argv)')
    expect(assemble).toMatch(/buildInfo\(root, REPO_ROOT, process\.argv\.includes\('--allow-local-provenance'\) \|\| process\.env\.ERPCONS_ALLOW_LOCAL_PROVENANCE === '1'\)/)
  })
})
