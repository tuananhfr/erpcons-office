import { describe, expect, it } from 'vitest'
import { startWarmUp, type WarmUpEnv, type WorkerContainer } from './warm-up.ts'

function setup(initial: string | null) {
  const sent: { to: string; urls: string[] }[] = []
  const worker = (name: string) => ({ postMessage: (m: { urls: string[] }) => { sent.push({ to: name, urls: m.urls }) } })
  let onChange = () => {}
  let onResource: (urls: string[]) => void = () => {}
  const loaded = ['https://office.erpcons.vn/_next/static/a.js']
  const container: WorkerContainer = {
    controller: initial ? worker(initial) : null,
    addEventListener: (_type, fn) => { onChange = fn },
  }
  const env: WarmUpEnv = { href: 'https://office.erpcons.vn/', loaded: () => [...loaded], observe: (fn) => { onResource = fn } }
  startWarmUp(container, env)
  return {
    sent,
    switchTo: (name: string) => { container.controller = worker(name); onChange() },
    finish: (url: string) => { loaded.push(url); onResource([url]) },
  }
}

describe('startWarmUp', () => {
  it('hands the controlling worker the page and what it loaded', () => {
    expect(setup('A').sent).toEqual([{ to: 'A', urls: ['https://office.erpcons.vn/', 'https://office.erpcons.vn/_next/static/a.js'] }])
  })

  it('re-sends everything to a worker that takes over and routes later files to it', () => {
    const s = setup('A')
    s.switchTo('B')
    s.finish('https://office.erpcons.vn/brand/x.svg')
    expect(s.sent.slice(1)).toEqual([
      { to: 'B', urls: ['https://office.erpcons.vn/', 'https://office.erpcons.vn/_next/static/a.js'] },
      { to: 'B', urls: ['https://office.erpcons.vn/brand/x.svg'] },
    ])
  })

  it('waits for a controller on the very first visit', () => {
    const s = setup(null)
    s.finish('https://office.erpcons.vn/brand/x.svg')
    expect(s.sent).toEqual([])
    s.switchTo('A')
    expect(s.sent).toEqual([{ to: 'A', urls: ['https://office.erpcons.vn/', 'https://office.erpcons.vn/_next/static/a.js', 'https://office.erpcons.vn/brand/x.svg'] }])
  })
})
