import fs from 'node:fs'
import path from 'node:path'
import { EDITORS } from '../src/config/editors.ts'
import { embedHosts } from '../src/config/embed.ts'
import { LOCAL_ONLINE_ENV, buildFlags } from '../src/config/online.ts'
import { piConfig } from '../src/config/pi.ts'
import { accountScript } from '../src/lib/account/account-script.ts'
import { signInPages } from '../src/lib/account/sign-in-pages.ts'
import { assetManifest, fillServiceWorker } from '../src/lib/build/asset-manifest.ts'
import { loadShellAssets, serviceWorkerIntake } from '../src/lib/editor-shell/assets.ts'
import { installEditor } from '../src/lib/build/assemble.ts'
import { precompressDir } from '../src/lib/build/precompress.ts'
import { REPO_ROOT, forkDist, workspaceRoot } from '../src/lib/build/workspace.ts'

import { buildInfo } from '../src/lib/build/provenance.ts'
import { siteSbom } from '../src/lib/build/site-sbom.ts'

const out = path.join(REPO_ROOT, 'out')
if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('out/index.html missing — run next build first')

const shell = path.join(REPO_ROOT, 'editor-shell')
const flags = buildFlags(process.env, process.argv)
if (flags.localOverride) console.warn(`${LOCAL_ONLINE_ENV}: PI sign-in and online documents are on; this out/ must never be deployed`)
const pi = piConfig(flags.pi)
const assets = loadShellAssets(shell, embedHosts(process.env.ERPCONS_EMBED_HOSTS), pi, flags.online)

const root = workspaceRoot()
const info = buildInfo(root, REPO_ROOT, process.argv.includes('--allow-local-provenance') || process.env.ERPCONS_ALLOW_LOCAL_PROVENANCE === '1')
for (const editor of EDITORS) {
  installEditor(editor, forkDist(editor, root), out, EDITORS, assets)
  console.log(`[${editor.slug}] installed from ${editor.fork}`)
}

// Only with PI sign-in enabled: the deployed site otherwise ships no sign-in pages at all.
if (pi) {
  for (const page of signInPages(pi, accountScript(pi, shell))) {
    fs.mkdirSync(path.dirname(path.join(out, page.file)), { recursive: true })
    fs.writeFileSync(path.join(out, page.file), page.html)
    console.log(`sign-in page /${page.file}`)
  }
}

fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n')
fs.writeFileSync(path.join(out, 'sbom.cdx.json'), JSON.stringify(siteSbom(REPO_ROOT), null, 2) + '\n')

// Hashes the files, so it changes exactly when out/ does (Next alone changes it every build); activate carries the old cache over.
const manifest = assetManifest(out)
fs.writeFileSync(path.join(out, 'sw.js'), fillServiceWorker(fs.readFileSync(path.join(shell, 'sw.js'), 'utf8'), manifest, serviceWorkerIntake(shell)))
console.log(`sw.js build ${manifest.id}, ${manifest.urls.length} urls`)

const { files } = precompressDir(out)
console.log(`precompressed ${files} files`)
