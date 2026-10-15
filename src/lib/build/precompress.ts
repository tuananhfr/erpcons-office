import fs from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const COMPRESSIBLE = /\.(wasm|js|mjs|css|html|svg|json|xml|txt)$/i
const MIN_BYTES = 1024

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** Precompressed siblings let the server send .br/.gz without compressing per request. */
export function precompressDir(dir: string): { files: number } {
  let files = 0
  for (const file of walk(dir)) {
    if (!COMPRESSIBLE.test(file)) continue
    const bytes = fs.readFileSync(file)
    if (bytes.length < MIN_BYTES) continue
    fs.writeFileSync(file + '.gz', gzipSync(bytes, { level: 9 }))
    fs.writeFileSync(file + '.br', brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
    }))
    files++
  }
  return { files }
}
