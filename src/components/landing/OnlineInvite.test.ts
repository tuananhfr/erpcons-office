import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hero } from './Hero.tsx'
import { SiteHeader } from './SiteHeader.tsx'

const flags = vi.hoisted(() => ({ pi: false, online: false }))
vi.mock('../../config/site-flags.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../config/site-flags.ts')>(),
  siteFlags: () => ({ pi: flags.pi, online: flags.online, localOverride: false }),
}))
afterEach(() => { flags.pi = false; flags.online = false })

const FREE_LINE = 'Không cần tài khoản <span>·</span> Tệp xử lý trên thiết bị'

describe('landing with online documents', () => {
  it('says nothing about online storage while the flag is off', () => {
    const html = renderToStaticMarkup(createElement(Hero)) + renderToStaticMarkup(createElement(SiteHeader))
    expect(html).not.toContain('/tai-lieu/')
    expect(html).not.toContain('lưu online')
    expect(html).toContain(FREE_LINE)
  })

  it('adds one sign-in line and the documents link when on, keeping the Free promise word for word', () => {
    flags.pi = true
    flags.online = true
    const hero = renderToStaticMarkup(createElement(Hero))
    expect(hero).toContain(FREE_LINE)
    expect(hero.match(/href="\/tai-lieu\/"/g)).toHaveLength(1)
    expect(hero).toContain('Đăng nhập để lưu online</a>')
    const header = renderToStaticMarkup(createElement(SiteHeader, { active: 'documents' }))
    expect(header.match(/<a href="\/tai-lieu\/" aria-current="page">Tài liệu của tôi<\/a>/g)).toHaveLength(2)
  })
})
