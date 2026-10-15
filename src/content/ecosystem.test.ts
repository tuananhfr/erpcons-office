import { describe, expect, it } from 'vitest'
import { ECOSYSTEM_TOOLS, filterTools } from './ecosystem.ts'

describe('ecosystem discovery', () => {
  it('searches Vietnamese names with or without accents and ignores case', () => {
    expect(filterTools(ECOSYSTEM_TOOLS, 'Tất cả', '  SUC KHOE  ').map(tool => tool.id)).toEqual(['suc-khoe-so', 'suc-khoe-dn'])
    expect(filterTools(ECOSYSTEM_TOOLS, 'Tất cả', 'gia dinh').map(tool => tool.id)).toEqual(['lich-gia-dinh'])
    expect(filterTools(ECOSYSTEM_TOOLS, 'Tất cả', 'danh gia').map(tool => tool.id)).toEqual(['suc-khoe-dn'])
  })
  it('applies category and query together', () => {
    expect(filterTools(ECOSYSTEM_TOOLS, 'Cuộc sống', 'sức khỏe')).toHaveLength(0)
    expect(filterTools(ECOSYSTEM_TOOLS, 'Miễn phí', '')).toEqual([ECOSYSTEM_TOOLS[0]])
  })
  it('returns no matches for unknown text so the recovery state is reachable', () => {
    expect(filterTools(ECOSYSTEM_TOOLS, 'Tất cả', 'xyz-unknown')).toHaveLength(0)
  })
})
