import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(new URL('./landing-sections.css', import.meta.url), 'utf8')
const block = (query: string) => css.match(new RegExp(`@media ${query.replace(/[()]/g, '\\$&')} \\{([\\s\\S]*?)\\n\\}`))?.[1]

// With sign-in, sign-up, "Tài liệu của tôi", "Tải về" and "Cài ứng dụng" all on, the inline nav overflowed below 1280 px.
describe('site header styles', () => {
  it('moves the navigation into the menu below 1024 px and keeps install and the account in the tablet bar', () => {
    const compact = block('(max-width: 1023px)')
    expect(compact).toMatch(/\.erp-desktop-nav\s*\{\s*display:\s*none;/)
    expect(compact).toMatch(/\.erp-mobile-menu\s*\{\s*display:\s*block;/)
    expect(compact).toMatch(/\.erp-mobile-menu nav\s*\{[^}]*top:\s*100%;/)
    const tablet = block('(min-width: 768px) and (max-width: 1023px)')
    expect(tablet).toMatch(/\.erp-header-actions\s*\{\s*margin-left:\s*auto;/)
    expect(tablet).toMatch(/\.erp-install--header \.erp-install__button\s*\{[^}]*gap:\s*6px;[^}]*padding-inline:\s*10px;/)
    expect(tablet).toMatch(/\.erp-mobile-menu \.erp-install--menu, \.erp-mobile-menu \.erp-account--menu\s*\{\s*display:\s*none;/)
    const mobile = block('(max-width: 767px)')
    expect(mobile).toMatch(/\.erp-header-actions\s*\{\s*display:\s*none;/)
  })

  it('drops only the duplicate home link and the sign-up link between 1024 and 1279 px', () => {
    const narrow = block('(min-width: 1024px) and (max-width: 1279px)')
    expect(narrow).toMatch(/\.erp-desktop-nav \.erp-nav-home\s*\{\s*display:\s*none;/)
    expect(css).toContain('@media (max-width: 1279px) { .erp-account--header .erp-account__sign-up { display: none; } }')
  })

  it('never wraps the ERPCons link', () => {
    expect(css).toMatch(/\.erp-header-link\s*\{[^}]*white-space:\s*nowrap;/)
  })
})
