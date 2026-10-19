import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EDITORS } from '../src/config/editors.ts'
import {
  SBOM_DIR, WEB_TARGET, cargoCyclonedxArgs, componentCount, npmSbomPackageJson, sbomFileName, sbomIndex, workspaceMemberDirs,
  type SbomEntry,
} from '../src/lib/build/sbom.ts'
import { REPO_ROOT, workspaceRoot } from '../src/lib/build/workspace.ts'

const root = workspaceRoot()
const outDir = path.join(REPO_ROOT, SBOM_DIR)

function run(cmd: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...options })
  const command = [cmd, ...args].join(' ')
  if (result.error) throw new Error(`${command}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})\n${String(result.stderr)}`)
  return String(result.stdout)
}

function gitState(repo: string): { commit: string; branch: string; dirty: boolean } {
  return {
    commit: run('git', ['-C', repo, 'rev-parse', '--short', 'HEAD']).trim(),
    branch: run('git', ['-C', repo, 'branch', '--show-current']).trim(),
    dirty: run('git', ['-C', repo, 'status', '--porcelain']).trim() !== '',
  }
}

function save(name: string, repo: string, bomJson: string, covers: string): SbomEntry {
  const bom = JSON.parse(bomJson) as { bomFormat?: string; components?: [] }
  if (bom.bomFormat !== 'CycloneDX') throw new Error(`[${name}] the tool did not return a CycloneDX BOM`)
  const git = gitState(repo)
  const file = sbomFileName(name, git.commit)
  fs.writeFileSync(path.join(outDir, file), bomJson.endsWith('\n') ? bomJson : bomJson + '\n')
  const entry = { name, file, repo: path.basename(repo), ...git, covers, components: componentCount(bom) }
  console.log(`[${name}] ${file}: ${entry.components} components${git.dirty ? ' (uncommitted changes)' : ''}`)
  return entry
}

function cargoSbom(fork: string, webApp: string): SbomEntry {
  const forkDir = path.join(root, fork)
  const manifest = path.join(forkDir, webApp, 'Cargo.toml')
  const crate = path.basename(webApp)
  const stem = `erpcons-sbom-${process.pid}`
  const members = workspaceMemberDirs(JSON.parse(run('cargo', ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', manifest])))
  try {
    run('cargo', cargoCyclonedxArgs(manifest, stem))
    const bom = fs.readFileSync(path.join(forkDir, webApp, `${stem}.json`), 'utf8')
    return save(crate, forkDir, bom, `${crate} for ${WEB_TARGET}, default features: runtime deps (scope required) and build deps (scope excluded), no dev-dependencies`)
  } catch (e) {
    if (e instanceof Error && e.message.includes('no such command')) throw new Error(`${e.message}\ninstall it with: cargo install cargo-cyclonedx --locked`)
    throw e
  } finally {
    // cargo-cyclonedx writes one BOM beside every member's Cargo.toml; only the web app's is kept.
    for (const dir of members) fs.rmSync(path.join(dir, `${stem}.json`), { force: true })
  }
}

function npmSbom(): SbomEntry {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erpcons-sbom-'))
  // npm names the BOM's root component after the directory it runs in.
  const dir = path.join(tmp, 'erpcons-office')
  try {
    fs.mkdirSync(dir)
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as Record<string, unknown>
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(npmSbomPackageJson(pkg), null, 2))
    fs.copyFileSync(path.join(REPO_ROOT, 'package-lock.json'), path.join(dir, 'package-lock.json'))
    // One command string through the shell, so Windows finds npm.cmd (args plus shell is deprecated).
    const bom = run('npm sbom --sbom-format cyclonedx --omit dev --package-lock-only', [], { cwd: dir, shell: true })
    return save('erpcons-office', REPO_ROOT, bom, 'package-lock.json production dependencies (dev omitted), optional packages for every platform included')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

fs.mkdirSync(outDir, { recursive: true })
const entries = [...EDITORS.map((editor) => cargoSbom(editor.fork, editor.webApp)), npmSbom()]
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(sbomIndex(entries, new Date()), null, 2) + '\n')
console.log(`wrote ${entries.length} SBOMs and index.json to ${outDir}`)
