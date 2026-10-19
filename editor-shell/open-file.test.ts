import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// Only this script: the draft store also opens IndexedDB and would take over the fake request.
const script = fs.readFileSync(fileURLToPath(new URL('open-file.js', import.meta.url)), 'utf8')
function run({ path = '/van-ban/', expires = Date.now() + 10000, missing = false, denied = false } = {}) {
  let read: { onsuccess?: () => void; result?: unknown } = {}
  let tick = () => {}
  let handled = false
  const deleted: string[] = []
  const drops: unknown[] = []
  const banner = { textContent: '', className: '', setAttribute() {}, appendChild() {}, remove() {} }
  const db = {
    close() {},
    transaction: () => ({ objectStore: () => ({
      get: () => read,
      delete: (id: string) => deleted.push(id),
    }) }),
  }
  const request: { onsuccess?: () => void; result: typeof db } = { result: db }
  const context = {
    URLSearchParams, URL, Date,
    navigator: { gpu: {} },
    window: { addEventListener() {} },
    location: { search: '?open=token', pathname: path, href: 'https://example.test' + path + '?open=token' },
    indexedDB: { open: () => { if (denied) throw new Error('SecurityError'); return request } },
    document: { createElement: (tag: string) => tag === 'a' ? { href: '', textContent: '' } : banner, body: { appendChild() {} }, querySelector: () => ({ dispatchEvent(event: unknown) { drops.push(event); return !handled } }) },
    DataTransfer: class { items = { add() {} } },
    File: class {},
    DragEvent: class { type: string; init: unknown; constructor(type: string, init: unknown) { this.type = type; this.init = init } },
    history: { replaceState() {} },
    setInterval: (callback: () => void) => { tick = callback; return 1 },
    clearInterval() {},
    setTimeout() {},
  }
  vm.runInNewContext(script, context)
  request.onsuccess?.()
  read.result = missing ? undefined : { name: 'report.docx', file: {}, editor: 'van-ban', expiresAt: expires }
  read.onsuccess?.()
  return { tick: () => tick(), ready: () => { handled = true }, deleted, drops, banner }
}

function launch(files: { name: string }[]) {
  let consumer: (params: { files: { getFile: () => Promise<unknown> }[] }) => void = () => {}
  let tick = () => {}
  let handled = false
  const drops: { init: { dataTransfer: { files: unknown[] } } }[] = []
  const banner = { textContent: '', className: '', setAttribute() {}, appendChild() {}, remove() {} }
  const context = {
    URLSearchParams, URL, Date, Promise,
    navigator: { gpu: {} },
    window: { addEventListener() {}, launchQueue: { setConsumer: (fn: typeof consumer) => { consumer = fn } } },
    location: { search: '', pathname: '/van-ban/', href: 'https://example.test/van-ban/' },
    indexedDB: { open: () => { throw new Error('the launch path must not touch storage') } },
    document: { createElement: () => banner, body: { appendChild() {} }, querySelector: () => ({ dispatchEvent(event: never) { drops.push(event); return !handled } }) },
    DataTransfer: class { files: unknown[] = []; items = { add: (file: unknown) => { this.files.push(file) } } },
    File: class {},
    DragEvent: class { type: string; init: unknown; constructor(type: string, init: unknown) { this.type = type; this.init = init } },
    history: { replaceState() {} },
    setInterval: (callback: () => void) => { tick = callback; return 1 },
    clearInterval() {},
    setTimeout() {},
  }
  vm.runInNewContext(script, context)
  return {
    open: async () => { consumer({ files: files.map(file => ({ getFile: async () => file })) }); await new Promise(r => setTimeout(r, 0)) },
    tick: () => tick(), ready: () => { handled = true }, drops, banner,
  }
}

describe('opening files from the operating system ("Open with")', () => {
  it('drops the launched files into the editor once it is ready', async () => {
    const harness = launch([{ name: 'Báo cáo.docx' }])
    await harness.open()
    harness.tick()
    harness.ready()
    harness.tick()
    expect(harness.drops).toHaveLength(2)
    expect(harness.drops[1].init.dataTransfer.files).toEqual([{ name: 'Báo cáo.docx' }])
    expect(harness.banner.textContent).toContain('Báo cáo.docx')
  })

  it('ignores a plain app launch without files', async () => {
    const harness = launch([])
    await harness.open()
    harness.tick()
    expect(harness.drops).toHaveLength(0)
  })
})

describe('editor file handoff', () => {
  it('waits for the real editor drop handler before consuming the pending file', () => {
    const harness = run()
    harness.tick()
    expect(harness.deleted).toEqual([])
    harness.ready()
    harness.tick()
    expect(harness.deleted).toEqual(['token'])
    expect(harness.drops).toHaveLength(2)
    expect(harness.banner.textContent).toContain('report.docx')
  })
  it('gives a recovery path if the browser denies storage', () => {
    const harness = run({ denied: true })
    expect(harness.banner.textContent).toContain('không cho phép')
    expect(harness.drops).toHaveLength(0)
  })
  it.each([{ path: '/pdf/' }, { expires: 0 }, { missing: true }])('rejects unavailable or mismatched transfers', options => {
    const harness = run(options)
    expect(harness.banner.textContent).toContain('hết hạn')
    expect(harness.drops).toHaveLength(0)
    expect(harness.deleted).toEqual([])
  })
})

function shell() {
  let next = 0
  const intervals = new Map<number, () => void>()
  const timeouts: (() => void)[] = []
  let handled = false
  const drops: { init: { dataTransfer: { files: unknown[] } } }[] = []
  let removed = 0
  const banners: { textContent: string }[] = []
  const window: { addEventListener(): void; erpShellDeliver?: (files: unknown[], name: string, done?: () => void) => void } = { addEventListener() {} }
  const context = {
    URLSearchParams, URL, Date, window,
    navigator: { gpu: {} },
    location: { search: '', pathname: '/van-ban/', href: 'https://example.test/van-ban/' },
    indexedDB: { open: () => { throw new Error('no transfer in this test') } },
    document: {
      createElement: () => { const b = { textContent: '', className: '', setAttribute() {}, appendChild() {}, remove() { removed++ } }; banners.push(b); return b },
      body: { appendChild() {} },
      querySelector: () => ({ dispatchEvent(event: never) { drops.push(event); return !handled } }),
    },
    DataTransfer: class { files: unknown[] = []; items = { add: (file: unknown) => { this.files.push(file) } } },
    File: class {},
    DragEvent: class { type: string; init: unknown; constructor(type: string, init: unknown) { this.type = type; this.init = init } },
    history: { replaceState() {} },
    setInterval: (callback: () => void) => { intervals.set(++next, callback); return next },
    clearInterval: (id: number) => { intervals.delete(id) },
    setTimeout: (callback: () => void) => { timeouts.push(callback) },
  }
  vm.runInNewContext(script, context)
  return {
    deliver: (name: string, done?: () => void) => window.erpShellDeliver!([{ name }], name, done),
    tick: () => [...intervals.values()].forEach(callback => callback()),
    live: () => intervals.size,
    ready: () => { handled = true },
    runTimeout: (i: number) => timeouts[i](),
    drops, banners, removed: () => removed,
  }
}

describe('overlapping handoffs (an ERP page sending several files)', () => {
  it('drops each file once and stops every timer', () => {
    const harness = shell()
    const done: string[] = []
    harness.deliver('A.docx', () => done.push('A'))
    harness.deliver('B.docx', () => done.push('B'))
    harness.ready()
    harness.tick()
    harness.tick()
    expect(harness.drops.map(drop => drop.init.dataTransfer.files)).toEqual([[{ name: 'A.docx' }], [{ name: 'B.docx' }]])
    expect(done).toEqual(['A', 'B'])
    expect(harness.live()).toBe(0)
  })

  it('keeps a newer message up when an older one would hide the banner', () => {
    const harness = shell()
    harness.ready()
    harness.deliver('A.docx')
    harness.tick()
    harness.deliver('B.docx')
    harness.runTimeout(0)
    expect(harness.removed()).toBe(0)
    expect(harness.banners[0].textContent).toContain('B.docx')
    harness.tick()
    harness.runTimeout(1)
    expect(harness.removed()).toBe(1)
    harness.deliver('C.docx')
    expect(harness.banners).toHaveLength(2)
    expect(harness.banners[1].textContent).toContain('C.docx')
  })
})
