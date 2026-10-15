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
