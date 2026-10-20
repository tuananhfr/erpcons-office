import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { MIME_BY_EXTENSION, withMimeTypes } from '../src/lib/files/mime-types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'file-picker.js'), 'utf8')

interface FakeInput { type: string; accept: string; click: () => string }

function loadPicker(types: unknown = MIME_BY_EXTENSION) {
  const clicked: string[] = []
  class HTMLInputElement {
    type = 'text'
    accept = ''
    click(this: FakeInput) {
      clicked.push(this.accept)
      return 'native'
    }
  }
  vm.runInNewContext(SOURCE, { window: { erpMimeTypes: types }, HTMLInputElement })
  const input = (type: string, accept: string): FakeInput => Object.assign(new HTMLInputElement(), { type, accept }) as FakeInput
  return { input, clicked }
}

describe('file picker MIME types for iOS', () => {
  it('adds the MIME types before the native click and keeps the extensions', () => {
    const p = loadPicker()
    const rfd = p.input('file', '.docx,.docm,.dotx,.dotm,.doc,.dot,.odt,.rtf,.txt,.md,.html,.htm,.json,.xml')
    expect(rfd.click()).toBe('native')
    expect(p.clicked).toEqual([rfd.accept])
    expect(rfd.accept.startsWith('.docx,.docm,.dotx,.dotm,.doc,.dot,.odt,.rtf,.txt,.md,.html,.htm,.json,.xml,')).toBe(true)
    expect(rfd.accept).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(rfd.accept).toContain('application/msword')
    expect(rfd.accept.split(',').filter((t) => t === 'application/msword')).toHaveLength(1)
  })

  it('matches the landing helper, so both pickers ask iOS for the same types', () => {
    const p = loadPicker()
    for (const accept of ['.xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.txt,.json', '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.gif,.bmp,.jp2', '.p12,.pfx', '.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff']) {
      const rfd = p.input('file', accept)
      rfd.click()
      expect(rfd.accept).toBe(withMimeTypes(accept))
    }
  })

  it('keeps extensions it has no type for, like deckcraft\'s own format', () => {
    const p = loadPicker()
    const rfd = p.input('file', '.deckcraft,.pptx,.potx,.ppsx,.txt,.md')
    rfd.click()
    expect(rfd.accept).toBe(withMimeTypes('.deckcraft,.pptx,.potx,.ppsx,.txt,.md'))
    expect(rfd.accept.startsWith('.deckcraft,')).toBe(true)
  })

  it('does not grow the list when the same input is clicked again', () => {
    const p = loadPicker()
    const rfd = p.input('file', '.pdf')
    rfd.click()
    rfd.click()
    expect(rfd.accept).toBe('.pdf,application/pdf')
  })

  it('leaves other inputs and file inputs without accept alone', () => {
    const p = loadPicker()
    const text = p.input('text', '.pdf')
    const any = p.input('file', '')
    text.click()
    any.click()
    expect(text.accept).toBe('.pdf')
    expect(any.accept).toBe('')
    expect(p.clicked).toEqual(['.pdf', ''])
  })

  it('does not patch anything without a type map', () => {
    const p = loadPicker(null)
    const rfd = p.input('file', '.pdf')
    rfd.click()
    expect(rfd.accept).toBe('.pdf')
  })
})
