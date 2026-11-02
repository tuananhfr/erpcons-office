import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EDITORS, SITE } from '../../config/editors.ts'
import { piConfig } from '../../config/pi.ts'
import { signInPages } from '../account/sign-in-pages.ts'
import { webManifest } from '../pwa/web-manifest.ts'
import { editorSeoTags } from './editor-head.ts'
import { pageMetadata } from './metadata.ts'
import { HOME_SEO, EXPLORE_SEO, GUIDE_SEO, SEO_ASSETS } from './page-seo.ts'

const readAsset = (url: string) => fs.readFileSync(fileURLToPath(new URL(`../../../public${url}`, import.meta.url)))

describe('Office identity across sharing, installation and editor entry points', () => {
  it('ships a new social card and references it from every public metadata path', () => {
    expect(SEO_ASSETS.image).toBe('/brand/office/office-social.png')
    const png = readAsset(SEO_ASSETS.image)
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    for (const page of [HOME_SEO, EXPLORE_SEO, GUIDE_SEO]) {
      const metadata = pageMetadata(page)
      expect(JSON.stringify(metadata.openGraph)).toContain(SITE.origin + SEO_ASSETS.image)
      expect(JSON.stringify(metadata.twitter)).toContain(SITE.origin + SEO_ASSETS.image)
    }
    for (const editor of EDITORS) expect(editorSeoTags(editor).join('')).toContain(SITE.origin + SEO_ASSETS.image)
    // Previously shared image URLs must also serve the corrected artwork.
    expect(readAsset('/brand/van-phong-social.png')).toEqual(png)
    expect(readAsset('/brand/og-image.png')).toEqual(png)
  })

  it('uses current, existing identity assets in metadata, PWA and both sign-in pages', () => {
    for (const [key, value] of Object.entries(SEO_ASSETS)) {
      if (key === 'imageAlt') continue
      expect(value).toMatch(/^\/brand\/office\//)
      expect(readAsset(value).length).toBeGreaterThan(100)
    }
    const manifest = webManifest()
    for (const icon of manifest.icons ?? []) expect(icon.src).toMatch(/^\/brand\/office\//)
    for (const editor of EDITORS) expect(editorSeoTags(editor).join('')).not.toMatch(/van-phong-(?:icon|logo|social)/)
    const pi = piConfig(true)
    if (!pi) throw new Error('PI config missing')
    for (const page of signInPages(pi, '')) {
      expect(page.html).toContain(SEO_ASSETS.logo64)
      expect(page.html).toContain(SEO_ASSETS.icon32)
      expect(page.html).not.toContain('van-phong-')
    }
  })
})
