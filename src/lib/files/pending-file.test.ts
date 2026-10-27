import { describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { IntakeFailure, MAX_FILE_SIZE, checkSignature, editorForFile, pickerRecord, validateFile } from './pending-file.ts'

describe('local file routing', () => {
  it.each([['Report.DOCX', 'van-ban'], ['Budget.xlsx', 'bang-tinh'], ['Slides.pptx', 'trinh-chieu'], ['a.b.PDF', 'pdf'], ['old.doc', 'van-ban'], ['macro.xlsm', 'bang-tinh'], ['ghi-chu.md', 'van-ban']])('routes %s to the correct editor', (name, editor) => {
    expect(validateFile({ name, size: 32 })).toBe(editor)
  })

  it('routes every format an editor declares', () => {
    for (const e of EDITORS) for (const ext of e.accepts) expect(editorForFile(`x.${ext}`)).toBe(e.slug)
  })

  it.each(['slides.ppt', 'deck.odp', 'page.html', 'file.pdf.exe', 'no-extension'])('rejects unsupported %s with its code', name => {
    expect(editorForFile(name)).toBeUndefined()
    expect(() => validateFile({ name, size: 32 })).toThrow('(Mã: UNSUPPORTED_TYPE)')
  })

  it('rejects empty files and files above the memory limit before storing them', () => {
    expect(() => validateFile({ name: 'a.pdf', size: 0 })).toThrow('trống')
    expect(() => validateFile({ name: 'a.pdf', size: MAX_FILE_SIZE + 1 })).toThrow('100 MB')
    expect(() => validateFile({ name: 'a.pdf', size: MAX_FILE_SIZE + 1 })).toThrow('(Mã: TOO_LARGE)')
    expect(validateFile({ name: 'a.pdf', size: MAX_FILE_SIZE })).toBe('pdf')
  })
})

describe('checkSignature', () => {
  it('accepts content matching the extension and refuses a disguised file', async () => {
    await expect(checkSignature(new File(['%PDF-1.7'], 'a.pdf'))).resolves.toBeUndefined()
    await expect(checkSignature(new File(['plain'], 'a.txt'))).resolves.toBeUndefined()
    const failure = await checkSignature(new File(['%PDF-1.7'], 'a.docx')).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(IntakeFailure)
    expect((failure as IntakeFailure).code).toBe('INVALID_SIGNATURE')
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(checkSignature(new File([ole], 'Họp.pptx'))).rejects.toMatchObject({ reason: 'encryptedPresentation', code: 'UNSUPPORTED_TYPE' })
  })

  it('reports a file the browser can no longer read', async () => {
    const gone = { name: 'a.pdf', slice: () => ({ arrayBuffer: () => Promise.reject(new Error('gone')) }) } as unknown as File
    await expect(checkSignature(gone)).rejects.toMatchObject({ reason: 'unreadableFile', code: 'SOURCE_UNAVAILABLE' })
  })
})

describe('pickerRecord', () => {
  it('writes the same record fields as the share target', () => {
    const file = new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' })
    expect(pickerRecord(file, 'pdf', 'id-1', 1000)).toEqual({
      id: 'id-1', name: 'a.pdf', file, editor: 'pdf', batchId: undefined, sourceMode: 'PICKER', claimedMime: 'application/pdf', size: 8,
      state: 'READY', errorCode: null, reason: null, recoverable: false, createdAt: 1000, expiresAt: 1000 + 60 * 60 * 1000,
    })
  })
})
