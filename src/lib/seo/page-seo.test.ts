import { describe, expect, it } from 'vitest'
import { EDITORS, SITE } from '../../config/editors.ts'
import { HOME_SEO, EXPLORE_SEO, SEO_ASSETS, SEO_BRAND, editorSeo } from './page-seo.ts'
import { brandIcons, pageMetadata } from './metadata.ts'

describe('page SEO', () => {
  it('gives every indexable page its own absolute canonical and title', () => {
    const pages = [HOME_SEO, EXPLORE_SEO, ...EDITORS.map(editorSeo)]
    expect(new Set(pages.map(page => page.url)).size).toBe(6)
    expect(new Set(pages.map(page => page.title)).size).toBe(6)
    for (const page of pages) {
      expect(page.url).toMatch(/^https:\/\/office\.erpcons\.vn\//)
      expect(page.title).toContain(SEO_BRAND)
      expect(page.description).not.toBe('')
    }
  })

  it('keeps the discovery canonical, Open Graph and Twitter metadata on the same page', () => {
    expect(pageMetadata(EXPLORE_SEO)).toMatchObject({
      title: { absolute: EXPLORE_SEO.title },
      alternates: { canonical: SITE.origin + '/kham-pha/' },
      openGraph: { url: SITE.origin + '/kham-pha/', title: EXPLORE_SEO.title, images: [{ url: SITE.origin + SEO_ASSETS.image, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', title: EXPLORE_SEO.title },
    })
  })

  it('declares new PNG icons and an Apple icon instead of the old SVG', () => {
    const markup = JSON.stringify(brandIcons)
    expect(markup).toContain(SEO_ASSETS.icon32)
    expect(markup).toContain(SEO_ASSETS.apple)
    expect(markup).not.toContain('erpcons-mark.svg')
  })
})
