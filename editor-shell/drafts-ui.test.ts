import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SOURCE = fs.readFileSync(fileURLToPath(new URL('drafts-ui.js', import.meta.url)), 'utf8')
const INCOMPATIBLE = 'Không khôi phục được bản nháp (định dạng không tương thích).'

class FakeElement {
  tag: string
  className = ''
  children: FakeElement[] = []
  attributes: Record<string, string> = {}
  listeners: Record<string, () => void> = {}
  private content = ''
  constructor(tag: string) { this.tag = tag }
  set textContent(value: string) { this.content = value; this.children = [] }
  get textContent() { return this.content }
  appendChild(child: FakeElement) { this.children.push(child); return child }
  insertBefore(child: FakeElement) { return this.appendChild(child) }
  setAttribute(name: string, value: string) { this.attributes[name] = value }
  addEventListener(type: string, callback: () => void) { this.listeners[type] = callback }
  descendants(): FakeElement[] { return this.children.flatMap(child => [child, ...child.descendants()]) }
  querySelectorAll(selector: string) { return this.descendants().filter(node => node.tag === selector) }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null }
  focus() {}
  click() { this.listeners.click?.() }
  text(): string { return [this.content, ...this.children.map(child => child.text())].filter(Boolean).join(' ') }
}

function item(id: string, corrupt = false) {
  return { id, name: id + '.docx', format: 'docx', size: 3, savedAt: Date.now(), corrupt }
}

async function page(items: ReturnType<typeof item>[], results: Record<string, string> = {}) {
  const body = new FakeElement('body')
  const bar = new FakeElement('header')
  const canvas = new FakeElement('canvas')
  const restore = vi.fn(async (id: string) => results[id] || 'ok')
  const context = {
    window: {
      erpDraftStore: {
        subscribe: () => {},
        onReady: (callback: () => void) => callback(),
        orphans: async () => items,
        restore,
      },
    },
    navigator: { platform: 'Linux' },
    document: {
      body,
      createElement: (tag: string) => new FakeElement(tag),
      querySelector: (selector: string) => selector === '.erp-shell' ? bar : canvas,
      addEventListener: () => {},
    },
    setTimeout,
  }
  vm.runInNewContext(SOURCE, context)
  await vi.runAllTimersAsync()
  return {
    body,
    restore,
    notices: () => body.descendants().filter(node => node.className === 'erp-drafts__notice erp-drafts__notice--alert'),
    button: (text: string) => body.querySelectorAll('button').find(node => node.text() === text)!,
  }
}

describe('incompatible draft notices', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the Vietnamese alert when reopening with an incompatible draft', async () => {
    const view = await page([item('future', true), item('current')])
    expect(view.notices().map(node => node.text())).toEqual([INCOMPATIBLE])
    expect(view.notices()[0].attributes.role).toBe('alert')
    expect(view.body.text()).toContain('future.docx')
    expect(view.button('Khôi phục')).toBeDefined()
    expect(view.restore).not.toHaveBeenCalled()
  })

  it('shows the alert if the draft becomes incompatible after listing', async () => {
    const view = await page([item('changed')], { changed: 'corrupt' })
    view.button('Khôi phục').click()
    await vi.runAllTimersAsync()
    expect(view.notices().map(node => node.text())).toEqual([INCOMPATIBLE])
    expect(view.body.text()).toContain('changed.docx')
    expect(view.body.querySelectorAll('button').some(node => node.text() === 'Khôi phục')).toBe(false)
  })

  it('does not offer deletion without a usable stored record id', async () => {
    const view = await page([item('', true)])
    expect(view.notices().map(node => node.text())).toEqual([INCOMPATIBLE])
    expect(view.body.querySelectorAll('button').map(node => node.text())).toEqual(['Để sau'])
  })

  it('restores the other drafts while keeping the skipped draft and notice visible', async () => {
    const view = await page([item('future', true), item('first'), item('second')])
    view.button('Khôi phục tất cả').click()
    await vi.runAllTimersAsync()
    expect(view.restore.mock.calls.map(call => call[0])).toEqual(['first', 'second'])
    expect(view.body.text()).toContain('Đã mở lại 2 bản nháp.')
    expect(view.body.text()).toContain('future.docx')
    expect(view.notices().map(node => node.text())).toEqual([INCOMPATIBLE])
  })

  it('continues a batch after a draft becomes incompatible', async () => {
    const view = await page([item('changed'), item('current')], { changed: 'corrupt' })
    view.button('Khôi phục tất cả').click()
    await vi.runAllTimersAsync()
    expect(view.restore.mock.calls.map(call => call[0])).toEqual(['changed', 'current'])
    expect(view.body.text()).toContain('Đã mở lại 1 bản nháp.')
    expect(view.body.text()).toContain('changed.docx')
    expect(view.notices().map(node => node.text())).toEqual([INCOMPATIBLE])
  })
})

// Exercise the injected scripts together: storage can fail before the badge subscribes.
import { FakeIdb } from './fake-idb.ts'
const DRAFTS = fs.readFileSync(fileURLToPath(new URL('drafts.js', import.meta.url)), 'utf8')

function draftPage(idb: FakeIdb, serviceWorker?: unknown, storage?: unknown) {
  const events: Record<string, () => void> = {}
  const bar = new FakeElement('header')
  const context = {
    window: { addEventListener: (type: string, fn: () => void) => { events[type] = fn } } as Record<string, unknown>,
    indexedDB: idb, location: { pathname: '/van-ban/', search: '' }, URLSearchParams,
    navigator: { platform: 'Linux', storage, gpu: {}, ...(serviceWorker ? { serviceWorker } : {}) },
    performance: { getEntriesByType: () => [] }, Uint8Array, Uint32Array, setTimeout,
    document: { createElement: (tag: string) => new FakeElement(tag), querySelector: () => bar },
  }
  vm.createContext(context)
  vm.runInContext(DRAFTS, context)
  vm.runInContext(SOURCE, context)
  if (serviceWorker) vm.runInContext(fs.readFileSync(fileURLToPath(new URL('shell.js', import.meta.url)), 'utf8'), context)
  const drafts = context.window.erpDrafts as {
    state: (s: Record<string, unknown>) => void
    put: (key: string, name: string, format: string, bytes: Uint8Array) => Promise<boolean>
  }
  const store = context.window.erpDraftStore as { hasPending: () => boolean }
  return { bar, drafts, store, load: () => events.load() }
}
const docState = (docId: string, revision: number, kind: string) => ({
  docId, name: docId + '.docx', revision,
  dirty: kind === 'dirty', pending: kind === 'pending', committed: kind === 'saved', failed: kind === 'failed',
})

describe('device draft badge', () => {
  it('shows a near-quota warning while retaining the current document state', async () => {
    const { drafts, bar } = draftPage(new FakeIdb(), undefined, { estimate: async () => ({ usage: 95, quota: 100 }) })
    drafts.state(docState('A', 1, 'pending'))
    await drafts.put('A', 'A.docx', 'docx', new Uint8Array([1]))
    await Promise.resolve()
    expect(bar.text()).toContain('A.docx · Đang lưu bản nháp')
    expect(bar.text()).toContain('Bộ nhớ sắp đầy')
  })

  it('shows unavailable when indexedDB.open throws synchronously at init', () => {
    const idb = new FakeIdb()
    idb.open = () => { throw new DOMException('blocked', 'SecurityError') }
    expect(draftPage(idb).bar.text()).toContain('Không lưu nháp')
  })

  it('tracks two revisions and active document switches without accepting stale commits', () => {
    const { drafts, bar, store } = draftPage(new FakeIdb())
    drafts.state(docState('A', 1, 'saved'))
    expect(bar.text()).toContain('A.docx · Đã lưu bản nháp trên thiết bị')
    drafts.state(docState('A', 2, 'dirty'))
    expect(bar.text()).toContain('Chưa lưu nháp')
    drafts.state(docState('A', 1, 'saved'))
    expect(bar.text()).toContain('Chưa lưu nháp')
    drafts.state(docState('B', 1, 'saved'))
    expect(bar.text()).toContain('B.docx · Đã lưu')
    expect(store.hasPending()).toBe(true)
    drafts.state(docState('A', 2, 'pending'))
    expect(bar.text()).toContain('Đang lưu nháp')
    drafts.state(docState('A', 2, 'failed'))
    expect(bar.text()).toContain('Lỗi lưu nháp')
    drafts.state(docState('A', 2, 'saved'))
    expect(store.hasPending()).toBe(false)
  })

  it('keeps byte-identical previous data and shows quota warning on put failure', async () => {
    const idb = new FakeIdb()
    const { drafts, bar } = draftPage(idb)
    expect(await drafts.put('A', 'A.docx', 'docx', new Uint8Array([1, 9, 3]))).toBe(true)
    idb.failWrites = 'QuotaExceededError'
    expect(await drafts.put('A', 'A.docx', 'docx', new Uint8Array([7, 8]))).toBe(false)
    expect([...(idb.rows()[0].bytes as Uint8Array)]).toEqual([1, 9, 3])
    expect(bar.text()).toContain('Bộ nhớ đầy')
  })
})


describe('worker update draft gate', () => {
  it('keeps the editor and recoverable bytes through waiting and activated workers', async () => {
    const listeners: Record<string, (event?: unknown) => void> = {}
    const registrationEvents: Record<string, () => void> = {}
    const lifecycle: Record<string, () => void> = {}
    const postMessage = vi.fn()
    const worker = { state: 'installing', postMessage, addEventListener: (type: string, fn: () => void) => { lifecycle[type] = fn } }
    const registration = {
      waiting: null as typeof worker | null, installing: worker,
      addEventListener: (type: string, fn: () => void) => { registrationEvents[type] = fn },
    }
    const container = {
      controller: { postMessage: vi.fn() }, register: async () => registration,
      addEventListener: (type: string, fn: (event?: unknown) => void) => { listeners[type] = fn },
    }
    const idb = new FakeIdb()
    const { drafts, bar, load } = draftPage(idb, container)
    drafts.state(docState('A', 1, 'dirty'))
    load()
    await Promise.resolve()
    registrationEvents.updatefound()
    registration.waiting = worker
    worker.state = 'installed'
    lifecycle.statechange()
    const apply = bar.querySelectorAll('button')[0] as FakeElement & { disabled: boolean }
    expect(bar.text()).toContain('Có bản cập nhật')
    listeners.message({ data: { type: 'erpcons-quota' } })
    expect(bar.text()).toContain('chưa lưu được dữ liệu dùng ngoại tuyến')
    expect(apply.disabled).toBe(true)
    apply.click()
    expect(postMessage).not.toHaveBeenCalled()
    drafts.state(docState('A', 1, 'pending'))
    await drafts.put('A', 'A.docx', 'docx', new Uint8Array([4, 5, 6]))
    expect(apply.disabled).toBe(true)
    drafts.state(docState('A', 1, 'saved'))
    expect(apply.disabled).toBe(false)
    apply.click()
    expect(postMessage).toHaveBeenCalledWith({ type: 'erpcons-apply-update' })
    listeners.controllerchange()
    expect(bar.text()).toContain('Tiếp tục soạn thảo; chưa tải lại trang')
    const next = draftPage(idb)
    const restore = vi.fn()
    const api = next.drafts as unknown as { ready: (fn: unknown) => void }
    api.ready(restore)
    const store = next.store as unknown as { orphans: () => Promise<{ id: string }[]>; restore: (id: string) => Promise<string> }
    await new Promise(resolve => setTimeout(resolve, 30))
    const [draft] = await store.orphans()
    expect(await store.restore(draft.id)).toBe('ok')
    expect([...(restore.mock.calls[0][3] as Uint8Array)]).toEqual([4, 5, 6])
  })

  it('shows no update notice when the first worker claims the page', async () => {
    const listeners: Record<string, (event?: unknown) => void> = {}
    const container = {
      controller: null as { postMessage: () => void } | null,
      register: async () => ({ waiting: null, installing: null, addEventListener: () => {} }),
      addEventListener: (type: string, fn: (event?: unknown) => void) => { listeners[type] = fn },
    }
    const { bar, load } = draftPage(new FakeIdb(), container)
    load()
    await Promise.resolve()
    container.controller = { postMessage: vi.fn() }
    listeners.controllerchange()
    expect(bar.text()).not.toContain('Đã cập nhật nền')
    expect(bar.querySelectorAll('button')).toHaveLength(0)
  })

  it('blocks a waiting worker during a legacy put, including before IDB opens', async () => {
    const postMessage = vi.fn()
    const container = {
      controller: { postMessage: vi.fn() },
      register: async () => ({ waiting: { postMessage } }), addEventListener: () => {},
    }
    const { drafts, bar, load } = draftPage(new FakeIdb(), container)
    const committed = drafts.put('A', 'A.docx', 'docx', new Uint8Array([1]))
    load()
    await Promise.resolve()
    const apply = bar.querySelectorAll('button')[0] as FakeElement & { disabled: boolean }
    expect(apply.disabled).toBe(true)
    await committed
    expect(apply.disabled).toBe(false)
  })
})
