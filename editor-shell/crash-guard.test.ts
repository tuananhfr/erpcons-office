import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const SOURCE = fs.readFileSync(fileURLToPath(new URL('crash-guard.js', import.meta.url)), 'utf8')

type Listener = (event: Record<string, unknown>) => void

class FakeElement {
  tagName: string
  className = ''
  id = ''
  type = ''
  href = ''
  textContent = ''
  parent: FakeElement | null = null
  children: FakeElement[] = []
  attributes: Record<string, string> = {}
  listeners: Record<string, Listener[]> = {}
  private doc: FakeDocument
  constructor(tag: string, doc: FakeDocument) { this.tagName = tag.toUpperCase(); this.doc = doc }
  appendChild(child: FakeElement) { child.parent = this; this.children.push(child); return child }
  setAttribute(name: string, value: string) { this.attributes[name] = value }
  getAttribute(name: string) { return this.attributes[name] ?? null }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
  contains(other: unknown): boolean {
    for (let node = other as FakeElement | null; node; node = node.parent) if (node === this) return true
    return false
  }
  descendants(): FakeElement[] { return this.children.flatMap(child => [child, ...child.descendants()]) }
  querySelectorAll(selector: string) {
    if (selector !== 'button, a[href]') throw new Error(`unsupported selector ${selector}`)
    return this.descendants().filter(node => node.tagName === 'BUTTON' || (node.tagName === 'A' && node.href))
  }
  focus() { this.doc.moveFocus(this) }
  click() { (this.listeners.click || []).forEach(fn => fn({ target: this })) }
  text(): string { return [this.textContent, ...this.children.map(child => child.text())].filter(Boolean).join(' ') }
}

class FakeDocument {
  body: FakeElement
  canvas: FakeElement
  activeElement: FakeElement
  listeners: Record<string, Listener[]> = {}
  constructor() {
    this.body = new FakeElement('body', this)
    this.canvas = this.body.appendChild(new FakeElement('canvas', this))
    this.activeElement = this.canvas
  }
  createElement(tag: string) { return new FakeElement(tag, this) }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
  moveFocus(node: FakeElement) {
    this.activeElement = node
    ;(this.listeners.focusin || []).forEach(fn => fn({ target: node }))
  }
  overlays() { return this.body.descendants().filter(node => node.className === 'erp-crash') }
  dialog() { return this.body.descendants().find(node => node.getAttribute('role') === 'alertdialog') }
}

interface Options { draftStore?: boolean; embed?: boolean }

function page({ draftStore = true, embed = false }: Options = {}) {
  const document = new FakeDocument()
  const listeners: Record<string, Listener[]> = {}
  const logged: unknown[][] = []
  const posted: { type: string; payload: unknown }[] = []
  const subscribers: ((status: Record<string, unknown>) => void)[] = []
  let reloads = 0
  const context: Record<string, unknown> = {
    document,
    location: { reload: () => { reloads += 1 } },
    console: { error: (...args: unknown[]) => { logged.push(args) } },
    addEventListener: (type: string, fn: Listener) => { (listeners[type] ||= []).push(fn) },
  }
  context.window = context
  if (draftStore) context.erpDraftStore = { subscribe: (fn: (status: Record<string, unknown>) => void) => subscribers.push(fn) }
  if (embed) context.erpEmbed = { post: (type: string, payload: unknown) => posted.push({ type, payload }) }
  vm.createContext(context)
  vm.runInContext(SOURCE, context)
  // Errors are built inside the page's realm so `instanceof WebAssembly.RuntimeError` sees the page's own class.
  const make = (expression: string) => vm.runInContext(expression, context) as unknown
  return {
    document, logged, posted,
    reloads: () => reloads,
    make,
    error: (event: Record<string, unknown>) => (listeners.error || []).forEach(fn => fn(event)),
    reject: (reason: unknown) => (listeners.unhandledrejection || []).forEach(fn => fn({ reason })),
    unload: () => {
      let stopped = false
      ;(listeners.beforeunload || []).forEach(fn => fn({ stopImmediatePropagation: () => { stopped = true } }))
      return stopped
    },
    status: (status: Record<string, unknown>) => subscribers.forEach(fn => fn(status)),
    consoleError: (...args: unknown[]) => (context.console as { error: (...args: unknown[]) => void }).error(...args),
    shown: () => document.overlays().length,
  }
}

const hhmm = (at: number) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

describe('detecting a dead engine', () => {
  it('reacts to an uncaught wasm trap', () => {
    const p = page()
    p.error({ error: p.make("new WebAssembly.RuntimeError('unreachable')"), message: 'Uncaught RuntimeError: unreachable' })
    expect(p.shown()).toBe(1)
  })

  it('reacts to a trap or out-of-memory rejection', () => {
    for (const reason of [
      "new WebAssembly.RuntimeError('memory access out of bounds')",
      "new RangeError('Array buffer allocation failed')",
      "new RangeError('WebAssembly.Memory.grow(): Maximum memory size exceeded')",
      "new RangeError('WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance')",
      "'out of memory'",
    ]) {
      const p = page()
      p.reject(p.make(reason))
      expect(p.shown(), reason).toBe(1)
    }
  })

  it('reads the trap from the message when the event has no error object', () => {
    for (const message of ['Uncaught RuntimeError: unreachable', 'RuntimeError: index out of bounds', 'Unreachable code should not be executed', 'Out of bounds memory access']) {
      const p = page()
      p.error({ error: null, message })
      expect(p.shown(), message).toBe(1)
    }
  })

  it('reacts to an exception that unwound through wasm frames', () => {
    const p = page()
    const error = p.make("Object.assign(new Error('JsValue(TypeError)'), { stack: 'Error\\n    at wasm://wasm/00c2f1a6:wasm-function[4127]:0x3b1f2\\n    at __wbg_adapter_52 (wordcraft-web.js:1:2)' })")
    p.error({ error, message: 'Uncaught Error' })
    expect(p.shown()).toBe(1)
  })

  it("reacts to eframe's panic report and still logs it", () => {
    const p = page()
    p.consoleError('panicked at crates/engine/src/layout.rs:120:9:\nindex out of bounds\n\nStack:\n\n...')
    expect(p.shown()).toBe(1)
    expect(p.logged).toHaveLength(1)
    expect(String(p.logged[0][0])).toContain('panicked at')
  })

  it('ignores ordinary errors from other scripts', () => {
    const p = page()
    p.error({ error: p.make("new TypeError(\"Cannot read properties of undefined (reading 'track')\")"), message: 'Uncaught TypeError' })
    p.error({ error: p.make("new Error('Failed to fetch analytics')"), message: 'Uncaught Error: Failed to fetch analytics' })
    p.error({ error: p.make("new RangeError('Invalid array length')"), message: 'Uncaught RangeError: Invalid array length' })
    p.error({ error: p.make("Object.assign(new Error('RuntimeError in widget'), { name: 'RuntimeError' })"), message: 'Uncaught RuntimeError: RuntimeError in widget' })
    p.error({ error: p.make("new Error('unreachable state in reducer')"), message: 'Uncaught Error: unreachable state in reducer' })
    p.error({ error: undefined, message: undefined })
    p.error({ error: null, message: 'Script error.' })
    p.reject(p.make("new Error('AbortError: the user aborted a request')"))
    p.reject('boom')
    p.reject(undefined)
    p.consoleError('wordcraft-web: no unsaved-changes guard: panicked at nothing')
    p.consoleError({ message: 'panicked at' })
    expect(p.shown()).toBe(0)
    expect(p.logged).toHaveLength(2)
  })
})

describe('the crash dialog', () => {
  const crash = (p: ReturnType<typeof page>) => p.error({ error: p.make("new WebAssembly.RuntimeError('unreachable')") })

  it('appears once however many errors follow', () => {
    const p = page()
    crash(p)
    crash(p)
    p.reject(p.make("new WebAssembly.RuntimeError('unreachable')"))
    p.consoleError('panicked at x')
    expect(p.shown()).toBe(1)
  })

  it('is an alert dialog with the title, a reload button and a link home', () => {
    const p = page()
    crash(p)
    const dialog = p.document.dialog()!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.text()).toContain('Công cụ gặp sự cố và đã dừng')
    const [home, reload] = dialog.querySelectorAll('button, a[href]')
    expect(home.tagName).toBe('A')
    expect(home.text()).toBe('Về trang chủ')
    expect(home.href).toBe('/')
    expect(reload.text()).toBe('Tải lại trang')
    reload.click()
    expect(p.reloads()).toBe(1)
  })

  it('keeps keyboard focus on the reload button', () => {
    const p = page()
    crash(p)
    const reload = p.document.dialog()!.querySelectorAll('button, a[href]')[1]
    expect(p.document.activeElement).toBe(reload)
    p.document.canvas.focus()
    expect(p.document.activeElement).toBe(reload)
  })

  it("silences the editor's leave-page prompt only once the engine is dead", () => {
    const p = page()
    expect(p.unload()).toBe(false)
    crash(p)
    expect(p.unload()).toBe(true)
  })

  it('names the time of the last draft saved on this device', () => {
    const p = page()
    const at = new Date(2026, 9, 20, 14, 5).getTime()
    p.status({ kind: 'saved', at, name: 'Báo cáo.docx' })
    p.status({ kind: 'quota', at: at + 60000, name: 'Báo cáo.docx' })
    crash(p)
    const text = p.document.dialog()!.text()
    expect(text).toContain(`Bản nháp gần nhất được lưu lúc ${hhmm(at)} trên thiết bị này; tải lại trang để khôi phục.`)
    expect(hhmm(at)).toBe('14:05')
  })

  it('leaves the draft time out when nothing was saved yet', () => {
    const p = page()
    p.status({ kind: 'error', at: Date.now(), name: 'x.docx' })
    crash(p)
    const text = p.document.dialog()!.text()
    expect(text).toContain('Phần việc từ lần lưu bản nháp gần nhất đến giờ có thể đã mất.')
    expect(text).not.toContain('Bản nháp gần nhất được lưu')
  })

  it('does not promise a draft where no draft store runs', () => {
    const p = page({ draftStore: false })
    crash(p)
    const text = p.document.dialog()!.text()
    expect(text).toContain('Phần việc chưa lưu có thể đã mất.')
    expect(text).not.toContain('bản nháp')
  })
})

describe('inside the ERP iframe', () => {
  it('tells the host page and leaves navigation to it', () => {
    const p = page({ draftStore: false, embed: true })
    p.error({ error: p.make("new WebAssembly.RuntimeError('unreachable')") })
    p.consoleError('panicked at again')
    expect(p.posted).toEqual([{ type: 'crashed', payload: {} }])
    const stops = p.document.dialog()!.querySelectorAll('button, a[href]')
    expect(stops.map(node => node.text())).toEqual(['Tải lại trang'])
  })

  it('posts nothing outside the iframe', () => {
    const p = page()
    p.error({ error: p.make("new WebAssembly.RuntimeError('unreachable')") })
    expect(p.posted).toHaveLength(0)
  })
})
