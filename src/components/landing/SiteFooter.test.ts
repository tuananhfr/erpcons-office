import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { organizationLd } from '../../lib/seo/structured-data.ts'
import { SiteFooter } from './SiteFooter.tsx'

const digits = (phone: string) => phone.replace(/\D/g, '').replace(/^84/, '0')

describe('SiteFooter', () => {
  it('shows the company, its tax code and address, and a phone link', () => {
    const html = renderToStaticMarkup(createElement(SiteFooter))
    expect(html).toContain('CÔNG TY CỔ PHẦN CÔNG NGHỆ ERPCONS · MST 0111149608 · Số 226 đường Lê Trọng Tấn, Phường Phương Liệt, Hà Nội')
    expect(html).toContain('<a href="tel:+84814228888">0814 228 888</a>')
  })

  // Scanners flag a structured-data phone that differs from the one on the page.
  it('prints the same phone number the Organization data declares', () => {
    const html = renderToStaticMarkup(createElement(SiteFooter))
    const shown = /<a href="tel:[^"]+">([^<]+)<\/a>/.exec(html)?.[1] ?? ''
    expect(digits(shown)).toBe(digits(String(organizationLd().telephone)))
  })
})
