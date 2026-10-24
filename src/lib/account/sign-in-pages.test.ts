import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { piConfig } from '../../config/pi.ts'
import { accountScript } from './account-script.ts'
import { signInPages } from './sign-in-pages.ts'

const shellDir = fileURLToPath(new URL('../../../editor-shell/', import.meta.url))
const config = piConfig(true)!
const script = accountScript(config, shellDir)

describe('sign-in pages', () => {
  it('are written at the paths the contract registers', () => {
    expect(signInPages(config, script).map(page => page.file)).toEqual(['dang-nhap/index.html', 'dang-nhap/callback/index.html'])
  })

  it.each(signInPages(config, script).map(page => [page.file, page.html]))('%s keeps the code out of referrers and search, in Vietnamese', (_file, html) => {
    expect(html).toContain('<html lang="vi">')
    expect(html).toContain('<meta name="referrer" content="no-referrer">')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain('<p data-erp-sign-in-status role="status">Đang đăng nhập…</p>')
    expect(html).toContain('data-erp-sign-in-error role="alert" hidden')
    expect(html).toContain('<button type="button" data-erp-sign-in-close>Đóng</button>')
    expect(html).toContain('data-erp-sign-in-message')
    expect(html).toContain(`<script>${script}</script>`)
  })

  it('carry the config and the same account.js as the editors', () => {
    expect(script.startsWith('window.erpPi={"version":1,')).toBe(true)
    expect(script).toContain(fs.readFileSync(`${shellDir}account.js`, 'utf8'))
  })

  it('refuse a script that would close its own tag', () => {
    expect(() => signInPages(config, 'x="</script>"')).toThrow('</script')
  })
})
