import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { MIME_BY_EXTENSION } from '../src/lib/files/mime-types.ts'

const script = fs.readFileSync(fileURLToPath(new URL('share.js', import.meta.url)), 'utf8')
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

interface Options {
  share?: ((data: { files: File[]; title: string }) => Promise<void>) | null
  canShare?: ((data: { files: File[] }) => boolean) | null
  embedded?: boolean
}

function page({ share = async () => {}, canShare = () => true, embedded = false }: Options = {}) {
  const shared: { files: File[]; title: string }[] = []
  const notices: [string, string | undefined][] = []
  const clicks: { href: string; download: string }[] = []
  const revoked: string[] = []
  const navigator: Record<string, unknown> = {}
  if (share) navigator.share = (data: { files: File[]; title: string }) => { shared.push(data); return share(data) }
  if (canShare) navigator.canShare = canShare
  const context: Record<string, unknown> = {
    File, Promise, navigator, erpMimeTypes: MIME_BY_EXTENSION,
    URL: { createObjectURL: () => 'blob:office/1', revokeObjectURL: (url: string) => revoked.push(url) },
    document: {
      createElement: () => { const a = { href: '', download: '', click() { clicks.push({ href: a.href, download: a.download }) }, remove() {} }; return a },
      body: { appendChild() {} },
    },
    setTimeout: (fn: () => void) => fn(),
    erpShellNotice: (text: string, role?: string) => notices.push([text, role]),
  }
  if (embedded) context.erpEmbed = { origin: 'https://lpc.vn' }
  context.window = context
  vm.createContext(context)
  vm.runInContext(script, context)
  return {
    shared, notices, clicks, revoked,
    can: (mime?: string) => (context.erpCanShareFiles as (m?: string) => boolean)(mime),
    share: (bytes: Uint8Array, name: string, mime: string) => (context.erpShare as (b: Uint8Array, n: string, m: string) => boolean)(bytes, name, mime),
  }
}

const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('erpCanShareFiles', () => {
  it('is true only when the browser can share a file', () => {
    expect(page().can()).toBe(true)
    expect(page({ canShare: () => false }).can()).toBe(false)
    expect(page({ canShare: null }).can()).toBe(false)
    expect(page({ share: null }).can()).toBe(false)
    expect(page({ canShare: () => { throw new TypeError('bad') } }).can()).toBe(false)
  })

  it('asks with a real file, as Chrome only answers for files', () => {
    const seen: File[][] = []
    page({ canShare: (data) => { seen.push(data.files); return true } }).can()
    expect(seen[0]).toHaveLength(1)
    expect(seen[0][0]).toBeInstanceOf(File)
    expect(seen[0][0].type).toBe('application/pdf')
  })

  it('probes the format the fork exports, by MIME and its usual extension', () => {
    const seen: File[] = []
    // A browser whose allow-list takes PDF but not Word.
    const chrome = page({ canShare: (data) => { seen.push(data.files[0]); return /\.(pdf|txt|csv)$/.test(data.files[0].name) } })
    expect(chrome.can(docx)).toBe(false)
    expect(chrome.can('application/pdf')).toBe(true)
    expect(chrome.can()).toBe(true)
    expect(seen.map((f) => [f.name, f.type])).toEqual([['x.docx', docx], ['x.pdf', 'application/pdf'], ['x.pdf', 'application/pdf']])
    expect(page().can(docx)).toBe(true)
  })

  it('is false inside an ERP page, which owns where documents go', () => {
    expect(page({ embedded: true }).can()).toBe(false)
  })
})

describe('erpShare', () => {
  it('opens the share sheet with the exported bytes in the same call and confirms the export', async () => {
    const p = page()
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4])
    expect(p.share(bytes, 'Báo cáo.docx', docx)).toBe(true)
    expect(p.shared).toHaveLength(1)
    const [file] = p.shared[0].files
    expect([file.name, file.type, file.size, p.shared[0].title]).toEqual(['Báo cáo.docx', docx, 4, 'Báo cáo.docx'])
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
    await flush()
    expect(p.notices).toEqual([['Đã gửi bản xuất ‘Báo cáo.docx’.', undefined]])
    expect(p.clicks).toEqual([])
  })

  it('does nothing when the user cancels the share sheet', async () => {
    const p = page({ share: () => Promise.reject(new DOMException('cancelled', 'AbortError')) })
    expect(p.share(new Uint8Array([1]), 'a.pdf', 'application/pdf')).toBe(true)
    await flush()
    expect(p.notices).toEqual([])
    expect(p.clicks).toEqual([])
  })

  it.each(['NotAllowedError', 'DataError', 'TypeError'])('downloads the file itself and says why after %s', async (name) => {
    const p = page({ share: () => Promise.reject(new DOMException('no', name)) })
    expect(p.share(new Uint8Array([1]), 'Bảng lương.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    await flush()
    expect(p.notices).toEqual([['Không mở được bảng chia sẻ. Đã tải tệp xuống máy để bạn gửi thủ công.', 'alert']])
    expect(p.clicks).toEqual([{ href: 'blob:office/1', download: 'Bảng lương.xlsx' }])
    expect(p.revoked).toEqual(['blob:office/1'])
  })

  it('checks the real file first and leaves a refused type to the editor, without a notice or download', async () => {
    const asked: string[] = []
    const p = page({ canShare: (data) => { asked.push(data.files[0].name); return !data.files[0].name.endsWith('.xlsm') } })
    expect(p.share(new Uint8Array([1]), 'Dự toán.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12')).toBe(false)
    await flush()
    expect(asked).toEqual(['Dự toán.xlsm'])
    expect([p.shared, p.notices, p.clicks]).toEqual([[], [], []])
  })

  it('returns false so the editor downloads as usual when sharing is unavailable or throws', () => {
    expect(page({ canShare: () => false }).share(new Uint8Array([1]), 'a.pdf', 'application/pdf')).toBe(false)
    expect(page({ embedded: true }).share(new Uint8Array([1]), 'a.pdf', 'application/pdf')).toBe(false)
    const throwing = page({ share: () => { throw new DOMException('no activation', 'NotAllowedError') } })
    expect(throwing.share(new Uint8Array([1]), 'a.pdf', 'application/pdf')).toBe(false)
    expect(throwing.clicks).toEqual([])
  })
})
