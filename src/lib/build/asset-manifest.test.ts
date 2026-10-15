import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assetManifest, fillServiceWorker } from './asset-manifest.ts'

let tmp: string
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

function site(files: Record<string, string>) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-manifest-'))
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true })
    fs.writeFileSync(path.join(tmp, rel), body)
  }
  return tmp
}

describe('assetManifest', () => {
  it('lists the URL each file is requested by, pages as their directory', () => {
    const out = site({
      'index.html': 'landing', 'van-ban/index.html': 'doc', 'van-ban/w_bg.wasm': 'w',
      '_next/static/a.js': 'a', 'brand/x.svg': 'x', 'sw.js': 'worker',
      'van-ban/w_bg.wasm.br': 'compressed', 'van-ban/w_bg.wasm.gz': 'compressed',
    })
    expect(assetManifest(out).urls).toEqual(['/', '/_next/static/a.js', '/brand/x.svg', '/van-ban/', '/van-ban/w_bg.wasm'])
  })

  it('gives the same id for the same content so a no-op deploy keeps the cache', () => {
    const a = assetManifest(site({ 'index.html': 'landing', 'pdf/index.html': 'p' })).id
    fs.rmSync(tmp, { recursive: true, force: true })
    const b = assetManifest(site({ 'index.html': 'landing', 'pdf/index.html': 'p' })).id
    fs.rmSync(tmp, { recursive: true, force: true })
    const c = assetManifest(site({ 'index.html': 'landing changed', 'pdf/index.html': 'p' })).id
    expect(a).toMatch(/^[0-9a-f]{12}$/)
    expect(b).toBe(a)
    expect(c).not.toBe(a)
  })

  it('ignores the worker file itself so writing it does not change the id', () => {
    const out = site({ 'index.html': 'landing' })
    const before = assetManifest(out).id
    fs.writeFileSync(path.join(out, 'sw.js'), 'anything')
    expect(assetManifest(out).id).toBe(before)
  })
})

describe('fillServiceWorker', () => {
  it('fills both placeholders and refuses a template without them', () => {
    const filled = fillServiceWorker("var CACHE = 'erpcons-office-__BUILD_ID__'\nvar MANIFEST = /*__ASSET_MANIFEST__*/[]\n", { id: 'abc123abc123', urls: ['/', '/pdf/'] })
    expect(filled).toBe("var CACHE = 'erpcons-office-abc123abc123'\nvar MANIFEST = [\"/\",\"/pdf/\"]\n")
    expect(() => fillServiceWorker("var CACHE = 'x'", { id: 'a', urls: [] })).toThrow(/placeholder/)
  })
})
