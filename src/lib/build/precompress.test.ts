import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { precompressDir } from './precompress.ts'

let tmp: string
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('precompressDir', () => {
  it('writes .gz and .br for large text and wasm files only', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-compress-'))
    const big = 'x'.repeat(4096)
    fs.mkdirSync(path.join(tmp, 'sub'))
    fs.writeFileSync(path.join(tmp, 'sub', 'a_bg.wasm'), big)
    fs.writeFileSync(path.join(tmp, 'small.js'), 'x')
    fs.writeFileSync(path.join(tmp, 'photo.png'), big)

    expect(precompressDir(tmp)).toEqual({ files: 1 })
    expect(gunzipSync(fs.readFileSync(path.join(tmp, 'sub', 'a_bg.wasm.gz'))).toString()).toBe(big)
    expect(brotliDecompressSync(fs.readFileSync(path.join(tmp, 'sub', 'a_bg.wasm.br'))).toString()).toBe(big)
    expect(fs.existsSync(path.join(tmp, 'small.js.gz'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'photo.png.gz'))).toBe(false)
  })

  it('does not compress its own outputs on a second run', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-compress-'))
    fs.writeFileSync(path.join(tmp, 'a.js'), 'y'.repeat(4096))
    precompressDir(tmp)
    expect(precompressDir(tmp)).toEqual({ files: 1 })
    expect(fs.existsSync(path.join(tmp, 'a.js.gz.gz'))).toBe(false)
  })
})
