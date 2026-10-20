import fs from 'node:fs'
import path from 'node:path'
import { embedHosts } from '../../config/embed.ts'
import { MIME_BY_EXTENSION } from '../files/mime-types.ts'
import type { ShellAssets } from './inject.ts'

export const SHELL_SCRIPTS = ['shell.js', 'viewport.js', 'file-picker.js', 'open-file.js', 'keys.js', 'drafts.js', 'drafts-ui.js', 'host-bridge.js', 'crash-guard.js']

export function loadShellAssets(directory: string, hosts: readonly string[] = embedHosts(undefined)): ShellAssets {
  return {
    css: fs.readFileSync(path.join(directory, 'shell.css'), 'utf8'),
    // Each file is an IIFE; a newline alone would chain them as one expression.
    script: [`window.erpEmbedHosts=${JSON.stringify(hosts)}`, `window.erpMimeTypes=${JSON.stringify(MIME_BY_EXTENSION)}`]
      .concat(SHELL_SCRIPTS.map(name => fs.readFileSync(path.join(directory, name), 'utf8')))
      .join(';\n'),
  }
}
