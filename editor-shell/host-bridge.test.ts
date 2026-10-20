import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const openFile = fs.readFileSync(fileURLToPath(new URL('open-file.js', import.meta.url)), 'utf8')
const bridge = fs.readFileSync(fileURLToPath(new URL('host-bridge.js', import.meta.url)), 'utf8')

const ERP = 'https://lpc.vn'
const embedSearch = (parentOrigin = ERP) => `?embed=erpcons&parent=${encodeURIComponent(parentOrigin)}`

interface Posted { data: Record<string, unknown>; origin: string; transfer?: unknown[] }
interface Delivery { files: { name: string }[]; name: string; done?: () => void; cleanup?: () => void }

// Runs open-file.js then host-bridge.js in one realm whose global is also `window`, like a page.
export function harness({ search = embedSearch(), path = '/bang-tinh/', hosts = [ERP] as string[] | null } = {}) {
  const posted: Posted[] = []
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const classes = new Set<string>()
  const parent = { postMessage: (data: Record<string, unknown>, origin: string, transfer?: unknown[]) => posted.push({ data, origin, transfer }) }
  const nativePicker: unknown[] = []
  const nativeClicks: unknown[] = []
  let objectUrls = 0
  class FakeURL extends URL {
    static createObjectURL() { objectUrls += 1; return `blob:https://office.erpcons.vn/${objectUrls}` }
    static revokeObjectURL() {}
  }
  class Anchor { download = ''; href = ''; click() { nativeClicks.push(this) } }
  const context: Record<string, unknown> = {
    URLSearchParams, URL: FakeURL, Date, Promise, ArrayBuffer, Uint8Array, Error, Blob,
    HTMLAnchorElement: Anchor,
    showSaveFilePicker: async (options: unknown) => { nativePicker.push(options); return { native: true } },
    File: class { parts: unknown[]; name: string; constructor(parts: unknown[], name: string) { this.parts = parts; this.name = name } },
    location: { search, pathname: path, href: 'https://office.erpcons.vn' + path + search },
    document: {
      documentElement: { classList: { add: (name: string) => classes.add(name), contains: (name: string) => classes.has(name) } },
      createElement: () => ({ setAttribute() {}, appendChild() {}, remove() {} }),
      body: { appendChild() {} },
      querySelector: () => null,
    },
    parent,
    addEventListener: (type: string, listener: (event: unknown) => void) => { (listeners[type] ||= []).push(listener) },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  }
  if (hosts) context.erpEmbedHosts = hosts
  context.window = context
  vm.createContext(context)
  vm.runInContext(openFile, context)
  const exposedDeliver = context.erpShellDeliver
  const delivered: Delivery[] = []
  context.erpShellDeliver = (files: { name: string }[], name: string, done?: () => void, cleanup?: () => void) => { delivered.push({ files, name, done, cleanup }) }
  vm.runInContext(bridge, context)
  const send = (data: unknown, { origin = ERP, source = parent as unknown } = {}) => {
    (listeners.message || []).forEach(listener => listener({ data, origin, source }))
  }
  const types = () => posted.map(entry => entry.data.type)
  // Opens `name` the way the ERP does and lets the editor accept it.
  const openAccepted = (name: string) => {
    send(msg('open', { name, bytes: new ArrayBuffer(1) }))
    delivered.at(-1)?.done?.()
  }
  return { context, posted, types, send, delivered, classes, parent, exposedDeliver, nativePicker, nativeClicks, openAccepted, Anchor }
}

export const msg = (type: string, payload: Record<string, unknown> = {}) => ({ ns: 'erp-office', v: 1, type, ...payload })

describe('host bridge activation', () => {
  it('lets open-file.js hand its deliver function to the bridge', () => {
    expect(typeof harness().exposedDeliver).toBe('function')
  })

  it('stays inert without embed=erpcons', () => {
    const page = harness({ search: '' })
    expect(page.context.erpEmbed).toBeUndefined()
    expect(page.posted).toHaveLength(0)
    expect(page.classes.has('erp-embedded')).toBe(false)
    expect(page.context.erpEditorClosed).toBeUndefined()
  })

  it('stays inert when the parent origin is not allowed', () => {
    const page = harness({ search: embedSearch('https://evil.test') })
    expect(page.context.erpEmbed).toBeUndefined()
    expect(page.posted).toHaveLength(0)
  })

  it('stays inert when no host list was injected', () => {
    const page = harness({ hosts: null })
    expect(page.context.erpEmbed).toBeUndefined()
    expect(page.posted).toHaveLength(0)
  })

  it('announces ready to the allowed parent only', () => {
    const page = harness()
    expect(page.posted).toHaveLength(1)
    expect(page.posted[0].data).toEqual(msg('ready', { editor: 'bang-tinh' }))
    expect(page.posted[0].origin).toBe(ERP)
    expect(page.classes.has('erp-embedded')).toBe(true)
  })
})

describe('reporting the last document closed', () => {
  it('posts closed once to the allowed parent with protocol v1', () => {
    const page = harness()
    page.openAccepted('a.xlsx')
    const before = page.posted.length
    const close = page.context.erpEditorClosed as () => void
    close()
    expect(page.posted.slice(before)).toEqual([
      { data: msg('closed'), origin: ERP, transfer: [] },
    ])
  })

  it('clears the original name so a later same-name save downloads', () => {
    const page = harness({ path: '/pdf/' })
    page.openAccepted('b.pdf')
    const bridge = page.context.erpEmbed as { originalName: () => string | null }
    expect(bridge.originalName()).toBe('b.pdf')
    const close = page.context.erpEditorClosed as () => void
    close()
    expect(bridge.originalName()).toBeNull()
    const URLs = page.context.URL as { createObjectURL: (blob: Blob) => string }
    const anchor = new page.Anchor()
    anchor.download = 'b.pdf'
    anchor.href = URLs.createObjectURL(new Blob(['x']))
    anchor.click()
    expect(page.nativeClicks).toEqual([anchor])
    expect(page.types()).not.toContain('save')
  })
})

describe('opening a file sent by the ERP', () => {
  const open = (name = 'Dự toán.xlsx') => msg('open', { name, bytes: new ArrayBuffer(3) })

  it('ignores messages from another origin or another window', () => {
    const page = harness()
    page.send(open(), { origin: 'https://evil.test' })
    page.send(open(), { source: {} })
    expect(page.delivered).toHaveLength(0)
  })

  it('rejects messages with another namespace or version', () => {
    const page = harness()
    page.send({ ...open(), ns: 'cn-embed' })
    page.send({ ...open(), v: 2 })
    page.send({ ...open(), bytes: 'not bytes' })
    expect(page.delivered).toHaveLength(0)
  })

  it('delivers the file to the editor and reports opened', () => {
    const page = harness()
    page.send(open())
    expect(page.delivered).toHaveLength(1)
    expect(page.delivered[0].name).toBe('Dự toán.xlsx')
    expect(page.delivered[0].files[0].name).toBe('Dự toán.xlsx')
    expect(page.types()).toEqual(['ready'])
    page.delivered[0].done?.()
    expect(page.posted.at(-1)?.data).toEqual(msg('opened', { name: 'Dự toán.xlsx' }))
    expect((page.context.erpEmbed as { originalName: () => string }).originalName()).toBe('Dự toán.xlsx')
  })

  it('reports open-failed when delivery gives up', () => {
    const page = harness()
    page.send(open())
    page.delivered[0].cleanup?.()
    const last = page.posted.at(-1)?.data
    expect(last?.type).toBe('open-failed')
    expect(String(last?.reason)).not.toBe('')
  })
})

type Picker = (options: { suggestedName: string }) => Promise<{ name: string; createWritable: () => Promise<{ write: (data: unknown) => Promise<void>; close: () => Promise<void> }> }>
const settled = () => new Promise(resolve => setTimeout(resolve, 0))
const embed = (page: ReturnType<typeof harness>) => page.context.erpEmbed as { classifySave: (original: string | null, target: string) => string }

describe('saving back to the ERP', () => {
  it('captures only a save under the opened file name', () => {
    const { classifySave } = embed(harness())
    expect(classifySave('Báo cáo.DOCX', 'Báo cáo.docx')).toBe('capture')
    expect(classifySave('Báo cáo.docx', 'Báo cáo.pdf')).toBe('passthrough')
    expect(classifySave('Báo cáo.docx', 'Báo cáo (1).docx')).toBe('passthrough')
    expect(classifySave('b.pdf', 'b (print).pdf')).toBe('passthrough')
    expect(classifySave(null, 'x.docx')).toBe('passthrough')
  })

  it('captures a picker save and resolves close() only after saved', async () => {
    const page = harness({ path: '/van-ban/' })
    page.openAccepted('a.docx')
    const handle = await (page.context.showSaveFilePicker as Picker)({ suggestedName: 'a.docx' })
    expect(handle.name).toBe('a.docx')
    const writable = await handle.createWritable()
    await writable.write(new Uint8Array([1, 2]))
    let done = false
    const closing = writable.close().then(() => { done = true })
    await settled()
    const save = page.posted.at(-1)!
    expect(save.data).toMatchObject({ ns: 'erp-office', v: 1, type: 'save', name: 'a.docx', ack: true })
    expect((save.data.bytes as ArrayBuffer).byteLength).toBe(2)
    expect(save.transfer).toEqual([save.data.bytes])
    expect(done).toBe(false)
    page.send(msg('saved', { id: save.data.id }))
    await closing
    expect(done).toBe(true)
    expect(page.nativePicker).toHaveLength(0)
  })

  it('rejects close() with the host message when the save fails', async () => {
    const page = harness({ path: '/van-ban/' })
    page.openAccepted('a.docx')
    const writable = await (await (page.context.showSaveFilePicker as Picker)({ suggestedName: 'a.docx' })).createWritable()
    await writable.write(new Uint8Array([1]))
    const closing = writable.close()
    await settled()
    page.send(msg('save-failed', { id: page.posted.at(-1)!.data.id, message: 'VERSION_CONFLICT' }))
    const error = await closing.catch((reason: Error) => reason)
    expect((error as Error).message).toBe('VERSION_CONFLICT')
    expect((error as Error).name).not.toBe('AbortError')
  })

  it('ignores an ack for another save', async () => {
    const page = harness({ path: '/van-ban/' })
    page.openAccepted('a.docx')
    const writable = await (await (page.context.showSaveFilePicker as Picker)({ suggestedName: 'a.docx' })).createWritable()
    let done = false
    const closing = writable.close().then(() => { done = true })
    await settled()
    page.send(msg('saved', { id: 'someone-else' }))
    await settled()
    expect(done).toBe(false)
    page.send(msg('saved', { id: page.posted.at(-1)!.data.id }))
    await closing
  })

  // A cross-origin frame may not show the native picker (SecurityError), and Word/PowerPoint have no fallback.
  it('downloads exports itself instead of asking the native picker', async () => {
    const page = harness({ path: '/van-ban/' })
    page.openAccepted('a.docx')
    const writable = await (await (page.context.showSaveFilePicker as Picker)({ suggestedName: 'a.pdf' })).createWritable()
    await writable.write(new Uint8Array([1, 2, 3]))
    await writable.close()
    expect(page.nativePicker).toHaveLength(0)
    expect(page.nativeClicks).toHaveLength(1)
    expect((page.nativeClicks[0] as { download: string }).download).toBe('a.pdf')
    expect(page.types()).not.toContain('save')
  })

  it('downloads a same-format file saved under another name', async () => {
    const page = harness({ path: '/van-ban/' })
    page.openAccepted('a.docx')
    const writable = await (await (page.context.showSaveFilePicker as Picker)({ suggestedName: 'Tài liệu mới.docx' })).createWritable()
    await writable.close()
    expect(page.nativeClicks).toHaveLength(1)
    expect(page.types()).not.toContain('save')
  })

  // GridCraft re-delivers a failed picker save as an anchor download; that copy belongs on disk, not in the ERP.
  it('downloads the anchor fallback that follows a failed save', async () => {
    const page = harness({ path: '/bang-tinh/' })
    page.openAccepted('a.xlsx')
    const writable = await (await (page.context.showSaveFilePicker as Picker)({ suggestedName: 'a.xlsx' })).createWritable()
    const closing = writable.close().catch(() => {})
    await settled()
    page.send(msg('save-failed', { id: page.posted.at(-1)!.data.id, message: 'VERSION_CONFLICT' }))
    await closing
    const URLs = page.context.URL as { createObjectURL: (blob: Blob) => string }
    const fallback = new page.Anchor()
    fallback.download = 'a.xlsx'
    fallback.href = URLs.createObjectURL(new Blob(['x']))
    fallback.click()
    await settled()
    expect(page.nativeClicks).toEqual([fallback])
    expect(page.types().filter(type => type === 'save')).toHaveLength(1)
  })

  it('captures the PDF anchor download without downloading', async () => {
    const page = harness({ path: '/pdf/' })
    page.openAccepted('b.pdf')
    const URLs = page.context.URL as { createObjectURL: (blob: Blob) => string }
    const save = new page.Anchor()
    save.download = 'b.pdf'
    save.href = URLs.createObjectURL(new Blob([new Uint8Array([7, 7, 7])], { type: 'application/pdf' }))
    save.click()
    await settled()
    expect(page.nativeClicks).toHaveLength(0)
    expect(page.posted.at(-1)!.data).toMatchObject({ type: 'save', name: 'b.pdf', ack: false })
    expect((page.posted.at(-1)!.data.bytes as ArrayBuffer).byteLength).toBe(3)

    const printed = new page.Anchor()
    printed.download = 'b (print).pdf'
    printed.href = URLs.createObjectURL(new Blob(['x']))
    printed.click()
    expect(page.nativeClicks).toEqual([printed])

    const exported = new page.Anchor()
    exported.download = 'b.docx'
    exported.href = URLs.createObjectURL(new Blob(['x']))
    exported.click()
    expect(page.nativeClicks).toEqual([printed, exported])
  })

  it('leaves anchor downloads alone before any file was opened', () => {
    const page = harness({ path: '/pdf/' })
    const URLs = page.context.URL as { createObjectURL: (blob: Blob) => string }
    const anchor = new page.Anchor()
    anchor.download = 'b.pdf'
    anchor.href = URLs.createObjectURL(new Blob(['x']))
    anchor.click()
    expect(page.nativeClicks).toEqual([anchor])
  })
})

describe('reporting unsaved work', () => {
  it('reports dirty transitions once each', () => {
    const page = harness()
    const drafts = page.context.erpDrafts as { put: (...args: unknown[]) => void; remove: (key: string) => void; ready: (restore: unknown) => void }
    drafts.ready(() => {})
    drafts.put('k', 'a.xlsx', 'xlsx', new Uint8Array(1))
    drafts.put('k', 'a.xlsx', 'xlsx', new Uint8Array(1))
    drafts.remove('k')
    const dirty = page.posted.filter(entry => entry.data.type === 'dirty').map(entry => entry.data.dirty)
    expect(dirty).toEqual([true, false])
  })

  it('stays dirty until every open document is saved', () => {
    const page = harness()
    const drafts = page.context.erpDrafts as { put: (...args: unknown[]) => void; remove: (key: string) => void }
    drafts.put('tab|doc-1', 'a.docx', 'docx', new Uint8Array(1))
    drafts.put('tab|doc-2', 'b.docx', 'docx', new Uint8Array(1))
    drafts.remove('tab|doc-2')
    drafts.remove('tab|doc-3')
    const dirty = () => page.posted.filter(entry => entry.data.type === 'dirty').map(entry => entry.data.dirty)
    expect(dirty()).toEqual([true])
    drafts.remove('tab|doc-1')
    expect(dirty()).toEqual([true, false])
  })
})
