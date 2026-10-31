import fs from 'node:fs'
import path from 'node:path'
import type { EditorEntry } from '../../config/editors.ts'
import { injectEditorShell, type ShellAssets } from '../editor-shell/inject.ts'

/** Validates and injects in memory first so a bad build never wipes the previous output. */
export function installEditor(
  editor: EditorEntry, sourceDir: string, outDir: string, editors: readonly EditorEntry[], assets: ShellAssets, firstDownloadMb?: number | null,
): void {
  const sourceIndex = path.join(sourceDir, 'index.html')
  if (!fs.existsSync(sourceIndex)) throw new Error(`[${editor.slug}] missing build: ${sourceIndex}`)
  const page = injectEditorShell(fs.readFileSync(sourceIndex, 'utf8'), editor, editors, assets, firstDownloadMb)

  const target = path.join(outDir, editor.slug)
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(sourceDir, target, { recursive: true })
  fs.writeFileSync(path.join(target, 'index.html'), page)
}
