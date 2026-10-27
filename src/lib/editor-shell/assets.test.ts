import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { piConfig } from '../../config/pi.ts'
import { SHELL_SCRIPTS, loadShellAssets, serviceWorkerIntake } from './assets.ts'

const shellDir = fileURLToPath(new URL('../../../editor-shell/', import.meta.url))

describe('loadShellAssets', () => {
  it('disables text selection only in the shell header, including its links and brand', () => {
    const css = loadShellAssets(shellDir).css
    const rule = css.match(/([^{}]+)\{([^{}]*-webkit-user-select:\s*none;[^{}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule?.[1].trim().split(/,\s*/)).toEqual(['.erp-shell', '.erp-shell a', '.erp-shell__brand'])
    expect(rule?.[2]).toMatch(/(?:^|;)\s*user-select:\s*none;/)
    expect(rule?.[2]).not.toMatch(/pointer-events/)
  })

  it('lets clicks pass through the transfer note to the editor, except on its own link and button', () => {
    const css = loadShellAssets(shellDir).css
    const rule = (selector: string) => css.split('}').map((block) => block.split('{')).find(([head]) => head.replace(/\/\*[^]*?\*\//g, '').trim() === selector)?.[1] ?? ''
    expect(rule('.erp-shell__transfer')).toMatch(/pointer-events:\s*none/)
    expect(rule('.erp-shell__transfer a, .erp-shell__transfer button')).toMatch(/pointer-events:\s*auto/)
  })

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

  it('ships the keyboard and file picker helpers, with the MIME map the picker reads declared first', () => {
    const script = loadShellAssets(shellDir).script
    const part = (name: string) => script.indexOf(fs.readFileSync(`${shellDir}${name}`, 'utf8').trim())
    expect(part('viewport.js')).toBeGreaterThan(-1)
    const map = script.indexOf('window.erpMimeTypes={"docx":["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]')
    expect(map).toBeGreaterThan(-1)
    expect(part('file-picker.js')).toBeGreaterThan(map)
  })

  it('ships every script in the editor-shell folder except the service worker', () => {
    const shipped = new Set(SHELL_SCRIPTS)
    const onDisk = fs.readdirSync(shellDir).filter((name) => name.endsWith('.js') && name !== 'sw.js')
    expect(onDisk.filter((name) => !shipped.has(name))).toEqual([])
  })

  it('runs the host bridge after open-file and the draft store', () => {
    const script = loadShellAssets(shellDir).script
    const part = (name: string) => script.indexOf(fs.readFileSync(`${shellDir}${name}`, 'utf8').trim())
    expect(part('host-bridge.js')).toBeGreaterThan(part('open-file.js'))
    expect(part('host-bridge.js')).toBeGreaterThan(part('drafts.js'))
    expect(part('open-file.js')).toBeGreaterThan(-1)
  })

  it('runs the account script right after shell.js and its bar UI right after it', () => {
    expect(SHELL_SCRIPTS.slice(0, 3)).toEqual(['shell.js', 'account.js', 'account-ui.js'])
    const script = loadShellAssets(shellDir).script
    const part = (name: string) => script.indexOf(fs.readFileSync(`${shellDir}${name}`, 'utf8').trim())
    expect(part('account.js')).toBeGreaterThan(part('shell.js'))
    expect(part('account-ui.js')).toBeGreaterThan(part('account.js'))
    expect(part('viewport.js')).toBeGreaterThan(part('account-ui.js'))
  })

  it('declares window.erpPi before the account script only when PI sign-in is enabled', () => {
    const off = loadShellAssets(shellDir, ['https://lpc.vn'], null)
    expect(off.script).not.toContain('window.erpPi=')
    expect(off.account).toBe(false)
    const on = loadShellAssets(shellDir, ['https://lpc.vn'], piConfig(true))
    expect(on.account).toBe(true)
    const config = on.script.indexOf('window.erpPi={"version":1,"issuer":"https://id.pi.invalid"')
    expect(config).toBeGreaterThan(on.script.indexOf('window.erpMimeTypes='))
    expect(config).toBeLessThan(on.script.indexOf(fs.readFileSync(`${shellDir}account.js`, 'utf8').trim()))
  })

  it('follows the feature flag by default', () => {
    const assets = loadShellAssets(shellDir)
    expect(assets.account).toBe(piConfig() !== null)
    expect(assets.script.includes('window.erpPi=')).toBe(piConfig() !== null)
  })

  it('runs the crash guard last, once the draft store and the host bridge it reads exist', () => {
    const script = loadShellAssets(shellDir).script
    const part = (name: string) => script.indexOf(fs.readFileSync(`${shellDir}${name}`, 'utf8').trim())
    expect(part('crash-guard.js')).toBeGreaterThan(part('drafts.js'))
    expect(part('crash-guard.js')).toBeGreaterThan(part('host-bridge.js'))
    expect(script.trimEnd().endsWith(fs.readFileSync(`${shellDir}crash-guard.js`, 'utf8').trim())).toBe(true)
  })

  it('declares the intake contract, then runs intake.js before open-file.js and share.js after it', () => {
    const script = loadShellAssets(shellDir).script
    const part = (name: string) => script.indexOf(fs.readFileSync(`${shellDir}${name}`, 'utf8').trim())
    const contract = script.indexOf('window.erpIntakeContract={"version":1,')
    expect(contract).toBeGreaterThan(script.indexOf('window.erpMimeTypes='))
    expect(part('intake.js')).toBeGreaterThan(contract)
    expect(part('open-file.js')).toBeGreaterThan(part('intake.js'))
    expect(part('share.js')).toBeGreaterThan(part('open-file.js'))
    expect(part('host-bridge.js')).toBeGreaterThan(part('share.js'))
  })

  it('gives the service worker the same contract and intake.js, on its own global', () => {
    const intake = serviceWorkerIntake(shellDir)
    expect(intake.startsWith('self.erpIntakeContract={"version":1,')).toBe(true)
    expect(intake).toContain(fs.readFileSync(`${shellDir}intake.js`, 'utf8').trim())
    const page = loadShellAssets(shellDir).script
    const contract = (source: string, global: string) => source.slice(source.indexOf(`${global}.erpIntakeContract=`) + global.length + 19).split(';\n')[0]
    expect(contract(intake, 'self')).toBe(contract(page, 'window'))
  })
})
