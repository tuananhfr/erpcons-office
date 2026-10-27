import fs from 'node:fs'
import path from 'node:path'
import { embedHosts } from '../../config/embed.ts'
import { buildFlags } from '../../config/online.ts'
import { piConfig, piConfigScript, type PiConfig } from '../../config/pi.ts'
import { intakeContractScript } from '../files/intake-contract.ts'
import { MIME_BY_EXTENSION } from '../files/mime-types.ts'
import type { ShellAssets } from './inject.ts'

export const SHELL_SCRIPTS = ['shell.js', 'account.js', 'account-ui.js', 'viewport.js', 'file-picker.js', 'intake.js', 'open-file.js', 'share.js', 'keys.js', 'drafts.js', 'drafts-ui.js', 'host-bridge.js', 'crash-guard.js']

// Shipped only with online documents on (src/config/online.ts); online.js composes the parts before it.
export const ONLINE_SCRIPTS = ['online-backoff.js', 'online-api.js', 'online-pending.js', 'online-state.js', 'online-dialogs.js', 'online-saver.js', 'online-open.js', 'online.js']

/** The shell scripts of an editor page, in run order. */
export function shellScripts(online: boolean): string[] {
  if (!online) return SHELL_SCRIPTS.slice()
  const at = SHELL_SCRIPTS.indexOf('host-bridge.js')
  return SHELL_SCRIPTS.slice(0, at).concat(ONLINE_SCRIPTS, SHELL_SCRIPTS.slice(at))
}

export function loadShellAssets(
  directory: string,
  hosts: readonly string[] = embedHosts(undefined),
  pi: PiConfig | null = piConfig(),
  online: boolean = buildFlags().online,
): ShellAssets {
  // Without `window.erpPi` account.js only installs a guest erpAccount (built-in tiers, no network).
  const globals = [`window.erpEmbedHosts=${JSON.stringify(hosts)}`, `window.erpMimeTypes=${JSON.stringify(MIME_BY_EXTENSION)}`, intakeContractScript('window')]
  if (pi) globals.push(piConfigScript(pi))
  return {
    css: fs.readFileSync(path.join(directory, 'shell.css'), 'utf8'),
    // Each file is an IIFE; a newline alone would chain them as one expression.
    script: globals
      .concat(shellScripts(Boolean(pi) && online).map(name => fs.readFileSync(path.join(directory, name), 'utf8')))
      .join(';\n'),
    account: Boolean(pi),
  }
}

/** What fillServiceWorker inlines into sw.js: the same intake contract and intake.js the editor pages run. */
export function serviceWorkerIntake(directory: string): string {
  return [intakeContractScript('self'), fs.readFileSync(path.join(directory, 'intake.js'), 'utf8')].join(';\n')
}
