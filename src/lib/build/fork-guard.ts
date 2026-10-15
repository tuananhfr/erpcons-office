import fs from 'node:fs'
import path from 'node:path'

export const REQUIRED_FORK_BRANCH = 'tuananhfr'

// Only the tuananhfr branch has the ArtCraft marks removed (spec §2); main is upstream as-is.
export function forkBranchProblem(fork: string, branch: string): string | null {
  if (branch === REQUIRED_FORK_BRANCH) return null
  const current = branch === '' ? 'a detached HEAD' : `branch ${branch}`
  return `[${fork}] is on ${current}; build only from the ${REQUIRED_FORK_BRANCH} branch`
}

export interface BrandLeak {
  file: string
  term: string
  context: string
}

const FORBIDDEN = ['discord.gg/artcraft', 'getartcraft', 'artcraft-logo', 'artcraft-mark']
// The brand terms let a fork credit its source in plain words; these are the two credits we ship.
const ALLOWED = ['nhóm ArtCraft', 'ArtCraft Team and the']
const NAME = /artcraft/gi

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function contextAt(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 40), index + length + 40).replace(/[^\x20-\x7e -￿]/g, '.')
}

export function findBrandLeaks(file: string, content: string | Uint8Array): BrandLeak[] {
  const text = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content)
  const hits: { index: number; leak: BrandLeak }[] = []
  for (const term of FORBIDDEN) {
    for (const m of text.matchAll(new RegExp(escape(term), 'gi'))) {
      hits.push({ index: m.index, leak: { file, term, context: contextAt(text, m.index, m[0].length) } })
    }
  }
  const allowed: [number, number][] = []
  for (const phrase of ALLOWED) {
    for (const m of text.matchAll(new RegExp(escape(phrase), 'g'))) allowed.push([m.index, m.index + m[0].length])
  }
  for (const m of text.matchAll(NAME)) {
    const covered = allowed.some(([from, to]) => m.index >= from && m.index < to)
    const insideForbidden = hits.some((h) => m.index >= h.index && m.index < h.index + h.leak.term.length)
    if (!covered && !insideForbidden) hits.push({ index: m.index, leak: { file, term: m[0], context: contextAt(text, m.index, m[0].length) } })
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.leak)
}

export function scanDistForBrand(dir: string): BrandLeak[] {
  const leaks: BrandLeak[] = []
  const walk = (sub: string) => {
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub === '' ? entry.name : `${sub}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
        continue
      }
      leaks.push(...findBrandLeaks(rel, rel))
      leaks.push(...findBrandLeaks(rel, fs.readFileSync(path.join(dir, rel))))
    }
  }
  walk('')
  return leaks
}
