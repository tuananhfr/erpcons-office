import { describe, expect, it } from 'vitest'
import { MIME_BY_EXTENSION, withMimeTypes } from './mime-types.ts'

const PICKER_EXTENSIONS = [
  'docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf', 'txt', 'md', 'html', 'htm', 'xml', 'json', 'csv', 'tsv',
  'xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'pptx', 'pptm', 'potx', 'ppsx', 'pdf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'jp2', 'ttf', 'otf', 'woff', 'woff2',
  'wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aif', 'aiff', 'mp4', 'm4v', 'mov', 'webm', 'p12', 'pfx',
]

describe('MIME_BY_EXTENSION', () => {
  it('covers every extension the editor pickers and the landing ask for', () => {
    for (const ext of PICKER_EXTENSIONS) expect(MIME_BY_EXTENSION[ext], ext).toBeDefined()
  })

  it('holds lower-case type/subtype strings only', () => {
    for (const [ext, mimes] of Object.entries(MIME_BY_EXTENSION)) {
      expect(mimes.length, ext).toBeGreaterThan(0)
      for (const mime of mimes) expect(mime, ext).toMatch(/^(application|audio|font|image|text|video)\/[a-z0-9.+-]+$/)
    }
  })
})

describe('withMimeTypes', () => {
  it('keeps the extensions and appends their types', () => {
    expect(withMimeTypes('.docx,.pdf')).toBe('.docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf')
  })

  it('adds a type shared by several extensions once', () => {
    expect(withMimeTypes('.jpg,.jpeg,.png')).toBe('.jpg,.jpeg,.png,image/jpeg,image/png')
  })

  it('is idempotent and leaves types already present alone', () => {
    const once = withMimeTypes('.csv, .tsv')
    expect(withMimeTypes(once)).toBe(once)
    expect(withMimeTypes('.pdf,APPLICATION/PDF')).toBe('.pdf,APPLICATION/PDF')
  })

  it('keeps unknown extensions and wildcards untouched', () => {
    expect(withMimeTypes('.deckcraft,.PPTX,image/*')).toBe('.deckcraft,.PPTX,image/*,application/vnd.openxmlformats-officedocument.presentationml.presentation')
  })

  it('returns an empty accept unchanged', () => {
    expect(withMimeTypes('')).toBe('')
  })
})
