import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ONLINE_PAGE_EXTENSION, pageExtensions, siteFlags } from './site-flags.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.posix.join(dir, entry.name)
  return entry.isDirectory() ? walk(rel) : [rel]
})
const ONLINE_DIRS = ['src/components/documents/', 'src/lib/documents/']
const sources = [...walk('app'), ...walk('src')].filter((file) => /\.(tsx?|css)$/.test(file) && !file.endsWith('.test.ts'))

describe('site flags of the Next pages', () => {
  it('match the build flags: production has both on without a local override, and the override needs local provenance', () => {
    expect(siteFlags({})).toEqual({ pi: true, online: true, localOverride: false, piIssuer: null })
    expect(siteFlags({ ERPCONS_LOCAL_ONLINE: '1', ERPCONS_ALLOW_LOCAL_PROVENANCE: '1' })).toEqual({ pi: true, online: true, localOverride: true, piIssuer: null })
    expect(() => siteFlags({ ERPCONS_LOCAL_ONLINE: '1' })).toThrow(/local builds only/)
  })

  it('let Next see `page.online.tsx` routes only with online documents on', () => {
    expect(pageExtensions(false)).not.toContain(ONLINE_PAGE_EXTENSION)
    expect(pageExtensions(true)).toContain(ONLINE_PAGE_EXTENSION)
    expect(read('next.config.ts')).toContain('pageExtensions: pageExtensions(siteFlags().online)')
  })
})

describe('/tai-lieu/ is absent from a build with online documents off', () => {
  it('has its page only as page.online.tsx', () => {
    const pages = walk('app/tai-lieu')
    expect(pages).toEqual(['app/tai-lieu/chia-se/page.online.tsx', 'app/tai-lieu/lich-su/page.online.tsx', 'app/tai-lieu/page.online.tsx'])
  })

  it('is the only importer of the online page code and its styles', () => {
    const importers = sources.filter((file) => !ONLINE_DIRS.some((dir) => file.startsWith(dir)))
      .filter((file) => /@\/(components|lib)\/documents\/|styles\/documents(-sharing)?\.css/.test(read(file)))
    // The two panel pages are the share dialog and the version history the editor shows in a frame.
    expect(importers).toEqual(['app/tai-lieu/chia-se/page.online.tsx', 'app/tai-lieu/lich-su/page.online.tsx', 'app/tai-lieu/page.online.tsx'])
  })

  it('reaches the landing only through server components behind the flag', () => {
    expect(read('src/components/landing/Hero.tsx')).toContain('{siteFlags().online && <OnlineInvite />}')
    expect(read('src/components/landing/OnlineInvite.tsx')).not.toContain("'use client'")
    expect(read('src/components/landing/SiteHeader.tsx')).toContain("{siteFlags().online && <a href=\"/tai-lieu/\"")
  })
})

describe('online page code', () => {
  const online = sources.filter((file) => ONLINE_DIRS.some((dir) => file.startsWith(dir)))

  it('calls the API only through erpAccount.apiFetch, never fetch or cookies', () => {
    expect(online.length).toBeGreaterThan(10)
    for (const file of online) {
      const text = read(file)
      expect(text, file).not.toMatch(/\bfetch\(|XMLHttpRequest|document\.cookie|credentials:/)
    }
  })

  it('logs nothing (titles and ids are personal data) and never sets HTML from data', () => {
    for (const file of online) {
      const text = read(file)
      expect(text, file).not.toMatch(/console\.|dangerouslySetInnerHTML|innerHTML/)
    }
  })
})

describe('sign-up pages', () => {
  const SIGNUP_DIRS = ['src/components/signup/', 'src/lib/signup/']
  const signup = sources.filter((file) => SIGNUP_DIRS.some((dir) => file.startsWith(dir)))

  it('exist only as page.online.tsx, so a build with online documents off has none', () => {
    expect(walk('app/dang-ky')).toEqual(['app/dang-ky/page.online.tsx', 'app/dang-ky/xac-minh/page.online.tsx'])
  })

  it('are the only importers of the sign-up code and its styles', () => {
    const importers = sources.filter((file) => !SIGNUP_DIRS.some((dir) => file.startsWith(dir)))
      .filter((file) => /@\/(components|lib)\/signup\/|styles\/signup\.css/.test(read(file)))
    expect(importers).toEqual(['app/dang-ky/page.online.tsx', 'app/dang-ky/xac-minh/page.online.tsx'])
  })

  it('keep the password and the verification token out of storage, logs and HTML', () => {
    expect(signup.length).toBeGreaterThan(5)
    for (const file of signup) {
      const text = read(file)
      expect(text, file).not.toMatch(/console\.|localStorage|sessionStorage|indexedDB|document\.cookie|dangerouslySetInnerHTML|innerHTML/)
    }
  })

  it('call the API only from lib/signup/api.ts, without the PI token', () => {
    for (const file of signup.filter((name) => name !== 'src/lib/signup/api.ts')) expect(read(file), file).not.toMatch(/\bfetch\(/)
    for (const file of signup) expect(read(file), file).not.toMatch(/apiFetch\(/)
  })
})
