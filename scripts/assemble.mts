import fs from 'node:fs'
import path from 'node:path'
import { EDITORS } from '../src/config/editors.ts'
import { embedHosts } from '../src/config/embed.ts'
import { assetManifest, fillServiceWorker } from '../src/lib/build/asset-manifest.ts'
import { loadShellAssets } from '../src/lib/editor-shell/assets.ts'
import { installEditor } from '../src/lib/build/assemble.ts'
import { precompressDir } from '../src/lib/build/precompress.ts'
import { REPO_ROOT, forkDist, workspaceRoot } from '../src/lib/build/workspace.ts'

import { buildInfo } from '../src/lib/build/provenance.ts'
import { siteSbom } from '../src/lib/build/site-sbom.ts'

const out = path.join(REPO_ROOT, 'out')
if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('out/index.html missing — run next build first')

const shell = path.join(REPO_ROOT, 'editor-shell')
const assets = loadShellAssets(shell, embedHosts(process.env.ERPCONS_EMBED_HOSTS))

const root = workspaceRoot()
const info = buildInfo(root, REPO_ROOT, process.argv.includes('--allow-local-provenance') || process.env.ERPCONS_ALLOW_LOCAL_PROVENANCE === '1')
for (const editor of EDITORS) {
  installEditor(editor, forkDist(editor, root), out, EDITORS, assets)
  console.log(`[${editor.slug}] installed from ${editor.fork}`)
}

fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n')
fs.writeFileSync(path.join(out, 'sbom.cdx.json'), JSON.stringify(siteSbom(REPO_ROOT), null, 2) + '\n')

// Hashes the files, so it changes exactly when out/ does (Next alone changes it every build); activate carries the old cache over.
const manifest = assetManifest(out)
fs.writeFileSync(path.join(out, 'sw.js'), fillServiceWorker(fs.readFileSync(path.join(shell, 'sw.js'), 'utf8'), manifest))
console.log(`sw.js build ${manifest.id}, ${manifest.urls.length} urls`)

const { files } = precompressDir(out)
console.log(`precompressed ${files} files`)
