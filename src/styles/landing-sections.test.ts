import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(new URL('./landing-sections.css', import.meta.url), 'utf8')

describe('site header styles', () => {
  it('keeps tablet navigation compact without changing desktop or mobile breakpoints', () => {
    const tablet = css.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{([\s\S]*?)\n\}/)?.[1]
    expect(tablet).toBeDefined()
    expect(tablet).toMatch(/\.erp-site-header__inner\s*\{[^}]*gap:\s*16px;/)
    expect(tablet).toMatch(/\.erp-desktop-nav\s*\{[^}]*gap:\s*12px;[^}]*flex-shrink:\s*0;/)
    expect(tablet).toMatch(/\.erp-header-link\s*\{\s*display:\s*none;/)
    expect(tablet).toMatch(/\.erp-install--header \.erp-install__button\s*\{[^}]*gap:\s*6px;[^}]*padding-inline:\s*10px;/)
    const mobile = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)?.[1]
    expect(mobile).toMatch(/\.erp-desktop-nav, \.erp-header-actions\s*\{\s*display:\s*none;/)
    expect(mobile).toMatch(/\.erp-mobile-menu\s*\{\s*display:\s*block;/)
  })
})
