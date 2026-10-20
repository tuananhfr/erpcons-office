import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'viewport.js'), 'utf8')

function loadViewport({ withVisualViewport = true } = {}) {
  const listeners: Record<string, () => void> = {}
  const frames: (() => void)[] = []
  const props = new Map<string, string>()
  const writes: string[] = []
  const viewport = {
    height: 844, offsetTop: 0, scale: 1,
    addEventListener: (type: string, fn: () => void) => { listeners[type] = fn },
  }
  const root = {
    clientHeight: 844,
    style: {
      setProperty: (name: string, value: string) => { props.set(name, value); writes.push(value) },
      removeProperty: (name: string) => { props.delete(name); writes.push('') },
    },
  }
  vm.runInNewContext(SOURCE, {
    window: { visualViewport: withVisualViewport ? viewport : undefined, requestAnimationFrame: (fn: () => void) => frames.push(fn) },
    document: { documentElement: root },
  })
  const flush = () => { while (frames.length) frames.shift()!() }
  flush()
  return {
    viewport, root, frames, writes, flush,
    keyboard: () => props.get('--erp-keyboard-h'),
    fire: (type = 'resize') => listeners[type](),
  }
}

describe('soft keyboard height', () => {
  it('publishes the height the keyboard covers so the canvas bottom moves up', () => {
    const v = loadViewport()
    v.viewport.height = 508
    v.fire()
    v.flush()
    expect(v.keyboard()).toBe('336px')
  })

  it('accounts for iOS panning the visual viewport inside the page', () => {
    const v = loadViewport()
    v.viewport.height = 508
    v.viewport.offsetTop = 100
    v.fire('scroll')
    v.flush()
    expect(v.keyboard()).toBe('236px')
  })

  it('clears the value once the keyboard closes', () => {
    const v = loadViewport()
    v.viewport.height = 508
    v.fire()
    v.flush()
    v.viewport.height = 844
    v.fire()
    v.flush()
    expect(v.keyboard()).toBeUndefined()
  })

  it('stays at zero when the browser already shrinks the layout (interactive-widget)', () => {
    const v = loadViewport()
    v.root.clientHeight = 508
    v.viewport.height = 508
    v.fire()
    v.flush()
    expect(v.keyboard()).toBeUndefined()
    expect(v.writes).toEqual([])
  })

  it('ignores pinch zoom, which shrinks the visual viewport without a keyboard', () => {
    const v = loadViewport()
    v.viewport.scale = 2
    v.viewport.height = 422
    v.fire()
    v.flush()
    expect(v.keyboard()).toBeUndefined()
  })

  it('ignores small shrinks and tiny changes during the keyboard animation', () => {
    const v = loadViewport()
    v.viewport.height = 844 - 30
    v.fire()
    v.flush()
    expect(v.keyboard()).toBeUndefined()
    v.viewport.height = 508
    v.fire()
    v.flush()
    v.viewport.height = 506
    v.fire()
    v.flush()
    expect(v.keyboard()).toBe('336px')
    expect(v.writes).toEqual(['336px'])
  })

  it('handles a burst of events in one animation frame', () => {
    const v = loadViewport()
    v.viewport.height = 700
    v.fire()
    v.viewport.height = 508
    v.fire()
    v.fire('scroll')
    expect(v.frames).toHaveLength(1)
    v.flush()
    expect(v.writes).toEqual(['336px'])
  })

  it('does nothing on browsers without visualViewport', () => {
    const v = loadViewport({ withVisualViewport: false })
    expect(v.frames).toHaveLength(0)
    expect(v.writes).toEqual([])
  })
})
