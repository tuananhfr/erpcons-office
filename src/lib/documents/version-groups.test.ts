import { describe, expect, it } from 'vitest'
import type { Version } from './types.ts'
import { groupVersions } from './version-groups.ts'

const at = (version: number, time: string, authorName = 'Nguyễn Văn An'): Version => ({ version, size: 100, authorName, createdAt: `2026-11-02T${time}:00Z` })
const shape = (versions: Version[]) => groupVersions(versions).map(group => [group.head.version, group.rest.map(v => v.version)])

describe('groupVersions', () => {
  it('folds saves within 10 minutes of the group\'s newest one, whoever saved them, and keeps every version', () => {
    const versions = [at(9, '10:20'), at(8, '10:19', 'Trần Thị Bình'), at(7, '10:12'), at(6, '10:10'), at(5, '10:09'), at(4, '09:00')]
    expect(shape(versions)).toEqual([[9, [8, 7, 6]], [5, []], [4, []]])
    expect(groupVersions(versions).flatMap(g => [g.head, ...g.rest])).toEqual(versions)
  })

  it('a long session becomes one entry per 10 minutes, not one entry in all', () => {
    const versions = Array.from({ length: 41 }, (_, i) => at(41 - i, `10:${String(40 - i).padStart(2, '0')}`))
    expect(shape(versions).map(([head]) => head)).toEqual([41, 30, 19, 8])
  })

  it('a version with an unreadable date stands alone', () => {
    expect(shape([at(3, '10:02'), { ...at(2, '10:01'), createdAt: 'x' }, at(1, '10:00')])).toEqual([[3, []], [2, []], [1, []]])
  })

  it('no versions, no groups', () => {
    expect(groupVersions([])).toEqual([])
  })
})
