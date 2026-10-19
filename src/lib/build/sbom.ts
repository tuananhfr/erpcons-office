export const SBOM_DIR = 'sbom'
export const WEB_TARGET = 'wasm32-unknown-unknown'

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/
const SHORT_SHA = /^[0-9a-f]{7,40}$/

/** `<name>-<git short sha>.cdx.json`; refuses anything that could escape the sbom directory. */
export function sbomFileName(name: string, sha: string): string {
  if (!SAFE_NAME.test(name)) throw new Error(`SBOM name "${name}" must be lowercase letters, digits, ".", "_" or "-"`)
  if (!SHORT_SHA.test(sha)) throw new Error(`"${sha}" is not a git commit sha`)
  return `${name}-${sha}.cdx.json`
}

interface CdxComponent {
  components?: CdxComponent[]
}

/** Every component in a CycloneDX BOM, nested ones included; the root (metadata.component) is not counted. */
export function componentCount(bom: { components?: CdxComponent[] }): number {
  const count = (list: CdxComponent[] | undefined): number =>
    (list ?? []).reduce((sum, c) => sum + 1 + count(c.components), 0)
  return count(bom.components)
}

export interface SbomEntry {
  name: string
  file: string
  repo: string
  commit: string
  branch: string
  /** Uncommitted changes when the SBOM was made: the commit alone does not describe what was scanned. */
  dirty: boolean
  covers: string
  components: number
}

export interface SbomIndex {
  generatedAt: string
  sboms: SbomEntry[]
}

export function sbomIndex(entries: SbomEntry[], generatedAt: Date): SbomIndex {
  const names = new Set<string>()
  for (const e of entries) {
    if (names.has(e.name)) throw new Error(`two SBOMs named ${e.name}`)
    names.add(e.name)
  }
  return { generatedAt: generatedAt.toISOString(), sboms: [...entries].sort((a, b) => a.name.localeCompare(b.name)) }
}

/** Arguments for `cargo cyclonedx` on one crate; it writes `<outputStem>.json` next to every workspace member's Cargo.toml. */
export function cargoCyclonedxArgs(manifestPath: string, outputStem: string): string[] {
  return [
    'cyclonedx', '--manifest-path', manifestPath, '--format', 'json', '--spec-version', '1.5',
    '--target', WEB_TARGET, '--override-filename', outputStem,
  ]
}

/** The site's package.json as `npm sbom` needs it: it cannot make a purl for a root without a version. */
export function npmSbomPackageJson(pkg: Record<string, unknown>): Record<string, unknown> {
  return typeof pkg.version === 'string' && pkg.version !== '' ? pkg : { ...pkg, version: '0.0.0' }
}

/** Directories of the workspace members in `cargo metadata --no-deps` output. */
export function workspaceMemberDirs(metadata: { packages: { manifest_path: string }[] }): string[] {
  return metadata.packages.map((p) => p.manifest_path.replace(/[\\/]Cargo\.toml$/, ''))
}
