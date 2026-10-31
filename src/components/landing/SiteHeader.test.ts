import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './SiteHeader.tsx'

const flag = vi.hoisted(() => ({ enabled: false, online: false }))
vi.mock('../../config/site-flags.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../config/site-flags.ts')>(),
  siteFlags: () => ({ pi: flag.enabled, online: flag.enabled && flag.online, localOverride: false, piIssuer: null }),
}))
afterEach(() => { flag.enabled = false; flag.online = false })

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

  it('offers Đăng ký (the PI create step, no page of its own) next to sign-in only with online documents on', () => {
    flag.enabled = true
    expect(renderToStaticMarkup(createElement(SiteHeader))).not.toContain('erp-account__sign-up')
    flag.online = true
    const html = renderToStaticMarkup(createElement(SiteHeader))
    expect(html.match(/<button type="button" class="erp-account__sign-up">Đăng ký<\/button>/g)).toHaveLength(2)
    expect(html).not.toContain('/dang-ky/')
  })

  it('moves the ERPCons link out of the bar next to the account entry, keeping it in the menu', () => {
    const actions = (html: string) => html.slice(html.indexOf('erp-header-actions'), html.indexOf('erp-mobile-menu'))
    expect(actions(renderToStaticMarkup(createElement(SiteHeader)))).toContain('erp-header-link')
    flag.enabled = true
    const html = renderToStaticMarkup(createElement(SiteHeader))
    expect(actions(html)).not.toContain('https://erpcons.ai/')
    expect(html.slice(html.indexOf('erp-mobile-menu'))).toContain('href="https://erpcons.ai/"')
  })
})
