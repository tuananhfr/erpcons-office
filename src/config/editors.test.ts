import { describe, expect, it } from 'vitest'
import { EDITORS, editorPath, validateEditors, type EditorEntry } from './editors.ts'

describe('EDITORS', () => {
  it('is valid', () => {
    expect(validateEditors(EDITORS)).toEqual([])
  })

  it('lists the four features in landing order', () => {
    expect(EDITORS.map((e) => e.slug)).toEqual(['van-ban', 'bang-tinh', 'trinh-chieu', 'pdf'])
  })

  it('matches the canvas ids shipped by the forks', () => {
    expect(EDITORS.map((e) => [e.fork, e.canvasId, e.loadingId ?? null])).toEqual([
      ['wordcraft', 'wordcraft_canvas', 'wordcraft_loading'],
      ['gridcraft', 'gridcraft_canvas', 'gridcraft_loading'],
      ['deckcraft', 'deckcraft_canvas', 'deckcraft_loading'],
      ['pdfcraft', 'pdfcraft', null],
    ])
  })
})

describe('editorPath', () => {
  it('always ends with a slash', () => {
    expect(editorPath('van-ban')).toBe('/van-ban/')
  })
})

describe('validateEditors', () => {
  const base = EDITORS[0]

  it('reports duplicate slugs and canvas ids', () => {
    const dup: EditorEntry[] = [base, { ...base }]
    expect(validateEditors(dup)).toEqual([
      'duplicate slug: van-ban',
      'duplicate canvasId: wordcraft_canvas',
    ])
  })

  it('reports ids that are not safe CSS identifiers', () => {
    expect(validateEditors([{ ...base, canvasId: 'bad id' }])).toEqual(['unsafe canvasId: bad id'])
  })

  it('reports an extension without a leading dot', () => {
    expect(validateEditors([{ ...base, extension: 'docx' }])).toEqual(['extension must start with a dot: docx'])
  })
})
