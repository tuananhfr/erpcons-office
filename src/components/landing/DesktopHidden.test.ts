import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import HomePage from '../../../app/page.tsx'
import { DESKTOP_DOWNLOADS_ENABLED } from '../../config/desktop.ts'
import { siteFlags } from '../../config/site-flags.ts'

it.runIf(!DESKTOP_DOWNLOADS_ENABLED)('offers no desktop download anywhere on the home page while downloads are off', () => {
  const html = renderToStaticMarkup(createElement(HomePage))
  expect(html).not.toContain('tai-ban-desktop')
  expect(html).not.toContain('/releases/')
  expect(html).not.toContain('Có bản cài trên máy tính không?')
  expect(html).not.toMatch(/\.(exe|msi|dmg|AppImage|deb|rpm)\b/)
})

it.runIf(DESKTOP_DOWNLOADS_ENABLED && siteFlags().pi)('links no installer in the static home page: visitors sign in first', () => {
  const html = renderToStaticMarkup(createElement(HomePage))
  expect(html).toContain('id="tai-ban-desktop"')
  expect(html).toContain('Đăng nhập để tải')
  expect(html).not.toContain('/releases/')
  expect(html).not.toMatch(/\.(exe|msi|dmg|AppImage|deb|rpm)\b/)
})
