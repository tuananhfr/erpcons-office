import fs from 'node:fs'
import path from 'node:path'
import { embedHosts } from '../../config/embed.ts'
import type { ShellAssets } from './inject.ts'

export function loadShellAssets(directory: string, hosts: readonly string[] = embedHosts(undefined)): ShellAssets {
  const scripts = ['shell.js', 'open-file.js', 'keys.js', 'drafts.js', 'drafts-ui.js', 'host-bridge.js']
  return {
    css: fs.readFileSync(path.join(directory, 'shell.css'), 'utf8'),
    // Each file is an IIFE; a newline alone would chain them as one expression.
    script: [`window.erpEmbedHosts=${JSON.stringify(hosts)}`]
      .concat(scripts.map(name => fs.readFileSync(path.join(directory, name), 'utf8')))
      .join(';\n'),
  }
}
