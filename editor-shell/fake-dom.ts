// A small DOM for shell scripts that build their own UI: elements with classes, attributes, children, listeners
// and focus. Selectors: `tag`, `.class`, `[attr]`, `[attr="value"]`.
type Listener = (event: FakeEvent) => void

export class FakeEvent {
  type: string
  key?: string
  shiftKey = false
  target: FakeElement | null = null
  defaultPrevented = false
  propagationStopped = false
  returnValue: unknown = undefined
  constructor(type: string, init: Partial<FakeEvent> = {}) {
    this.type = type
    Object.assign(this, init)
  }
  preventDefault() { this.defaultPrevented = true }
  stopPropagation() { this.propagationStopped = true }
}

function matches(node: FakeElement, selector: string): boolean {
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1))
  const attr = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector)
  if (attr) return attr[1] in node.attributes && (attr[2] === undefined || node.attributes[attr[1]] === attr[2])
  return node.tagName === selector.toUpperCase()
}

export class FakeElement {
  tagName: string
  className = ''
  id = ''
  title = ''
  href = ''
  type = ''
  hidden = false
  disabled = false
  parent: FakeElement | null = null
  children: FakeElement[] = []
  attributes: Record<string, string> = {}
  listeners: Record<string, Listener[]> = {}
  private content = ''
  private doc: FakeDocument
  constructor(tag: string, doc: FakeDocument) {
    this.tagName = tag.toUpperCase()
    this.doc = doc
  }
  set textContent(value: string) {
    this.content = value
    this.children.forEach(child => { child.parent = null })
    this.children = []
  }
  get textContent() { return [this.content, ...this.children.map(child => child.textContent)].join('') }
  appendChild(child: FakeElement) {
    child.parent?.removeChild(child)
    child.parent = this
    this.children.push(child)
    return child
  }
  insertBefore(child: FakeElement, ref: FakeElement | null) {
    child.parent?.removeChild(child)
    const at = ref ? this.children.indexOf(ref) : -1
    child.parent = this
    if (at === -1) this.children.push(child)
    else this.children.splice(at, 0, child)
    return child
  }
  removeChild(child: FakeElement) {
    this.children = this.children.filter(c => c !== child)
    child.parent = null
  }
  remove() { this.parent?.removeChild(this) }
  contains(node: FakeElement | null): boolean {
    for (let n = node; n; n = n.parent) if (n === this) return true
    return false
  }
  setAttribute(name: string, value: string) { this.attributes[name] = String(value) }
  getAttribute(name: string) { return name in this.attributes ? this.attributes[name] : null }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type: string, fn: Listener) { this.listeners[type] = (this.listeners[type] || []).filter(l => l !== fn) }
  /** Bubbles to the document like a real event. */
  dispatch(event: FakeEvent) {
    event.target = event.target ?? this
    for (let n: FakeElement | null = this; n && !event.propagationStopped; n = n.parent) (n.listeners[event.type] || []).slice().forEach(fn => fn(event))
    if (!event.propagationStopped && this.doc.contains(this)) this.doc.fire(event)
    return event
  }
  click() { if (!this.disabled) this.dispatch(new FakeEvent('click')) }
  focus() { this.doc.activeElement = this }
  descendants(): FakeElement[] { return this.children.flatMap(child => [child, ...child.descendants()]) }
  querySelectorAll(selector: string) { return this.descendants().filter(node => matches(node, selector)) }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null }
  get connected() { return this.doc.contains(this) }
}

export class FakeDocument {
  body: FakeElement
  activeElement: FakeElement | null = null
  visibilityState = 'visible'
  listeners: Record<string, Listener[]> = {}
  constructor() { this.body = new FakeElement('body', this) }
  createElement(tag: string) { return new FakeElement(tag, this) }
  querySelector(selector: string) { return this.body.querySelector(selector) }
  querySelectorAll(selector: string) { return this.body.querySelectorAll(selector) }
  contains(node: FakeElement) { return this.body.contains(node) }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type: string, fn: Listener) { this.listeners[type] = (this.listeners[type] || []).filter(l => l !== fn) }
  fire(event: FakeEvent) { (this.listeners[event.type] || []).slice().forEach(fn => fn(event)) }
}

/** The text of the buttons and links under `root`, in order. */
export function actionLabels(root: FakeElement): string[] {
  return root.descendants().filter(n => n.tagName === 'BUTTON' || n.tagName === 'A').map(n => n.textContent)
}

export function buttonNamed(root: FakeElement, label: string): FakeElement {
  const found = root.descendants().find(n => (n.tagName === 'BUTTON' || n.tagName === 'A') && n.textContent === label)
  if (!found) throw new Error(`no button "${label}" in: ${actionLabels(root).join(' | ')}`)
  return found
}
