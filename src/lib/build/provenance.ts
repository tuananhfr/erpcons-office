import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { EDITORS } from '../../config/editors.ts'

export const PROVENANCE = 'build-provenance.json'
export interface Checkout { sha: string; branch: string; dirty: boolean; version: string }
export interface Provenance extends Checkout {
  fork: string
  tools: Record<string, string>
  builtAt: string
  artifacts: Record<string, string>
}
function command(cmd: string, args: string[], cwd: string): string {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}: ${result.stderr}`)
  return result.stdout.trim()
}
export function checkout(dir: string): Checkout {
  const section = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8').match(/\[workspace\.package\]([^]*?)(?=\n\[|$)/)?.[1]
  const version = section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  if (!version) throw new Error(`Missing workspace.package version in ${dir}`)
  return { sha: gitSha(dir), branch: command('git', ['branch', '--show-current'], dir),
    dirty: command('git', ['status', '--porcelain', '--untracked-files=all'], dir) !== '', version }
}
export function gitSha(dir: string): string { return command('git', ['rev-parse', 'HEAD'], dir) }
// Trunk downloads the wasm-bindgen CLI matching the locked crate into its own cache, so the CLI is not on PATH.
export function lockedWasmBindgen(dir: string): string {
  const lock = fs.readFileSync(path.join(dir, 'Cargo.lock'), 'utf8')
  const version = lock.match(/^name = "wasm-bindgen"\r?\nversion = "([^"]+)"/m)?.[1]
  if (!version) throw new Error(`Missing wasm-bindgen in ${dir}/Cargo.lock`)
  return `wasm-bindgen ${version} (Cargo.lock)`
}
export function artifactHashes(dist: string): Record<string, string> {
  const names = fs.readdirSync(dist).filter((name) => /\.(wasm|js)$/.test(name)).sort()
  if (!names.some((name) => name.endsWith('.wasm')) || !names.some((name) => name.endsWith('.js'))) {
    throw new Error(`Missing main wasm/js artifacts in ${dist}`)
  }
  return Object.fromEntries(names.map((name) => [name, createHash('sha256').update(fs.readFileSync(path.join(dist, name))).digest('hex')]))
}
export function writeProvenance(fork: string, dir: string, dist: string, state: Checkout): void {
  const after = checkout(dir)
  if (JSON.stringify(after) !== JSON.stringify(state)) throw new Error(`[${fork}] checkout changed during build; rebuild`)
  const tools = { ...Object.fromEntries(['rustc', 'cargo'].map((tool) => [tool, command(tool, ['--version'], dir)])), 'wasm-bindgen': lockedWasmBindgen(dir) }
  fs.writeFileSync(path.join(dist, PROVENANCE), JSON.stringify({ ...state, fork, tools, builtAt: new Date().toISOString(), artifacts: artifactHashes(dist) }, null, 2) + '\n')
}
export function verifyProvenance(dist: string, fork: string, expected: Checkout, override = false): Provenance {
  let record: Provenance
  try { record = JSON.parse(fs.readFileSync(path.join(dist, PROVENANCE), 'utf8')) as Provenance }
  catch { throw new Error(`[${fork}] missing or invalid provenance; rebuild the editor` ) }
  if (!record.tools || ['rustc', 'cargo', 'wasm-bindgen'].some((tool) => !record.tools[tool]) || !Number.isFinite(Date.parse(record.builtAt))) {
    throw new Error(`[${fork}] incomplete provenance; rebuild the editor`)
  }
  const problem = record.fork !== fork || record.sha !== expected.sha || !/^[a-f0-9]{40}$/.test(record.sha)
    || record.dirty !== false || expected.dirty || record.version !== expected.version || record.branch !== expected.branch
  if (problem && !override) throw new Error(`[${fork}] provenance mismatch or dirty checkout; rebuild from clean expected HEAD, or use --allow-local-provenance for local experiments only`)
  if (JSON.stringify(record.artifacts) !== JSON.stringify(artifactHashes(dist))) throw new Error(`[${fork}] artifact checksums differ from provenance; rebuild`)
  return record
}
export function buildInfo(root: string, site: string, override = false) {
  const forks = Object.fromEntries(EDITORS.map((editor) => {
    const dir = path.join(root, editor.fork)
    return [editor.fork, verifyProvenance(path.join(dir, 'dist', 'web'), editor.fork, checkout(dir), override)]
  }))
  return { siteSha: gitSha(site), localProvenanceOverride: override, forks }
}
