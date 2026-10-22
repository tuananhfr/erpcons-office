import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { EDITORS } from '../src/config/editors.ts'
import { craftFontsDir, requiredCraftFontsRef } from '../src/lib/build/craft-fonts.ts'
import { downloadMegabytes } from '../src/lib/build/editor-sizes.ts'
import { forkBranchProblem, scanDistForBrand } from '../src/lib/build/fork-guard.ts'
import { REPO_ROOT, forkDist, workspaceRoot } from '../src/lib/build/workspace.ts'

import { checkout, verifyProvenance, writeProvenance } from '../src/lib/build/provenance.ts'

const localOverride = process.argv.includes('--allow-local-provenance') || process.env.ERPCONS_ALLOW_LOCAL_PROVENANCE === '1'
const skipRust = process.argv.includes('--skip-rust')
const allowMissing = process.argv.includes('--allow-missing')
const root = workspaceRoot()
const sizes: Record<string, number | null> = {}

function fontsEnv(fork: string): Record<string, string> {
  const workflow = path.join(root, fork, '.github', 'workflows', 'release.yml')
  const ref = requiredCraftFontsRef(fork, fs.existsSync(workflow) ? fs.readFileSync(workflow, 'utf8') : null)
  const dir = craftFontsDir(root, ref)
  if (!fs.existsSync(path.join(dir, 'fonts', 'manifest.txt'))) {
    const clone = path.join(root, 'craft-fonts')
    if (!fs.existsSync(path.join(clone, '.git'))) throw new Error(`[${fork}] needs craft-fonts ${ref} but ${clone} is not cloned`)
    const add = spawnSync('git', ['-C', clone, 'worktree', 'add', '--detach', dir, ref], { stdio: 'inherit' })
    if (add.status !== 0) throw new Error(`[${fork}] git worktree add craft-fonts ${ref} failed (exit ${add.status})`)
  }
  console.log(`[${fork}] craft-fonts ${ref.slice(0, 7)} at ${dir}`)
  // REQUIRED turns build.rs's silent "building without craft-fonts" fallback into an error.
  return { CRAFT_FONTS_DIR: dir, CRAFT_FONTS_REQUIRED: '1' }
}

function currentBranch(fork: string): string {
  const run = spawnSync('git', ['-C', path.join(root, fork), 'branch', '--show-current'], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`[${fork}] git branch --show-current failed (exit ${run.status})`)
  return run.stdout.trim()
}

for (const editor of EDITORS) {
  const dir = path.join(root, editor.fork)
  const state = skipRust && allowMissing ? null : checkout(dir)
  if (!skipRust) {
    const problem = forkBranchProblem(editor.fork, currentBranch(editor.fork))
    if (problem) throw new Error(problem)
    console.log(`[${editor.slug}] trunk build --release in ${editor.fork}/${editor.webApp}`)
    // shell: true lets Windows resolve trunk.exe from PATH the same way a terminal does.
    const run = spawnSync('trunk', ['build', '--release'], { cwd: path.join(root, editor.fork, editor.webApp), stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...fontsEnv(editor.fork) } })
    if (run.status !== 0) throw new Error(`[${editor.slug}] trunk build failed (exit ${run.status})`)
  }
  const dist = forkDist(editor, root)
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    if (allowMissing) {
      console.warn(`[${editor.slug}] no build at ${dist}; size left empty`)
      sizes[editor.slug] = null
      continue
    }
    throw new Error(`[${editor.slug}] missing build: ${dist}/index.html`)
  }
  if (!skipRust && state) writeProvenance(editor.fork, dir, dist, state)
  if (!allowMissing && state) verifyProvenance(dist, editor.fork, state, localOverride)
  const files = fs.readdirSync(dist).filter((name) => fs.statSync(path.join(dist, name)).isFile())
    .map((name) => ({ name, gzipBytes: gzipSync(fs.readFileSync(path.join(dist, name)), { level: 9 }).length }))
  const leaks = scanDistForBrand(dist)
  for (const leak of leaks) console.error(`[${editor.slug}] brand leak "${leak.term}" in ${leak.file}: …${leak.context}…`)
  // `dev` runs on whatever is built; a published build must carry no ArtCraft marks.
  if (leaks.length > 0 && !allowMissing) throw new Error(`[${editor.slug}] ${leaks.length} ArtCraft brand leak(s) in ${dist}`)
  sizes[editor.slug] = downloadMegabytes(files)
  console.log(`[${editor.slug}] first download ≈ ${sizes[editor.slug]} MB`)
}

const out = path.join(REPO_ROOT, 'src', 'generated', 'editor-sizes.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(sizes, null, 2) + '\n')
