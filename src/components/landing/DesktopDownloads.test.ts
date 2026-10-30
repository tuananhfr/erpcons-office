import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopOS } from '../../lib/desktop/downloads.ts'
import { DesktopDownloads } from './DesktopDownloads.tsx'
import { EDITORS } from '../../config/editors.ts'
import { desktopDownloads, suiteDownloads } from '../../lib/desktop/downloads.ts'

const platform = vi.hoisted(() => ({ os: null as DesktopOS | 'mobile' | null }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: () => platform.os,
}))
// Production gates the links behind PI sign-in (DesktopDownloadGate.test.ts); these cases look at the links themselves.
vi.mock('../account/use-pi-account.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../account/use-pi-account.ts')>(),
  usePiAccount: () => ({ status: 'signed-in' }),
}))
afterEach(() => { platform.os = null })

it('renders every download without JavaScript and guesses no primary OS', () => {
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  expect(html).toContain('id="tai-ban-desktop"')
  expect(html).not.toContain('erp-btn--primary')
  for (const editor of EDITORS) {
    const { assets, releaseUrl } = desktopDownloads(editor)
    for (const asset of assets) expect(html).toContain(`href="${asset.url}"`)
    expect(html).toContain(`href="${releaseUrl}"`)
  }
  expect(html).toContain('<details>')
  expect(html).toContain('SmartScreen')
})

it('renders the suite above individual downloads with both Windows suite links', () => {
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  const { assets, releaseUrl } = suiteDownloads()
  for (const asset of assets) expect(html).toContain(`href="${asset.url}"`)
  expect(html).toContain(`href="${releaseUrl}"`)
  expect(html.indexOf('Tải trọn bộ ERPCons Văn phòng')).toBeLessThan(html.indexOf('Hoặc tải từng ứng dụng'))
})

it('offers and promises nothing but Windows: no macOS or Linux link, label or install note', () => {
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  expect(html).toContain('Windows (64-bit)')
  expect(html).not.toMatch(/macos|\.dmg|linux|AppImage|\.deb|\.rpm|xattr|quarantine/i)
})

it('gives only the suite a primary action on Windows', () => {
  platform.os = 'windows'
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  expect(html.match(/class="erp-btn erp-btn--primary"/g)).toHaveLength(1)
  expect(html).toContain(`href="${suiteDownloads().releaseUrl}/download/ERPCons-VanPhong-windows-x64-setup.exe" class="erp-btn erp-btn--primary"`)
})

it('keeps all downloads accessible on mobile without a primary desktop action', () => {
  platform.os = 'mobile'
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  expect(html).not.toContain('erp-btn--primary')
  expect(html).toContain('/van-ban/')
  for (const asset of suiteDownloads().assets) expect(html).toContain(`href="${asset.url}"`)
})
