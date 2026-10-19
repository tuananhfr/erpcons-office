import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadShellAssets } from './assets.ts'

const shellDir = fileURLToPath(new URL('../../../editor-shell/', import.meta.url))

describe('loadShellAssets', () => {
  it('ships the key guard with every editor page', () => {
    const keys = fs.readFileSync(`${shellDir}keys.js`, 'utf8').trim()
    expect(loadShellAssets(shellDir).script).toContain(keys)
  })

  it('installs the draft store before the panel that reads it', () => {
    const script = loadShellAssets(shellDir).script
    const store = script.indexOf(fs.readFileSync(`${shellDir}drafts.js`, 'utf8').trim())
    const panel = script.indexOf(fs.readFileSync(`${shellDir}drafts-ui.js`, 'utf8').trim())
    expect(store).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(store)
  })

  it('declares embed hosts before any shell script', () => {
    expect(loadShellAssets(shellDir, ['https://lpc.vn']).script.startsWith('window.erpEmbedHosts=["https://lpc.vn"];')).toBe(true)
  })

  it('runs the host bridge after open-file and the draft store', () => {
    const script = loadShellAssets(shellDir).script
    const part = (name: string) => script.indexOf(fs.readFileSync(`${shellDir}${name}`, 'utf8').trim())
    expect(part('host-bridge.js')).toBeGreaterThan(part('open-file.js'))
    expect(part('host-bridge.js')).toBeGreaterThan(part('drafts.js'))
    expect(part('open-file.js')).toBeGreaterThan(-1)
  })
})
