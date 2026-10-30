import { describe, expect, it } from 'vitest'
import { PI_ACCOUNT_ENABLED, piConfig, piConfigScript, piEndpoints } from './pi.ts'

describe('PI sign-in config', () => {
  it('is on in this repository and talks to the production PI Platform, never a placeholder or local host', () => {
    expect(PI_ACCOUNT_ENABLED).toBe(true)
    expect(piConfig()).toEqual(piConfig(true))
    expect(piConfig(false)).toBeNull()
    const hosts = Object.values(piConfig()!).filter((value): value is string => typeof value === 'string' && value.startsWith('http'))
    expect(hosts.length).toBe(7)
    for (const url of hosts) expect(new URL(url).origin, url).toBe('https://platform.pih.vn')
  })

  it('uses the registered web client and scopes, without the device or entitlements scope', () => {
    expect(piConfig(true)).toEqual({
      version: 1,
      issuer: 'https://platform.pih.vn',
      apiBase: 'https://platform.pih.vn',
      authorizationEndpoint: 'https://platform.pih.vn/id/authorize',
      tokenEndpoint: 'https://platform.pih.vn/id/token',
      revocationEndpoint: 'https://platform.pih.vn/id/revoke',
      endSessionEndpoint: 'https://platform.pih.vn/id/logout',
      meEndpoint: 'https://platform.pih.vn/api/v1/id/me',
      clientId: 'erpcons-office-web',
      scopes: 'openid profile email offline_access',
      signInPath: '/dang-nhap/',
      callbackPath: '/dang-nhap/callback/',
      catalogKeys: {},
    })
  })

  it('carries the endpoints of PI discovery, which the browser cannot fetch (no CORS)', () => {
    expect(piEndpoints('http://127.0.0.1:8088/')).toEqual({
      authorizationEndpoint: 'http://127.0.0.1:8088/id/authorize',
      tokenEndpoint: 'http://127.0.0.1:8088/id/token',
      revocationEndpoint: 'http://127.0.0.1:8088/id/revoke',
      endSessionEndpoint: 'http://127.0.0.1:8088/id/logout',
      meEndpoint: 'http://127.0.0.1:8088/api/v1/id/me',
    })
  })

  it('never pins the contract example key (lease.md §10, §12)', () => {
    const keys = JSON.stringify(piConfig(true)!.catalogKeys)
    expect(keys).not.toContain('pi-lease-example-1')
    expect(keys).not.toContain('9NYv3EVAYbyMCnyywdUpJU99yTSSE44tQ_XASMni0gA')
  })

  it('serializes the config so it cannot close the inline script', () => {
    const script = piConfigScript({ ...piConfig(true)!, issuer: 'https://x/</script><script>alert(1)' })
    expect(script.startsWith('window.erpPi={')).toBe(true)
    expect(script).not.toContain('</script')
  })
})
