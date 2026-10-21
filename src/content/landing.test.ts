import { describe, expect, it } from 'vitest'
import { EDITORS } from '../config/editors.ts'
import sizes from '../generated/editor-sizes.json'
import { FAQ, FORK_REPOS, NOTICES, firstLoadAnswer, formatSize } from './landing.ts'

describe('landing content', () => {
  it('does not describe the default editor interface as English in notices or FAQ', () => {
    expect([...NOTICES, ...FAQ.map((f) => f.answer)].join(' ')).not.toMatch(/giao diện[^.!?]*tiếng Anh/i)
    expect(NOTICES).toHaveLength(3)
  })

  it('has the FAQ questions the spec asks for', () => {
    expect(FAQ.map((f) => f.question)).toEqual([
      'Tệp của tôi có bị tải lên máy chủ không?',
      'Lưu tệp như thế nào?',
      'Vì sao lần mở đầu tiên chậm?',
      'Có dùng được trên điện thoại không?',
      'Có bản cài trên máy tính không?',
      'Có mất phí không?',
    ])
  })

  it('links one fork repo per editor', () => {
    expect(FORK_REPOS.map((r) => r.url)).toEqual(EDITORS.map((e) => `https://github.com/tuananhfr/${e.fork}`))
  })

  it('formats sizes in Vietnamese decimal style and hides unknown ones', () => {
    expect(formatSize(14.8)).toBe('khoảng 14,8 MB')
    expect(formatSize(null)).toBeNull()
    expect(formatSize(undefined)).toBeNull()
  })

  it('derives the first-load size range from the build instead of hand-written numbers', () => {
    expect(firstLoadAnswer({ a: 18.1, b: 7.1, c: 12.8 })).toContain('(khoảng 7 đến 18 MB tùy chức năng)')
    expect(firstLoadAnswer({ a: 9.6, b: 9.6 })).toContain('(khoảng 10 MB)')
    expect(firstLoadAnswer({ a: null, b: 7.4 })).toContain('(khoảng 7 MB)')
    expect(firstLoadAnswer({ a: null })).not.toMatch(/MB/)
    expect(FAQ[2].answer).toBe(firstLoadAnswer(sizes))
  })
})
