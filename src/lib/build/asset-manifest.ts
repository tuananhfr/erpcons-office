import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface AssetManifest {
  id: string
  urls: string[]
}

const PRECOMPRESSED = /\.(br|gz)$/

function walk(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel]
  })
}

/** URL paths of a built site plus an id that changes only when some file's content changes. */
export function assetManifest(outDir: string): AssetManifest {
  const files = walk(outDir).filter((rel) => rel !== 'sw.js' && rel !== 'sbom.cdx.json' && !PRECOMPRESSED.test(rel)).sort()
  const hash = createHash('sha256')
  const urls = files.map((rel) => {
    hash.update(rel).update('\0').update(fs.readFileSync(path.join(outDir, rel))).update('\0')
    return rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`
  })
  return { id: hash.digest('hex').slice(0, 12), urls: urls.sort() }
}

/** `intake` is the intake contract plus editor-shell/intake.js (serviceWorkerIntake), inlined so the worker needs no importScripts. */
export function fillServiceWorker(template: string, manifest: AssetManifest, intake: string): string {
  if (!template.includes('__BUILD_ID__') || !template.includes('/*__ASSET_MANIFEST__*/[]') || !template.includes('/*__INTAKE__*/')) {
    throw new Error('sw.js template is missing a placeholder')
  }
  return template
    .replace('__BUILD_ID__', () => manifest.id)
    .replace('/*__ASSET_MANIFEST__*/[]', () => JSON.stringify(manifest.urls))
    .replace('/*__INTAKE__*/', () => intake)
}
