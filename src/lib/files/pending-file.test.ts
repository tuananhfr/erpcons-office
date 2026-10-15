import { describe, expect, it } from 'vitest'
import { editorForFile, validateFile, MAX_FILE_SIZE } from './pending-file.ts'

describe('local file routing', () => {
  it.each([['Report.DOCX', 'van-ban'], ['Budget.xlsx', 'bang-tinh'], ['Slides.pptx', 'trinh-chieu'], ['a.b.PDF', 'pdf']])('routes %s to the correct editor', (name, editor) => {
    expect(validateFile({ name, size: 32 })).toBe(editor)
  })
  it.each(['report.doc', 'macro.xlsm', 'file.pdf.exe', 'no-extension'])('rejects unsupported %s', name => {
    expect(editorForFile(name)).toBeUndefined()
    expect(() => validateFile({ name, size: 32 })).toThrow('DOCX')
  })
  it('rejects empty files and files above the memory limit before storing them', () => {
    expect(() => validateFile({ name: 'a.pdf', size: 0 })).toThrow('trống')
    expect(() => validateFile({ name: 'a.pdf', size: MAX_FILE_SIZE + 1 })).toThrow('100 MB')
    expect(validateFile({ name: 'a.pdf', size: MAX_FILE_SIZE })).toBe('pdf')
  })
})
