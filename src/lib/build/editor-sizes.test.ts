import { describe, expect, it } from 'vitest'
import { downloadMegabytes } from './editor-sizes.ts'

describe('downloadMegabytes', () => {
  it('sums only wasm and js, in decimal megabytes with one decimal', () => {
    expect(downloadMegabytes([
      { name: 'wordcraft-web-a4ce_bg.wasm', gzipBytes: 14_750_202 },
      { name: 'wordcraft-web-a4ce.js', gzipBytes: 40_000 },
      { name: 'wordcraft.ico', gzipBytes: 9_000_000 },
      { name: 'index.html', gzipBytes: 1_000 },
    ])).toBe(14.8)
  })

  it('returns 0 for an empty build', () => {
    expect(downloadMegabytes([])).toBe(0)
  })
})
