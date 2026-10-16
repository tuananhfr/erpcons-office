import { fileURLToPath } from 'node:url'
import { loadShellAssets } from '../src/lib/editor-shell/assets.ts'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = loadShellAssets(fileURLToPath(new URL('.', import.meta.url))).script
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
