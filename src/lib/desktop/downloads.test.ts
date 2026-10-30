import { describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { desktopDownloads, detectDesktopOS, suiteDownloads } from './downloads.ts'

const NON_WINDOWS = /macos|\.dmg|linux|AppImage|\.deb|\.rpm/i

describe('desktopDownloads', () => {
  it.each([
    ['van-ban', 'wordcraft', 'VanBan'],
    ['bang-tinh', 'gridcraft', 'BangTinh'],
    ['trinh-chieu', 'deckcraft', 'TrinhChieu'],
    ['pdf', 'pdfcraft', 'PDF'],
  ])('offers only the Windows installers for %s', (slug, fork, base) => {
    const editor = EDITORS.find(entry => entry.slug === slug)
    if (!editor) throw new Error(`Missing editor ${slug}`)
    const { releaseUrl, assets } = desktopDownloads(editor)
    expect(releaseUrl).toBe(`https://github.com/tuananhfr/${fork}/releases/latest`)
    const files = [`ERPCons-${base}-windows-x64.msi`, `ERPCons-${base}-windows-x64-portable.zip`]
    expect(assets.map(asset => asset.file)).toEqual(files)
    expect(assets.map(asset => asset.url)).toEqual(files.map(file => `${releaseUrl}/download/${file}`))
    expect(assets.every(asset => asset.os === 'windows')).toBe(true)
    expect(assets.filter(asset => asset.primary).map(asset => asset.file)).toEqual([files[0]])
    for (const asset of assets) expect(`${asset.file} ${asset.label}`).not.toMatch(NON_WINDOWS)
  })
})

describe('detectDesktopOS', () => {
  it('recognises Windows from client hints, then platform, then UA', () => {
    expect(detectDesktopOS({ userAgentData: { platform: 'Windows' }, platform: 'Linux' })).toBe('windows')
    expect(detectDesktopOS({ platform: 'Win32' })).toBe('windows')
    expect(detectDesktopOS({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('windows')
  })
  it('guesses no installer for macOS or Linux, which have none', () => {
    expect(detectDesktopOS({ platform: 'MacIntel' })).toBeNull()
    expect(detectDesktopOS({ userAgentData: { platform: 'macOS' } })).toBeNull()
    expect(detectDesktopOS({ userAgent: 'X11; Linux x86_64' })).toBeNull()
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

describe('suiteDownloads', () => {
  it('offers only the Windows setup and portable suite, setup as the primary', () => {
    const { releaseUrl, assets } = suiteDownloads()
    expect(releaseUrl).toBe('https://github.com/tuananhfr/erpcons-office/releases/latest')
    const files = ['ERPCons-VanPhong-windows-x64-setup.exe', 'ERPCons-VanPhong-windows-x64-portable.zip']
    expect(assets.map(asset => asset.file)).toEqual(files)
    expect(assets.map(asset => asset.url)).toEqual(files.map(file => `${releaseUrl}/download/${file}`))
    expect(assets.filter(asset => asset.primary).map(asset => asset.file)).toEqual([files[0]])
    for (const asset of assets) expect(`${asset.file} ${asset.label}`).not.toMatch(NON_WINDOWS)
  })
})
