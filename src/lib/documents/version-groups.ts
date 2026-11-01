import type { Version } from './types.ts'

/** Saves this close together read as one entry in the history (plan-m4: the live leader saves every 30 s). */
export const VERSION_GROUP_WINDOW_MS = 10 * 60 * 1000

export interface VersionGroup {
  /** The newest version of the group: the entry shown. */
  head: Version
  /** The older versions folded under it, newest first; none is dropped. */
  rest: Version[]
}

/**
 * Folds consecutive versions (newest first, as listed) into groups that span at most `windowMs` from their newest to
 * their oldest save. The server marks no save as a live one (openapi `Version`), so every save is grouped alike; the
 * fixed span keeps a long session from collapsing into a single entry.
 */
export function groupVersions(versions: readonly Version[], windowMs = VERSION_GROUP_WINDOW_MS): VersionGroup[] {
  const groups: VersionGroup[] = []
  let headAt = Number.NaN
  for (const version of versions) {
    const at = Date.parse(version.createdAt)
    const group = groups[groups.length - 1]
    if (group && Number.isFinite(at) && Number.isFinite(headAt) && headAt - at >= 0 && headAt - at <= windowMs) {
      group.rest.push(version)
      continue
    }
    groups.push({ head: version, rest: [] })
    headAt = at
  }
  return groups
}
