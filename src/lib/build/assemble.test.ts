import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { installEditor } from './assemble.ts'

const assets = { css: '', script: '' }
const word = EDITORS[0]
const page = '<html lang="en"><head><title>W</title></head><body><canvas id="wordcraft_canvas"></canvas><div id="wordcraft_loading">Loading</div></body></html>'
let tmp: string

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-assemble-'))
  const source = path.join(tmp, 'dist')
  const out = path.join(tmp, 'out')
  fs.mkdirSync(path.join(source, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(source, 'index.html'), page)
  fs.writeFileSync(path.join(source, 'app_bg.wasm'), 'wasm')
  fs.writeFileSync(path.join(source, 'nested', 'font.ttf'), 'font')
  fs.mkdirSync(path.join(out, 'van-ban'), { recursive: true })
  fs.writeFileSync(path.join(out, 'van-ban', 'stale.js'), 'old')
  return { source, out }
}

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('installEditor', () => {
  it('replaces out/<slug> with the build and injects the shell', () => {
    const { source, out } = setup()
    installEditor(word, source, out, EDITORS, assets)
    const target = path.join(out, 'van-ban')
    expect(fs.existsSync(path.join(target, 'stale.js'))).toBe(false)
    expect(fs.readFileSync(path.join(target, 'nested', 'font.ttf'), 'utf8')).toBe('font')
    expect(fs.readFileSync(path.join(target, 'index.html'), 'utf8')).toContain('data-erpcons-shell')
  })

  it('leaves the previous output untouched when the build is missing', () => {
    const { out } = setup()
    expect(() => installEditor(word, path.join(tmp, 'nope'), out, EDITORS, assets)).toThrow('missing build')
    expect(fs.readFileSync(path.join(out, 'van-ban', 'stale.js'), 'utf8')).toBe('old')
  })

  it('leaves the previous output untouched when injection fails', () => {
    const { source, out } = setup()
    fs.writeFileSync(path.join(source, 'index.html'), '<html><head></head><body></body></html>')
    expect(() => installEditor(word, source, out, EDITORS, assets)).toThrow('canvas #wordcraft_canvas not found')
    expect(fs.existsSync(path.join(out, 'van-ban', 'stale.js'))).toBe(true)
  })
})
