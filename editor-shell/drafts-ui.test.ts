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
