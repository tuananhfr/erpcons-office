import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { craftFontsDir, craftFontsRef, requiredCraftFontsRef } from './craft-fonts.ts'

describe('craftFontsRef', () => {
  it('reads the pinned craft-fonts commit from a release workflow', () => {
    const yml = 'jobs:\n  release:\n    with:\n      app-name: deckcraft\n      craft-fonts-ref: 43913056ce82a3fdad0ef69f6b88d1dc922a8104\n'
    expect(craftFontsRef(yml)).toBe('43913056ce82a3fdad0ef69f6b88d1dc922a8104')
  })

  it('returns null when the workflow pins no commit', () => {
    expect(craftFontsRef('jobs:\n  build:\n    runs-on: ubuntu-latest\n')).toBeNull()
  })

  it('accepts a quoted ref', () => {
    expect(craftFontsRef(`      craft-fonts-ref: "43913056ce82a3fdad0ef69f6b88d1dc922a8104"\n`)).toBe('43913056ce82a3fdad0ef69f6b88d1dc922a8104')
    expect(craftFontsRef(`      craft-fonts-ref: '43913056ce82a3fdad0ef69f6b88d1dc922a8104'\n`)).toBe('43913056ce82a3fdad0ef69f6b88d1dc922a8104')
  })

  it('ignores a ref that is not a full commit sha', () => {
    expect(craftFontsRef('      craft-fonts-ref: main\n')).toBeNull()
  })
})

describe('craftFontsDir', () => {
  it('places one absolute checkout per commit outside the craft-fonts clone', () => {
    const dir = craftFontsDir('/ws', '43913056ce82a3fdad0ef69f6b88d1dc922a8104')
    expect(dir).toBe(path.resolve('/ws', 'craft-fonts-refs', '43913056ce82a3fdad0ef69f6b88d1dc922a8104'))
    expect(path.isAbsolute(dir)).toBe(true)
  })
})

describe('requiredCraftFontsRef', () => {
  it('fails loudly instead of building without fonts', () => {
    expect(() => requiredCraftFontsRef('deckcraft', null)).toThrow(/deckcraft.*release\.yml/)
    expect(() => requiredCraftFontsRef('deckcraft', 'jobs: {}\n')).toThrow(/deckcraft.*craft-fonts-ref/)
    expect(requiredCraftFontsRef('deckcraft', '      craft-fonts-ref: 43913056ce82a3fdad0ef69f6b88d1dc922a8104\n')).toBe('43913056ce82a3fdad0ef69f6b88d1dc922a8104')
  })
})
