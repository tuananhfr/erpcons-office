import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBrandLeaks, forkBranchProblem, scanDistForBrand } from './fork-guard.ts'

describe('forkBranchProblem', () => {
  it('accepts the tuananhfr branch', () => {
    expect(forkBranchProblem('gridcraft', 'tuananhfr')).toBeNull()
  })

  it('names the fork and the branch it needs otherwise', () => {
    expect(forkBranchProblem('gridcraft', 'main')).toMatch(/gridcraft.*main.*tuananhfr/)
    expect(forkBranchProblem('gridcraft', 'erpcons')).toMatch(/gridcraft.*erpcons.*tuananhfr/)
    expect(forkBranchProblem('gridcraft', '')).toMatch(/gridcraft.*detached.*tuananhfr/)
  })
})

describe('findBrandLeaks', () => {
  it('reports every forbidden term with its file', () => {
    const leaks = findBrandLeaks('a.js', 'open("https://discord.gg/artcraft") ; https://getartcraft.com/apps')
    expect(leaks.map((l) => l.term)).toEqual(['discord.gg/artcraft', 'getartcraft'])
    expect(leaks[0].file).toBe('a.js')
  })

  it('keeps the attribution line and the copyright line', () => {
    const text = 'ERPCons Văn phòng — dựa trên GridCraft của nhóm ArtCraft. MIT OR Apache-2.0.\u0000© 2026 ArtCraft Team and the DeckCraft contributors'
    expect(findBrandLeaks('x.wasm', text)).toEqual([])
  })

  it('reports a bare ArtCraft in any case', () => {
    expect(findBrandLeaks('x.wasm', 'spreadsheet. Part of ArtCraft.').map((l) => l.term)).toEqual(['ArtCraft'])
    expect(findBrandLeaks('x.wasm', 'ARTCRAFT artcraft').map((l) => l.term)).toEqual(['ARTCRAFT', 'artcraft'])
  })

  it('reads UTF-8 out of binary data', () => {
    const bytes = new Uint8Array([0, 0xff, ...new TextEncoder().encode('của nhóm ArtCraft|Join the ArtCraft Discord'), 0])
    expect(findBrandLeaks('x.wasm', bytes).map((l) => l.term)).toEqual(['ArtCraft'])
  })

  it('shows printable context around a hit', () => {
    const [leak] = findBrandLeaks('x.wasm', '\u0000\u0001Part of ArtCraft.\u0002')
    expect(leak.context).toContain('Part of ArtCraft.')
    expect([...leak.context].every((c) => c.charCodeAt(0) >= 0x20)).toBe(true)
  })
})

describe('scanDistForBrand', () => {
  it('walks sub-directories and flags brand file names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-'))
    fs.mkdirSync(path.join(dir, 'assets'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<title>PdfCraft</title>')
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'x="https://getartcraft.com"')
    fs.writeFileSync(path.join(dir, 'artcraft-mark-1234.svg'), '<svg/>')
    const leaks = scanDistForBrand(dir)
    // One hit per position: the "artcraft" inside a forbidden term is not reported again.
    expect(leaks.map((l) => `${l.file}:${l.term}`).sort()).toEqual(['artcraft-mark-1234.svg:artcraft-mark', 'assets/app.js:getartcraft'])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
