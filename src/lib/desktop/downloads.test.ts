import { describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { desktopDownloads, detectDesktopOS } from './downloads.ts'

describe('desktopDownloads', () => {
  it.each([
    ['van-ban', 'wordcraft', 'VanBan', 'vanban'],
    ['bang-tinh', 'gridcraft', 'BangTinh', 'bangtinh'],
    ['trinh-chieu', 'deckcraft', 'TrinhChieu', 'trinhchieu'],
    ['pdf', 'pdfcraft', 'PDF', 'pdf'],
  ])('builds every fixed asset URL for %s', (slug, fork, base, linux) => {
    const editor = EDITORS.find(entry => entry.slug === slug)
    if (!editor) throw new Error(`Missing editor ${slug}`)
    const { releaseUrl, assets } = desktopDownloads(editor)
    expect(releaseUrl).toBe(`https://github.com/tuananhfr/${fork}/releases/latest`)
    const files = [
      `ERPCons-${base}-windows-x64.msi`, `ERPCons-${base}-windows-x64-portable.zip`,
      `ERPCons-${base}-macos-universal.dmg`, `ERPCons-${base}-linux-x86_64.AppImage`,
      `erpcons-${linux}_amd64.deb`, `erpcons-${linux}.x86_64.rpm`,
    ]
    expect(assets.map(asset => asset.file)).toEqual(files)
    expect(assets.map(asset => asset.url)).toEqual(files.map(file => `${releaseUrl}/download/${file}`))
    expect(assets.filter(asset => asset.primary).map(asset => asset.os)).toEqual(['windows', 'macos', 'linux'])
  })
})

describe('detectDesktopOS', () => {
  it('uses client hints, then platform, then UA', () => {
    expect(detectDesktopOS({ userAgentData: { platform: 'Windows' }, platform: 'Linux' })).toBe('windows')
    expect(detectDesktopOS({ platform: 'MacIntel' })).toBe('macos')
    expect(detectDesktopOS({ userAgent: 'X11; Linux x86_64' })).toBe('linux')
  })
  it('does not recommend desktop downloads on phones, tablets or unknown systems', () => {
    for (const hints of [
      { userAgentData: { platform: 'Linux', mobile: true } },
      { platform: 'Linux', userAgent: 'Android' }, { userAgent: 'iPhone' },
      { platform: 'MacIntel', maxTouchPoints: 5 },
    ]) expect(detectDesktopOS(hints)).toBe('mobile')
    expect(detectDesktopOS({})).toBeNull()
    expect(detectDesktopOS({ platform: 'Linux', userAgent: 'CrOS' })).toBeNull()
  })
})
