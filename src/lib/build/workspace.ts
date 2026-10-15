import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EditorEntry } from '../../config/editors.ts'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export function workspaceRoot(): string {
  return process.env.ERPCONS_WORKSPACE ? path.resolve(process.env.ERPCONS_WORKSPACE) : path.resolve(REPO_ROOT, '..')
}

export function forkDist(editor: EditorEntry, root: string): string {
  return path.join(root, editor.fork, 'dist', 'web')
}
