import { describe, expect, it } from 'vitest'
import { PI_ACCOUNT_ENABLED, piConfig, piConfigScript } from './pi.ts'

describe('PI sign-in config', () => {
  it('is off in this repository, so production ships no account UI or calls', () => {
    expect(PI_ACCOUNT_ENABLED).toBe(false)
    expect(piConfig()).toBeNull()
    expect(piConfig(false)).toBeNull()
  })

  it('uses the web client of the contract, without the device scope', () => {
    expect(piConfig(true)).toEqual({
      version: 1,
      issuer: 'https://id.pi.invalid',
      apiBase: 'https://id.pi.invalid',
      clientId: 'erpcons-office-web',
      scopes: 'openid profile email offline_access pi.entitlements',
      signInPath: '/dang-nhap/',
      callbackPath: '/dang-nhap/callback/',
      catalogKeys: {},
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
