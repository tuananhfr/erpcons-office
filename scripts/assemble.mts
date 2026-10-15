import fs from 'node:fs'
import path from 'node:path'
import { EDITORS } from '../src/config/editors.ts'
import { assetManifest, fillServiceWorker } from '../src/lib/build/asset-manifest.ts'
import { installEditor } from '../src/lib/build/assemble.ts'
import { precompressDir } from '../src/lib/build/precompress.ts'
import { REPO_ROOT, forkDist, workspaceRoot } from '../src/lib/build/workspace.ts'

const out = path.join(REPO_ROOT, 'out')
if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('out/index.html missing — run next build first')

const shell = path.join(REPO_ROOT, 'editor-shell')
const assets = {
  css: fs.readFileSync(path.join(shell, 'shell.css'), 'utf8'),
  script: fs.readFileSync(path.join(shell, 'shell.js'), 'utf8'),
}

const root = workspaceRoot()
for (const editor of EDITORS) {
  installEditor(editor, forkDist(editor, root), out, EDITORS, assets)
  console.log(`[${editor.slug}] installed from ${editor.fork}`)
}

// Hashes the files, so it changes exactly when out/ does (Next alone changes it every build); activate carries the old cache over.
const manifest = assetManifest(out)
fs.writeFileSync(path.join(out, 'sw.js'), fillServiceWorker(fs.readFileSync(path.join(shell, 'sw.js'), 'utf8'), manifest))
console.log(`sw.js build ${manifest.id}, ${manifest.urls.length} urls`)

const { files } = precompressDir(out)
console.log(`precompressed ${files} files`)
