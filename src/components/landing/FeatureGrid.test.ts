import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EDITORS, editorPath } from '../../config/editors.ts'
import { FeatureGrid } from './FeatureGrid.tsx'

describe('FeatureGrid', () => {
  it('keeps four accessible editor links opening in separate tabs', () => {
    const html = renderToStaticMarkup(createElement(FeatureGrid))
    const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []
    expect(anchors).toHaveLength(4)
    for (const editor of EDITORS) {
      const link = anchors.find(anchor => anchor.includes(`href="${editorPath(editor.slug)}"`)) ?? ''
      expect(link).toContain('target="_blank"')
      expect(link).toContain('rel="noopener"')
      expect(link).not.toContain('aria-label')
      const name = link.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      expect(name).toBe(`${editor.name} ${editor.extension.slice(1).toUpperCase()} (tab mới)`)
    }
  })
})
