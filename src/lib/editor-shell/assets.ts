import fs from 'node:fs'
import path from 'node:path'
import type { ShellAssets } from './inject.ts'

export function loadShellAssets(directory: string): ShellAssets {
  return {
    css: fs.readFileSync(path.join(directory, 'shell.css'), 'utf8'),
    // Both files use IIFEs; a newline alone would chain them as one expression.
    script: ['shell.js', 'open-file.js'].map(name => fs.readFileSync(path.join(directory, name), 'utf8')).join(';\n'),
  }
}
