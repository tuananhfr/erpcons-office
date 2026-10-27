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
      ...base.accepts.map((ext) => `two editors accept .${ext}`),
    ])
  })

  it('reports ids that are not safe CSS identifiers', () => {
    expect(validateEditors([{ ...base, canvasId: 'bad id' }])).toEqual(['unsafe canvasId: bad id'])
  })

  it('reports an extension without a leading dot', () => {
    expect(validateEditors([{ ...base, extension: 'docx' }])).toEqual(['extension must start with a dot: docx'])
  })

  it('reports accepted extensions that miss the main one, carry a dot or upper case', () => {
    expect(validateEditors([{ ...base, accepts: ['.docx', 'DOC'] }])).toEqual([
      'van-ban does not accept its own .docx',
      'accepted extension must be lower-case without a dot: .docx',
      'accepted extension must be lower-case without a dot: DOC',
    ])
  })
})

describe('accepted formats', () => {
  it('route each format the engines open to one editor; legacy ppt/odp and html stay out', () => {
    expect(Object.fromEntries(EDITORS.map((e) => [e.slug, e.accepts]))).toEqual({
      'van-ban': ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf', 'txt', 'md'],
      'bang-tinh': ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'],
      'trinh-chieu': ['pptx', 'pptm', 'potx', 'ppsx'],
      pdf: ['pdf'],
    })
  })
})
