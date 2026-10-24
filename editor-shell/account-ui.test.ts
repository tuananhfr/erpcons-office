import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { EDITORS } from '../src/config/editors.ts'
import type { AccountSnapshot } from '../src/lib/account/types.ts'
import { injectEditorShell } from '../src/lib/editor-shell/inject.ts'

const SOURCE = fs.readFileSync(fileURLToPath(new URL('account-ui.js', import.meta.url)), 'utf8')
const TRUNK = '<!DOCTYPE html><html lang="en"><head><title>x</title></head><body><canvas id="wordcraft_canvas"></canvas><div id="wordcraft_loading">Loading</div></body></html>'

type Listener = (event: FakeEvent) => void
interface FakeEvent { type: string; key?: string; target?: FakeNode; relatedTarget?: FakeNode | null; defaultPrevented?: boolean; stopped?: boolean; preventDefault(): void; stopPropagation(): void }

class FakeNode {
  tag: string
  attrs = new Map<string, string>()
  children: FakeNode[] = []
  parent: FakeNode | null = null
  text = ''
  listeners: Record<string, Listener[]> = {}
  private doc: FakeDocument
  constructor(tag: string, doc: FakeDocument) { this.tag = tag; this.doc = doc }
  get hidden() { return this.attrs.has('hidden') }
  set hidden(value: boolean) { if (value) this.attrs.set('hidden', ''); else this.attrs.delete('hidden') }
  get disabled() { return this.attrs.has('disabled') }
  set disabled(value: boolean) { if (value) this.attrs.set('disabled', ''); else this.attrs.delete('disabled') }
  set type(value: string) { this.attrs.set('type', value) }
  set className(value: string) { this.attrs.set('class', value) }
  get title() { return this.attrs.get('title') ?? '' }
  set title(value: string) { this.attrs.set('title', value) }
  get textContent(): string { return this.tag === '#text' ? this.text : this.children.map(c => c.textContent).join('') }
  set textContent(value: string) {
    this.children = []
    if (value) this.appendChild(Object.assign(new FakeNode('#text', this.doc), { text: value }))
  }
  setAttribute(name: string, value: string) { this.attrs.set(name, String(value)) }
  getAttribute(name: string) { return this.attrs.get(name) ?? null }
  appendChild(child: FakeNode) { child.parent = this; this.children.push(child); return child }
  contains(other: unknown): boolean {
    for (let node = other as FakeNode | null; node; node = node.parent) if (node === this) return true
    return false
  }
  all(): FakeNode[] { return this.children.flatMap(c => [c, ...c.all()]) }
  matches(selector: string) {
    const attr = /^\[([a-z-]+)\]$/.exec(selector)
    return attr ? this.attrs.has(attr[1]) : this.tag === selector
  }
  querySelector(selector: string) { return this.all().find(n => n.matches(selector)) ?? null }
  querySelectorAll(selector: string) { return this.all().filter(n => n.matches(selector)) }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
  focus() { this.doc.activeElement = this }
  visible(): boolean { return !this.hidden && (!this.parent || this.parent.visible()) }
}

class FakeDocument {
  activeElement: FakeNode | null = null
  root: FakeNode
  listeners: Record<string, Listener[]> = {}
  constructor(html: string) { this.root = parse(html, this) }
  querySelector(selector: string) { return this.root.querySelector(selector) }
  createElement(tag: string) { return new FakeNode(tag, this) }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
  dispatch(target: FakeNode, type: string, extra: Partial<FakeEvent> = {}): FakeEvent {
    const event: FakeEvent = {
      type, target, ...extra,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() { this.stopped = true },
    }
    for (let node: FakeNode | null = target; node && !event.stopped; node = node.parent) (node.listeners[type] ?? []).forEach(fn => fn(event))
    if (!event.stopped) (this.listeners[type] ?? []).forEach(fn => fn(event))
    return event
  }
}

const VOID = new Set(['img', 'path', 'input', 'meta', 'link', 'br'])

function parse(html: string, doc: FakeDocument): FakeNode {
  const root = new FakeNode('#root', doc)
  let current = root
  const token = /<(\/?)([a-z]+)([^>]*?)(\/?)>|([^<]+)/gi
  for (let match = token.exec(html); match; match = token.exec(html)) {
    const [, closing, tag, attrs, selfClosing, text] = match
    if (text !== undefined) {
      current.appendChild(Object.assign(new FakeNode('#text', doc), { text }))
    } else if (closing) {
      current = current.parent ?? root
    } else {
      const node = current.appendChild(new FakeNode(tag.toLowerCase(), doc))
      for (const attr of attrs.matchAll(/([a-zA-Z:-]+)(?:="([^"]*)")?/g)) node.attrs.set(attr[1], attr[2] ?? '')
      if (!selfClosing && !VOID.has(node.tag)) current = node
    }
  }
  return root
}

function slotMarkup(account = true): string {
  const page = injectEditorShell(TRUNK, EDITORS[0], EDITORS, { css: '', script: '', account })
  const start = page.indexOf('<div class="erp-shell__account"')
  return start === -1 ? '' : page.slice(start, page.indexOf('</header>', start))
}

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return { version: 1, status: 'signed-out', user: null, orgs: [], activeOrg: null, product: 'vanban', entitlements: [], entitlementsFresh: false, error: null, ...overrides }
}

const signedIn = (overrides: Partial<AccountSnapshot> = {}) => snapshot({
  status: 'signed-in', user: { id: 'usr_an', name: 'Nguyễn Văn An', email: 'an.nguyen@example.com' }, ...overrides,
})

function mount(initial: AccountSnapshot | null, markup = slotMarkup()) {
  const document = new FakeDocument(markup)
  let current = initial
  const subscribers: ((s: AccountSnapshot) => void)[] = []
  const account = initial && {
    snapshot: () => current,
    onChange: (fn: (s: AccountSnapshot) => void) => { subscribers.push(fn); return () => {} },
    signIn: vi.fn(async () => current),
    signOut: vi.fn(async () => current),
    selectOrg: vi.fn(async () => current),
  }
  const timers: (() => void)[] = []
  const context: Record<string, unknown> = { document, setTimeout: (fn: () => void) => timers.push(fn), clearTimeout: () => {} }
  context.window = context
  if (account) context.erpAccount = account
  vm.createContext(context)
  vm.runInContext(SOURCE, context)
  const q = (name: string) => document.querySelector(`[data-erp-account${name ? `-${name}` : ''}]`)!
  return {
    document, account: account!, q, timers,
    emit(next: AccountSnapshot) { current = next; subscribers.forEach(fn => fn(next)) },
    click(node: FakeNode) { document.dispatch(node, 'click') },
    key(key: string) { return document.dispatch(document.activeElement ?? q(''), 'keydown', { key }) },
  }
}

describe('shell account slot', () => {
  it('is absent from the bar when PI sign-in is off, and the script copes', () => {
    expect(slotMarkup(false)).toBe('')
    expect(() => mount(snapshot({ status: 'disabled' }), '<header></header>')).not.toThrow()
    expect(() => mount(null)).not.toThrow()
  })

  it('stays hidden when account.js is disabled (flag off or embedded)', () => {
    const ui = mount(snapshot({ status: 'disabled' }))
    expect(ui.q('').hidden).toBe(true)
  })

  it('offers Đăng nhập when signed out and opens the popup from the click', () => {
    const ui = mount(snapshot())
    expect(ui.q('').hidden).toBe(false)
    expect(ui.q('sign-in').visible()).toBe(true)
    expect(ui.q('sign-in').textContent).toBe('Đăng nhập')
    expect(ui.q('user').hidden).toBe(true)
    ui.click(ui.q('sign-in'))
    expect(ui.account.signIn).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the popup is open', () => {
    const ui = mount(snapshot({ status: 'signing-in' }))
    expect(ui.q('sign-in').disabled).toBe(true)
    expect(ui.q('sign-in').getAttribute('aria-busy')).toBe('true')
  })

  it('shows initials of the given name, then name and email in the panel', () => {
    const ui = mount(signedIn())
    expect(ui.q('sign-in').hidden).toBe(true)
    expect(ui.q('initials').textContent).toBe('A')
    expect(ui.q('toggle').getAttribute('aria-label')).toBe('Tài khoản: Nguyễn Văn An')
    expect(ui.q('name').textContent).toBe('Nguyễn Văn An')
    expect(ui.q('email').textContent).toBe('an.nguyen@example.com')
    expect(ui.q('orgs').hidden).toBe(true)
    expect(ui.q('panel').hidden).toBe(true)
  })

  it('opens and closes the panel from the keyboard, returning focus to the avatar', () => {
    const ui = mount(signedIn())
    ui.click(ui.q('toggle'))
    expect(ui.q('panel').hidden).toBe(false)
    expect(ui.q('toggle').getAttribute('aria-expanded')).toBe('true')
    expect(ui.document.activeElement).toBe(ui.q('sign-out'))
    const escape = ui.key('Escape')
    expect(escape.defaultPrevented).toBe(true)
    expect(ui.q('panel').hidden).toBe(true)
    expect(ui.q('toggle').getAttribute('aria-expanded')).toBe('false')
    expect(ui.document.activeElement).toBe(ui.q('toggle'))
  })

  it('closes the panel on a click outside', () => {
    const ui = mount(signedIn())
    ui.click(ui.q('toggle'))
    ui.document.dispatch(ui.document.createElement('canvas'), 'pointerdown')
    expect(ui.q('panel').hidden).toBe(true)
  })

  it('lists Cá nhân and each organization, marks the active one and switches on click', () => {
    const ui = mount(signedIn({ orgs: [{ id: 'org_xd', name: 'Công ty Xây dựng Ví dụ', role: 'member' }] }))
    const buttons = () => ui.q('orgs').querySelectorAll('button')
    expect(ui.q('orgs').hidden).toBe(false)
    expect(buttons().map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Cá nhân', 'true'], ['Công ty Xây dựng Ví dụ', 'false']])
    ui.click(ui.q('toggle'))
    expect(ui.document.activeElement).toBe(buttons()[0])
    ui.key('ArrowDown')
    expect(ui.document.activeElement).toBe(buttons()[1])
    ui.key('ArrowDown')
    expect(ui.document.activeElement).toBe(ui.q('sign-out'))
    ui.key('ArrowDown')
    expect(ui.document.activeElement).toBe(buttons()[0])
    ui.click(buttons()[1])
    expect(ui.account.selectOrg).toHaveBeenCalledWith('org_xd')
    expect(ui.q('panel').hidden).toBe(true)
    ui.emit(signedIn({ orgs: [{ id: 'org_xd', name: 'Công ty Xây dựng Ví dụ', role: 'member' }], activeOrg: { id: 'org_xd', name: 'Công ty Xây dựng Ví dụ', role: 'member' } }))
    expect(buttons().map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(ui.q('toggle').getAttribute('aria-label')).toBe('Tài khoản: Nguyễn Văn An · Công ty Xây dựng Ví dụ')
  })

  it('signs out from the panel and falls back to the sign-in button', () => {
    const ui = mount(signedIn())
    ui.click(ui.q('toggle'))
    ui.click(ui.q('sign-out'))
    expect(ui.account.signOut).toHaveBeenCalledTimes(1)
    ui.emit(snapshot())
    expect(ui.q('user').hidden).toBe(true)
    expect(ui.q('sign-in').hidden).toBe(false)
  })

  it('shows an error once, as a polite status the user can dismiss', () => {
    const ui = mount(snapshot())
    const error = { code: 'popup_blocked', message: 'Trình duyệt đã chặn cửa sổ đăng nhập.', retryAfter: null }
    ui.emit(snapshot({ error }))
    expect(ui.q('note').textContent).toBe(error.message)
    expect(ui.q('note').getAttribute('aria-live')).toBe('polite')
    ui.click(ui.q('note'))
    expect(ui.q('note').textContent).toBe('')
    ui.emit(snapshot({ error }))
    expect(ui.q('note').textContent).toBe('')
    ui.emit(snapshot({ error: { ...error, code: 'network', message: 'Không kết nối được PI ID.' } }))
    expect(ui.q('note').textContent).toBe('Không kết nối được PI ID.')
    ui.timers.forEach(fn => fn())
    expect(ui.q('note').textContent).toBe('')
  })
})
