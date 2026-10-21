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

it('renders the suite above individual downloads with all six asset links', () => {
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  const { assets, releaseUrl } = suiteDownloads()
  for (const asset of assets) expect(html).toContain(`href="${asset.url}"`)
  expect(html).toContain(`href="${releaseUrl}"`)
  expect(html.indexOf('Tải trọn bộ ERPCons Văn phòng')).toBeLessThan(html.indexOf('Hoặc tải từng ứng dụng'))
})

it.each([
  ['windows', 'ERPCons-VanPhong-windows-x64-setup.exe'],
  ['macos', 'ERPCons-VanPhong-macos-universal.dmg'],
  ['linux', 'ERPCons-VanPhong-linux-x86_64-AppImage.tar.gz'],
] as const)('gives only the suite a primary action on %s', (os, file) => {
  platform.os = os
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  expect(html.match(/class="erp-btn erp-btn--primary"/g)).toHaveLength(1)
  expect(html).toContain(`href="${suiteDownloads().releaseUrl}/download/${file}" class="erp-btn erp-btn--primary"`)
})

it('keeps all downloads accessible on mobile without a primary desktop action', () => {
  platform.os = 'mobile'
  const html = renderToStaticMarkup(createElement(DesktopDownloads))
  expect(html).not.toContain('erp-btn--primary')
  expect(html).toContain('/van-ban/')
  for (const asset of suiteDownloads().assets) expect(html).toContain(`href="${asset.url}"`)
})
