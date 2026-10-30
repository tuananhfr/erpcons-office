import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountSnapshot } from '../../lib/account/types.ts'
import { suiteDownloads } from '../../lib/desktop/downloads.ts'
import { DesktopDownloads } from './DesktopDownloads.tsx'

const store = vi.hoisted(() => ({ account: null as AccountSnapshot | null, pi: true }))
// The visitor's OS is unknown, as in the static HTML.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: () => null,
}))
vi.mock('../../config/pi.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../config/pi.ts')>(),
  get PI_ACCOUNT_ENABLED() { return store.pi },
}))
vi.mock('../account/use-pi-account.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../account/use-pi-account.ts')>()
  return { ...actual, usePiAccount: () => store.account }
})

const snapshot = (status: AccountSnapshot['status']): AccountSnapshot => ({
  version: 1, status, user: status === 'signed-in' ? { id: 'u', name: 'An', email: 'an@x.vn' } : null, orgs: [], activeOrg: null,
  product: null, entitlements: [], entitlementsFresh: false, error: null,
})

// The local override turns PI sign-in and online documents (with /dang-ky/) on together.
const piOn = () => {
  vi.stubEnv('ERPCONS_LOCAL_ONLINE', '1')
  vi.stubEnv('ERPCONS_ALLOW_LOCAL_PROVENANCE', '1')
}

afterEach(() => { store.account = null; store.pi = true; vi.unstubAllEnvs() })

describe('desktop downloads behind PI sign-in', () => {
  it('offer every link without a gate while PI sign-in is off', () => {
    store.pi = false
    const html = renderToStaticMarkup(createElement(DesktopDownloads))
    expect(html).not.toContain('Đăng nhập để tải')
    for (const asset of suiteDownloads().assets) expect(html).toContain(`href="${asset.url}"`)
  })

  it.each([null, 'signed-out', 'signing-in'] as const)('show only "Đăng nhập để tải" and the sign-up link when %s (production flags)', (status) => {
    store.account = status === null ? null : snapshot(status)
    const html = renderToStaticMarkup(createElement(DesktopDownloads))
    expect(html).toContain('<h3>Đăng nhập để tải</h3>')
    expect(html).toContain('href="/dang-ky/"')
    expect(html).not.toContain('/releases/')
    expect(html).not.toContain('erp-downloads__links')
  })

  it('show the downloads once signed in', () => {
    piOn()
    store.account = snapshot('signed-in')
    const html = renderToStaticMarkup(createElement(DesktopDownloads))
    expect(html).not.toContain('Đăng nhập để tải')
    for (const asset of suiteDownloads().assets) expect(html).toContain(`href="${asset.url}"`)
  })

  it('offer no sign-in where it cannot work (embedded)', () => {
    piOn()
    store.account = snapshot('disabled')
    const html = renderToStaticMarkup(createElement(DesktopDownloads))
    expect(html).toContain('Đăng nhập để tải')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('/releases/')
  })
})
