import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { ManualClock, settle } from './fake-browser.ts'

const openFile = fs.readFileSync(fileURLToPath(new URL('open-file.js', import.meta.url)), 'utf8')
const bridge = fs.readFileSync(fileURLToPath(new URL('host-bridge.js', import.meta.url)), 'utf8')

const ERP = 'https://lpc.vn'
const embedSearch = (parentOrigin = ERP) => `?embed=erpcons&parent=${encodeURIComponent(parentOrigin)}`

interface Posted { data: Record<string, unknown>; origin: string; transfer?: unknown[] }
interface Delivery { files: { name: string }[]; name: string; done?: () => void; cleanup?: () => void }

// Runs open-file.js then host-bridge.js in one realm whose global is also `window`, like a page.
export function harness({ search = embedSearch(), path = '/bang-tinh/', hosts = [ERP] as string[] | null, clock = null as ManualClock | null } = {}) {
  const posted: Posted[] = []
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const classes = new Set<string>()
  const parent = { postMessage: (data: Record<string, unknown>, origin: string, transfer?: unknown[]) => posted.push({ data, origin, transfer }) }
  const nativePicker: unknown[] = []
  const nativeClicks: unknown[] = []
  let objectUrls = 0
  class FakeURL extends URL {
    static createObjectURL() { objectUrls += 1; return `blob:https://office.erpcons.ai/${objectUrls}` }
    static revokeObjectURL() {}
  }
  class Anchor { download = ''; href = ''; click() { nativeClicks.push(this) } }
  const context: Record<string, unknown> = {
    URLSearchParams, URL: FakeURL, Date, Promise, ArrayBuffer, Uint8Array, Error, Blob,
    HTMLAnchorElement: Anchor,
    showSaveFilePicker: async (options: unknown) => { nativePicker.push(options); return { native: true } },
    File: class { parts: unknown[]; name: string; constructor(parts: unknown[], name: string) { this.parts = parts; this.name = name } },
    location: { search, pathname: path, href: 'https://office.erpcons.ai' + path + search },
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
  if (clock) Object.assign(context, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval })
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

const v2Search = (parentOrigin = ERP) => `?embed=erpcons&v=2&parent=${encodeURIComponent(parentOrigin)}`
export const msg2 = (type: string, payload: Record<string, unknown> = {}) => ({ ns: 'erp-office', v: 2, type, ...payload })

type SaveResult = Record<string, unknown>
interface ErpHost {
  version: number
  ready: (handlers: Record<string, unknown>) => void
  save: (docId: string, bytes: Uint8Array, options: { revision: number; reason: string }) => Promise<SaveResult>
  opened: (docId: string, ok: boolean, reason?: string) => void
  closed: (docId: string) => void
}

// A v2 page with a fake editor that registers with erpHost the way the forks on feat/online-v2 do.
function v2Page({ search = v2Search(), withFlush = true } = {}) {
  const clock = new ManualClock()
  const page = harness({ search, path: '/van-ban/', clock })
  const calls: unknown[][] = []
  const flushes: (() => void)[] = []
  const editor: Record<string, unknown> = {
    open: (doc: unknown) => { calls.push(['open', doc]) },
    setMode: (...args: unknown[]) => { calls.push(['setMode', ...args]) },
    acknowledged: (...args: unknown[]) => { calls.push(['acknowledged', ...args]) },
  }
  if (withFlush) editor.flush = () => new Promise<void>(resolve => { calls.push(['flush']); flushes.push(resolve) })
  const host = page.context.erpHost as ErpHost | undefined
  const drafts = page.context.erpDrafts as { ready: (restore: unknown) => void }
  return { ...page, clock, calls, flushes, editor, host: host!, drafts, register: () => host!.ready(editor) }
}

const sampleDoc = (overrides: Record<string, unknown> = {}) => ({
  docId: 'tpl-1', name: 'Mẫu hợp đồng.docx', format: 'docx', bytes: new ArrayBuffer(4), revision: 3, mode: 'edit', canDownload: true, ...overrides,
})
const lastSave = (page: ReturnType<typeof v2Page>) => page.posted.filter(entry => entry.data.type === 'save').at(-1)!

describe('protocol v2 activation', () => {
  it('keeps v1 without v=2: no erpHost and ready v1 at once', () => {
    const page = harness({ path: '/van-ban/' })
    expect(page.context.erpHost).toBeUndefined()
    expect(page.posted).toEqual([{ data: msg('ready', { editor: 'van-ban' }), origin: ERP, transfer: [] }])
  })

  it('stays inert for a parent outside the allow list', () => {
    const page = v2Page({ search: v2Search('https://evil.test') })
    expect(page.context.erpHost).toBeUndefined()
    expect(page.context.erpEmbed).toBeUndefined()
    expect(page.posted).toHaveLength(0)
  })

  it('offers erpHost v2 and announces ready v2 once the editor registers', () => {
    const page = v2Page()
    expect(page.host.version).toBe(2)
    expect(page.posted).toHaveLength(0)
    expect(page.classes.has('erp-embedded')).toBe(true)
    page.register()
    page.drafts.ready(() => {})
    page.clock.advance(200000)
    expect(page.posted).toEqual([{ data: msg2('ready', { editor: 'van-ban', host: true }), origin: ERP, transfer: [] }])
  })

  it('falls back to v1 when the editor starts without registering with erpHost', () => {
    const page = v2Page()
    page.drafts.ready(() => {})
    page.clock.advance(1499)
    expect(page.posted).toHaveLength(0)
    page.clock.advance(1)
    expect(page.posted).toEqual([{ data: msg('ready', { editor: 'van-ban' }), origin: ERP, transfer: [] }])
    page.register()
    expect(page.types()).toEqual(['ready'])
    page.openAccepted('a.docx')
    expect(page.calls).toEqual([])
    expect(page.posted.at(-1)!.data).toEqual(msg('opened', { name: 'a.docx' }))
  })

  it('falls back to v1 when the editor never starts', () => {
    const page = v2Page()
    page.clock.advance(119999)
    expect(page.posted).toHaveLength(0)
    page.clock.advance(1)
    expect(page.posted.map(entry => entry.data)).toEqual([msg('ready', { editor: 'van-ban' })])
  })

  it('reads nothing from the ERP before deciding the protocol', () => {
    const page = v2Page()
    page.send(msg2('open', { doc: sampleDoc() }))
    page.send(msg('open', { name: 'a.docx', bytes: new ArrayBuffer(1) }))
    page.register()
    expect(page.calls).toEqual([])
    expect(page.delivered).toHaveLength(0)
  })
})

describe('protocol v2 documents', () => {
  it('opens the ERP document through erpHost with its mode and reports opened', () => {
    const page = v2Page()
    page.register()
    page.send(msg2('open', { doc: sampleDoc({ mode: 'view', canDownload: false }) }))
    expect(page.delivered).toHaveLength(0)
    expect(page.calls).toHaveLength(1)
    const [kind, doc] = page.calls[0] as [string, Record<string, unknown>]
    expect(kind).toBe('open')
    expect(doc).toMatchObject({ docId: 'tpl-1', version: 3, title: 'Mẫu hợp đồng.docx', format: 'docx', mode: 'view', canDownload: false })
    expect(doc.bytes).toBeInstanceOf(Uint8Array)
    expect((doc.bytes as Uint8Array).byteLength).toBe(4)
    page.host.opened('tpl-1', true)
    expect(page.posted.at(-1)).toEqual({ data: msg2('opened', { name: 'Mẫu hợp đồng.docx' }), origin: ERP, transfer: [] })
  })

  it('leaves mode and canDownload to the editor default when the ERP omits them, and derives the format', () => {
    const page = v2Page()
    page.register()
    const doc: Record<string, unknown> = sampleDoc({ format: undefined })
    delete doc.mode
    delete doc.canDownload
    page.send(msg2('open', { doc }))
    const given = page.calls[0][1] as Record<string, unknown>
    expect(given.format).toBe('docx')
    expect('mode' in given).toBe(false)
    expect('canDownload' in given).toBe(false)
  })

  it('rejects an open without a docId, a name or bytes', () => {
    const page = v2Page()
    page.register()
    page.send(msg2('open', { doc: sampleDoc({ docId: 7 }) }))
    page.send(msg2('open', { doc: sampleDoc({ bytes: 'x' }) }))
    page.send(msg2('open', { doc: sampleDoc({ name: null }) }))
    page.send(msg2('open', {}))
    expect(page.calls).toEqual([])
  })

  it('reports open-failed with a readable reason', () => {
    const page = v2Page()
    page.register()
    page.send(msg2('open', { doc: sampleDoc() }))
    page.host.opened('tpl-1', false, 'unsupported')
    const last = page.posted.at(-1)!.data
    expect(last).toMatchObject({ ns: 'erp-office', v: 2, type: 'open-failed' })
    expect(String(last.reason)).toContain('Mẫu hợp đồng.docx')
  })

  it('posts closed once when the ERP document closes', () => {
    const page = v2Page()
    page.register()
    page.send(msg2('open', { doc: sampleDoc() }))
    page.host.opened('tpl-1', true)
    page.host.closed('tpl-1')
    const editorClosed = page.context.erpEditorClosed as () => void
    editorClosed()
    page.host.closed('tpl-1')
    expect(page.posted.filter(entry => entry.data.type === 'closed').map(entry => entry.data)).toEqual([msg2('closed')])
  })

  it('ignores v1 messages once v2 is chosen', () => {
    const page = v2Page()
    page.register()
    page.send(msg('open', { name: 'a.docx', bytes: new ArrayBuffer(1) }))
    expect(page.delivered).toHaveLength(0)
    expect(page.calls).toEqual([])
  })

  it('sends crashed and other shell posts as v2', () => {
    const page = v2Page()
    page.register()
    const embedded = page.context.erpEmbed as { post: (type: string, payload: object) => void }
    embedded.post('crashed', {})
    expect(page.posted.at(-1)!.data).toEqual(msg2('crashed'))
  })

  it('does not report dirty in v2', () => {
    const page = v2Page()
    page.register()
    const drafts = page.context.erpDrafts as { put: (...args: unknown[]) => void }
    drafts.put('k', 'local.docx', 'docx', new Uint8Array(1))
    expect(page.types()).not.toContain('dirty')
  })

  it('applies set-mode to the editor', () => {
    const page = v2Page()
    page.register()
    page.send(msg2('set-mode', { docId: 'tpl-1', mode: 'view', canDownload: false }))
    page.send(msg2('set-mode', { docId: 42, mode: 'edit' }))
    expect(page.calls).toEqual([['setMode', 'tpl-1', 'view', false]])
  })
})

describe('protocol v2 saving', () => {
  const saving = (reason = 'auto') => {
    const page = v2Page()
    page.register()
    page.send(msg2('open', { doc: sampleDoc() }))
    const bytes = new Uint8Array([1, 2, 3])
    let result: SaveResult | null = null
    void page.host.save('tpl-1', bytes, { revision: 7, reason }).then(value => { result = value })
    return { page, bytes, save: lastSave(page), result: () => result }
  }

  it('forwards an editor save and resolves it with saved', async () => {
    const { page, bytes, save, result } = saving('manual')
    expect(save.data).toMatchObject({ ns: 'erp-office', v: 2, type: 'save', docId: 'tpl-1', revision: 7, reason: 'manual' })
    expect(typeof save.data.id).toBe('string')
    expect(Object.keys(save.data).sort()).toEqual(['bytes', 'docId', 'id', 'ns', 'reason', 'revision', 'type', 'v'])
    expect([...new Uint8Array(save.data.bytes as ArrayBuffer)]).toEqual([1, 2, 3])
    expect(save.data.bytes).not.toBe(bytes.buffer)
    expect(save.transfer).toEqual([save.data.bytes])
    await settle()
    expect(result()).toBeNull()
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'saved', version: 4 } }))
    await settle()
    expect(result()).toEqual({ status: 'saved', version: 4 })
  })

  it('passes a conflict through', async () => {
    const { page, save, result } = saving()
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'conflict', latestVersion: 9 } }))
    await settle()
    expect(result()).toEqual({ status: 'conflict', latestVersion: 9 })
  })

  it('passes a failure through with its message', async () => {
    const { page, save, result } = saving()
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'failed', retryable: false, message: 'Mẫu đang bị khoá' } }))
    await settle()
    expect(result()).toEqual({ status: 'failed', retryable: false, message: 'Mẫu đang bị khoá' })
  })

  it('turns an answer outside the contract into a non-retryable failure', async () => {
    const { page, save, result } = saving()
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'done' } }))
    await settle()
    expect(result()).toMatchObject({ status: 'failed', retryable: false })
    expect(String((result() as SaveResult).message)).not.toBe('')
  })

  it('resolves offline when the ERP does not answer in time, and acknowledges a late saved', async () => {
    const { page, save, result } = saving()
    page.clock.advance(59999)
    await settle()
    expect(result()).toBeNull()
    page.clock.advance(1)
    await settle()
    expect(result()).toEqual({ status: 'offline' })
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'saved', version: 5 } }))
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'saved', version: 5 } }))
    expect(page.calls.filter(call => call[0] === 'acknowledged')).toEqual([['acknowledged', 'tpl-1', 7, 5]])
  })

  it('acknowledges a save the ERP answered offline and stored on its own retry', async () => {
    const { page, save, result } = saving()
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'offline' } }))
    await settle()
    expect(result()).toEqual({ status: 'offline' })
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'offline' } }))
    expect(page.calls.filter(call => call[0] === 'acknowledged')).toEqual([])
    page.send(msg2('save-result', { id: save.data.id, result: { status: 'saved', version: 6 } }))
    expect(page.calls.filter(call => call[0] === 'acknowledged')).toEqual([['acknowledged', 'tpl-1', 7, 6]])
  })

  it('ignores answers from another origin, another window, another version or another save', async () => {
    const { page, save, result } = saving()
    const saved = msg2('save-result', { id: save.data.id, result: { status: 'saved', version: 4 } })
    page.send(saved, { origin: 'https://evil.test' })
    page.send(saved, { source: {} })
    page.send({ ...saved, v: 1 })
    page.send({ ...saved, ns: 'cn-embed' })
    page.send(msg2('save-result', { id: 'someone-else', result: { status: 'saved', version: 4 } }))
    await settle()
    expect(result()).toBeNull()
    page.send(saved)
    await settle()
    expect(result()).toEqual({ status: 'saved', version: 4 })
  })

  it('replies flushed after the saves the editor hands over during flush', async () => {
    const page = v2Page()
    page.register()
    page.send(msg2('flush', { id: 'f-1' }))
    expect(page.calls).toEqual([['flush']])
    void page.host.save('tpl-1', new Uint8Array([9]), { revision: 2, reason: 'flush' })
    await settle()
    expect(page.types()).not.toContain('flushed')
    page.flushes[0]()
    await settle()
    expect(page.types().slice(-2)).toEqual(['save', 'flushed'])
    expect(page.posted.at(-1)!.data).toEqual(msg2('flushed', { id: 'f-1' }))
  })

  it('replies flushed after 10 s when the editor flush never settles', async () => {
    const page = v2Page()
    page.register()
    page.send(msg2('flush', { id: 'f-2' }))
    page.clock.advance(9999)
    await settle()
    expect(page.types()).not.toContain('flushed')
    page.clock.advance(1)
    expect(page.posted.at(-1)!.data).toEqual(msg2('flushed', { id: 'f-2' }))
    page.flushes[0]()
    await settle()
    expect(page.types().filter(type => type === 'flushed')).toHaveLength(1)
  })

  it('replies flushed at once when the editor has no flush handler', async () => {
    const page = v2Page({ withFlush: false })
    page.register()
    page.send(msg2('flush', { id: 'f-3' }))
    await settle()
    expect(page.posted.at(-1)!.data).toEqual(msg2('flushed', { id: 'f-3' }))
  })
})
