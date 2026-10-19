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
})
