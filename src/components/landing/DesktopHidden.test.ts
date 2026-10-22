import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import HomePage from '../../../app/page.tsx'
import { DESKTOP_DOWNLOADS_ENABLED } from '../../config/desktop.ts'

it.runIf(!DESKTOP_DOWNLOADS_ENABLED)('offers no desktop download anywhere on the home page while downloads are off', () => {
  const html = renderToStaticMarkup(createElement(HomePage))
  expect(html).not.toContain('tai-ban-desktop')
  expect(html).not.toContain('/releases/')
  expect(html).not.toContain('Có bản cài trên máy tính không?')
  expect(html).not.toMatch(/\.(exe|msi|dmg|AppImage|deb|rpm)\b/)
})
