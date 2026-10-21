import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DesktopDownloads } from './DesktopDownloads.tsx'
import { EDITORS } from '../../config/editors.ts'
import { desktopDownloads } from '../../lib/desktop/downloads.ts'

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
