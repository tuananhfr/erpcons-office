import fs from 'node:fs'
import path from 'node:path'
import { piConfigScript, type PiConfig } from '../../config/pi.ts'

export const SHELL_DIR = path.join(process.cwd(), 'editor-shell')

/** `window.erpPi` plus editor-shell/account.js, for pages outside the editors (landing, sign-in popup). */
export function accountScript(config: PiConfig, shellDir: string = SHELL_DIR): string {
  return [piConfigScript(config), fs.readFileSync(path.join(shellDir, 'account.js'), 'utf8')].join(';\n')
}
