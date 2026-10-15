import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'shell.js'), 'utf8')
type Worker = { name: string; postMessage: (m: { type: string; urls: string[] }) => void }

function loadShell(initialController: string | null) {
  const sent: { to: string; urls: string[] }[] = []
  const worker = (name: string): Worker => ({ name, postMessage: (m) => sent.push({ to: name, urls: m.urls }) })
  const swListeners: Record<string, () => void> = {}
  const winListeners: Record<string, () => void> = {}
  const removed: string[] = []
  let observer: ((list: { getEntries: () => { name: string }[] }) => void) | undefined
  const entries = ['https://office.erpcons.vn/van-ban/w.js']
  const container = {
    controller: initialController ? worker(initialController) : null as Worker | null,
    register: () => Promise.resolve({}),
    addEventListener: (type: string, fn: () => void) => { swListeners[type] = fn },
  }
  const context = {
    navigator: { gpu: {}, serviceWorker: container },
    window: { addEventListener: (type: string, fn: () => void) => { winListeners[type] = fn } },
    document: {
      documentElement: { classList: { add: () => {} } },
      createElement: () => ({ getContext: () => null }),
      querySelector: (sel: string) => ({ remove: () => removed.push(sel) }),
    },
    location: { href: 'https://office.erpcons.vn/van-ban/' },
    performance: { getEntriesByType: () => entries.map((name) => ({ name })) },
    PerformanceObserver: class { constructor(cb: typeof observer) { observer = cb } observe() {} },
  }
  vm.runInNewContext(SOURCE, context)
  return {
    sent,
    removed,
    start: () => winListeners.TrunkApplicationStarted(),
    load: async () => { winListeners.load(); await new Promise((r) => setTimeout(r, 0)) },
    switchTo: (name: string) => { container.controller = worker(name); swListeners.controllerchange() },
    finish: (url: string) => { entries.push(url); observer!({ getEntries: () => [{ name: url }] }) },
  }
}

describe('shell warm-up', () => {
  it('hands the controlling worker the page and what it loaded', async () => {
    const s = loadShell('A')
    await s.load()
    expect(s.sent).toEqual([{ to: 'A', urls: ['https://office.erpcons.vn/van-ban/', 'https://office.erpcons.vn/van-ban/w.js'] }])
  })

  it('re-sends everything to a worker that takes over, e.g. right after a deploy', async () => {
    const s = loadShell('A')
    await s.load()
    s.switchTo('B')
    expect(s.sent.at(-1)).toEqual({ to: 'B', urls: ['https://office.erpcons.vn/van-ban/', 'https://office.erpcons.vn/van-ban/w.js'] })
  })

  it('sends files that finish later to whichever worker controls the page then', async () => {
    const s = loadShell('A')
    await s.load()
    s.switchTo('B')
    s.finish('https://office.erpcons.vn/van-ban/w_bg.wasm')
    expect(s.sent.at(-1)).toEqual({ to: 'B', urls: ['https://office.erpcons.vn/van-ban/w_bg.wasm'] })
  })

  it('waits for a controller on the very first visit', async () => {
    const s = loadShell(null)
    await s.load()
    s.finish('https://office.erpcons.vn/van-ban/w_bg.wasm')
    expect(s.sent).toEqual([])
    s.switchTo('A')
    expect(s.sent).toEqual([{ to: 'A', urls: ['https://office.erpcons.vn/van-ban/', 'https://office.erpcons.vn/van-ban/w.js', 'https://office.erpcons.vn/van-ban/w_bg.wasm'] }])
  })
})

describe('shell loading note', () => {
  it('drops the shell loading note once the app has started', () => {
    const s = loadShell('A')
    expect(s.removed).toEqual([])
    s.start()
    expect(s.removed).toEqual(['[data-erpcons-loading]'])
  })
})
