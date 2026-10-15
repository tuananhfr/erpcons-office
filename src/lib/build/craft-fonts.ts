import path from 'node:path'

// Each fork's release workflow pins its own craft-fonts commit; building against the same one
// keeps our web builds byte-for-byte comparable with upstream releases.
const PINNED_REF = /^\s*craft-fonts-ref:\s*(["']?)([0-9a-f]{40})\1\s*$/m

export function craftFontsRef(releaseWorkflow: string): string | null {
  return PINNED_REF.exec(releaseWorkflow)?.[2] ?? null
}

// build.rs only warns without a checkout and ships an editor missing its fonts; refuse instead.
export function requiredCraftFontsRef(fork: string, releaseWorkflow: string | null): string {
  if (releaseWorkflow === null) throw new Error(`[${fork}] .github/workflows/release.yml not found; cannot tell which craft-fonts commit to build with`)
  const ref = craftFontsRef(releaseWorkflow)
  if (!ref) throw new Error(`[${fork}] no craft-fonts-ref (full commit sha) in release.yml; refusing to build without fonts`)
  return ref
}

// build.rs runs inside the crate dir, so CRAFT_FONTS_DIR must be absolute.
export function craftFontsDir(root: string, ref: string): string {
  return path.resolve(root, 'craft-fonts-refs', ref)
}
