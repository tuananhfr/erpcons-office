import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOCAL_ONLINE_ENV, LOCAL_PI_ISSUER_ENV, ONLINE_ENABLED, buildFlags } from './online.ts'
import { PI_ACCOUNT_ENABLED, PI_API_BASE, PI_ISSUER, piConfig } from './pi.ts'

const repo = (file: string) => fs.readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8')

describe('online documents flag', () => {
  it('is off in this repository, so production ships no online code or /api/v1/ calls', () => {
    expect(ONLINE_ENABLED).toBe(false)
    expect(buildFlags()).toEqual({ pi: PI_ACCOUNT_ENABLED, online: false, localOverride: false, piIssuer: null })
  })

  it('needs PI sign-in as well', () => {
    expect(buildFlags({}, [], { pi: false, online: true }).online).toBe(false)
    expect(buildFlags({}, [], { pi: true, online: true })).toEqual({ pi: true, online: true, localOverride: false, piIssuer: null })
  })
})

describe('local override', () => {
  it('turns PI sign-in and online documents on only together with the local-provenance override', () => {
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '1', ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toEqual({ pi: true, online: true, localOverride: true, piIssuer: null })
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '1' }, ['node', 'assemble.mts', '--allow-local-provenance']).localOverride).toBe(true)
  })

  it('fails the build instead of shipping a deployable out/ with it', () => {
    expect(() => buildFlags({ [LOCAL_ONLINE_ENV]: '1' })).toThrow(/local builds only/)
    expect(() => buildFlags({ [LOCAL_ONLINE_ENV]: '1', ERPCONS_ALLOW_LOCAL_PROVENANCE: '0' }, ['node', 'assemble.mts'])).toThrow(/local builds only/)
    expect(() => buildFlags({ [LOCAL_ONLINE_ENV]: 'true', ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toThrow(/must be 1/)
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '' })).toEqual({ pi: PI_ACCOUNT_ENABLED, online: false, localOverride: false, piIssuer: null })
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

describe('local PI issuer', () => {
  const mock = 'http://127.0.0.1:18797'

  it('points sign-in at another issuer only together with the local-provenance override', () => {
    expect(buildFlags({ [LOCAL_PI_ISSUER_ENV]: mock, ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toEqual({ pi: PI_ACCOUNT_ENABLED, online: false, localOverride: true, piIssuer: mock })
    expect(buildFlags({ [LOCAL_PI_ISSUER_ENV]: mock + '/' }, ['node', 'assemble.mts', '--allow-local-provenance']).piIssuer).toBe(mock)
    expect(buildFlags({ [LOCAL_ONLINE_ENV]: '1', [LOCAL_PI_ISSUER_ENV]: mock, ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toEqual({ pi: true, online: true, localOverride: true, piIssuer: mock })
    expect(buildFlags({ [LOCAL_PI_ISSUER_ENV]: '' }).piIssuer).toBeNull()
  })

  it('fails the build without the local-provenance override, or with anything but a bare http(s) origin', () => {
    expect(() => buildFlags({ [LOCAL_PI_ISSUER_ENV]: mock })).toThrow(/local builds only/)
    expect(() => buildFlags({ [LOCAL_PI_ISSUER_ENV]: mock, ERPCONS_ALLOW_LOCAL_PROVENANCE: '0' })).toThrow(/local builds only/)
    for (const bad of ['127.0.0.1:18797', 'ftp://127.0.0.1', mock + '/v1', mock + '/?a=1', mock + '/#x', 'http://u:p@127.0.0.1:18797']) {
      expect(() => buildFlags({ [LOCAL_PI_ISSUER_ENV]: bad, ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' }), bad).toThrow(/bare http\(s\) origin/)
    }
  })

  it('replaces the issuer and the API base of the PI config, nothing else', () => {
    expect(piConfig(true, mock)).toEqual({ ...piConfig(true)!, issuer: mock, apiBase: mock })
    expect(piConfig(true)).toMatchObject({ issuer: PI_ISSUER, apiBase: PI_API_BASE })
    expect(piConfig(false, mock)).toBeNull()
  })

  it('cannot reach the production build, and build-info records it', () => {
    const scripts = JSON.parse(repo('package.json')).scripts as Record<string, string>
    for (const name of ['build', 'build:site']) expect(scripts[name]).not.toContain(LOCAL_PI_ISSUER_ENV)
    const assemble = repo('scripts/assemble.mts')
    expect(assemble).toContain('piConfig(flags.pi, flags.piIssuer)')
    expect(assemble).toContain('localPiIssuer: flags.piIssuer')
    expect(assemble).toMatch(/JSON\.stringify\(record, null, 2\)/)
  })
})
