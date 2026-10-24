import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './SiteHeader.tsx'

const flag = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../config/pi.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../config/pi.ts')>(),
  get PI_ACCOUNT_ENABLED() { return flag.enabled },
}))
afterEach(() => { flag.enabled = false })

describe('SiteHeader account entry', () => {
  it('shows no sign-in anywhere while PI sign-in is off', () => {
    const html = renderToStaticMarkup(createElement(SiteHeader))
    expect(html).not.toContain('erp-account')
    expect(html).not.toContain('Đăng nhập')
  })

  it('offers Đăng nhập in the header and in the mobile menu when enabled', () => {
    flag.enabled = true
    const html = renderToStaticMarkup(createElement(SiteHeader))
    expect(html.match(/class="erp-account__sign-in"/g)).toHaveLength(2)
    expect(html).toContain('erp-account--header')
    expect(html).toContain('erp-account--menu')
    expect(html.match(/Đăng nhập<\/button>/g)).toHaveLength(2)
    const actions = html.slice(html.indexOf('erp-header-actions'), html.indexOf('erp-mobile-menu'))
    expect(actions).toContain('erp-account--header')
  })
})
