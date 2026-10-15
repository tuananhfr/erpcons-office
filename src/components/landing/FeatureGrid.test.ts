import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EDITORS, editorPath } from '../../config/editors.ts'
import { FeatureGrid } from './FeatureGrid.tsx'

describe('FeatureGrid', () => {
  it('opens each editor in a new tab so several can stay open', () => {
    const html = renderToStaticMarkup(createElement(FeatureGrid))
    for (const e of EDITORS) {
      expect(html).toContain(`href="${editorPath(e.slug)}" target="_blank" rel="noopener" aria-label="Mở ${e.name} (tab mới)">Mở ${e.name}</a>`)
    }
  })
})
