import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'keys.js'), 'utf8')

type Target = { tagName: string; parentElement: unknown; closest: (sel: string) => unknown }
type Listener = (e: unknown) => void

function loadKeys(pathname: string) {
  const stage = { id: 'stage' }
  const shellBar = { id: 'bar' }
  const canvas: Target = { tagName: 'CANVAS', parentElement: stage, closest: () => null }
  const textAgent: Target = { tagName: 'INPUT', parentElement: stage, closest: () => null }
  const shellLink: Target = { tagName: 'A', parentElement: shellBar, closest: (sel) => (sel === '.erp-shell' ? shellBar : null) }
  const body: Target = { tagName: 'BODY', parentElement: null, closest: () => null }
  let listener: Listener | undefined
  let capture = false
  const context = {
    location: { pathname },
    document: { querySelector: (sel: string) => (sel === 'canvas' ? canvas : null) },
    window: {
      addEventListener: (type: string, fn: Listener, opts: { capture?: boolean } | boolean) => {
        if (type === 'keydown') { listener = fn; capture = typeof opts === 'object' ? Boolean(opts.capture) : opts }
      },
    },
  }
  vm.runInNewContext(SOURCE, context)
  function press(code: string, init: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; target?: Target } = {}) {
    let prevented = false
    let stopped = false
    listener?.({
      code, ctrlKey: Boolean(init.ctrl), metaKey: Boolean(init.meta), shiftKey: Boolean(init.shift), altKey: Boolean(init.alt),
      target: init.target ?? canvas,
      preventDefault: () => { prevented = true },
      stopPropagation: () => { stopped = true },
    })
    return { prevented, stopped }
  }
  return { press, capture: () => capture, targets: { canvas, textAgent, shellLink, body } }
}

describe('editor keys the browser must not take', () => {
  it('listens in the capture phase so it runs before the engine and the browser default', () => {
    expect(loadKeys('/van-ban/').capture()).toBe(true)
  })

  it('keeps Office formatting keys (Ctrl+B/R/L/F...) away from bookmarks, reload, address bar and find', () => {
    const k = loadKeys('/van-ban/')
    for (const code of ['KeyB', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyR', 'KeyU']) {
      expect(k.press(code, { ctrl: true }).prevented, code).toBe(true)
      expect(k.press(code, { ctrl: true, shift: true }).prevented, `shift ${code}`).toBe(true)
    }
    expect(k.press('KeyB', { meta: true }).prevented).toBe(true)
    expect(k.press('F7').prevented).toBe(true)
  })

  it('still lets the event reach the engine', () => {
    expect(loadKeys('/van-ban/').press('KeyB', { ctrl: true }).stopped).toBe(false)
  })

  it('works while typing in the engine text field too', () => {
    const k = loadKeys('/bang-tinh/')
    expect(k.press('KeyR', { ctrl: true, target: k.targets.textAgent }).prevented).toBe(true)
  })

  it('never blocks clipboard keys, so the engine still gets copy/cut/paste events', () => {
    const k = loadKeys('/van-ban/')
    for (const code of ['KeyC', 'KeyX', 'KeyV']) expect(k.press(code, { ctrl: true }).prevented, code).toBe(false)
  })

  it('leaves AltGr (Ctrl+Alt) alone because it types characters on many layouts', () => {
    expect(loadKeys('/van-ban/').press('KeyE', { ctrl: true, alt: true }).prevented).toBe(false)
  })

  it('leaves the browser alone outside the editor: the ERPCons bar and an unfocused page', () => {
    const k = loadKeys('/van-ban/')
    expect(k.press('KeyR', { ctrl: true, target: k.targets.shellLink }).prevented).toBe(false)
    expect(k.press('KeyR', { ctrl: true, target: k.targets.body }).prevented).toBe(false)
  })

  it('turns F5 into the slide show in Trình chiếu only', () => {
    expect(loadKeys('/trinh-chieu/').press('F5').prevented).toBe(true)
    expect(loadKeys('/trinh-chieu/').press('F5', { shift: true }).prevented).toBe(true)
    expect(loadKeys('/van-ban/').press('F5').prevented).toBe(false)
  })

  it('zooms the PDF, not the whole page, in PDF only', () => {
    const pdf = loadKeys('/pdf/')
    for (const code of ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract']) expect(pdf.press(code, { ctrl: true }).prevented, code).toBe(true)
    expect(loadKeys('/van-ban/').press('Equal', { ctrl: true }).prevented).toBe(false)
  })

  it('does nothing on pages that are not editors', () => {
    expect(loadKeys('/').press('KeyB', { ctrl: true }).prevented).toBe(false)
  })

  it('keeps developer tools and plain typing untouched', () => {
    const k = loadKeys('/van-ban/')
    expect(k.press('F12').prevented).toBe(false)
    expect(k.press('KeyB').prevented).toBe(false)
  })
})
