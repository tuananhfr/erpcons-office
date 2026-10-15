const COUNTED = /\.(wasm|js)$/i

/** What a first visit downloads (gzip), shown on the landing. */
export function downloadMegabytes(files: { name: string; gzipBytes: number }[]): number {
  const bytes = files.filter((f) => COUNTED.test(f.name)).reduce((sum, f) => sum + f.gzipBytes, 0)
  return Math.round(bytes / 100_000) / 10
}
