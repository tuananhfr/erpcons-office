import type { EditorEntry } from '../../config/editors.ts'

export type DesktopOS = 'windows' | 'macos' | 'linux'
export interface PlatformHints {
  userAgentData?: { platform?: string; mobile?: boolean }
  platform?: string
  userAgent?: string
  maxTouchPoints?: number
}

export function detectDesktopOS(hints: PlatformHints): DesktopOS | 'mobile' | null {
  const ua = hints.userAgent ?? ''
  if (hints.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (/Mac/i.test(hints.platform ?? '') && (hints.maxTouchPoints ?? 0) > 1)) return 'mobile'
  const platform = hints.userAgentData?.platform || hints.platform || ua
  if (/Win/i.test(platform)) return 'windows'
  if (/Mac/i.test(platform)) return 'macos'
  if (/Linux/i.test(platform) && !/CrOS/i.test(ua)) return 'linux'
  return null
}

export function desktopDownloads(editor: EditorEntry) {
  const releaseUrl = `https://github.com/tuananhfr/${editor.fork}/releases/latest`
  const base = `ERPCons-${editor.desktop}`
  const linux = `erpcons-${editor.desktop.toLowerCase()}`
  const assets = [
    { os: 'windows', primary: true, label: 'Windows · Bộ cài (.msi, x64)', file: `${base}-windows-x64.msi` },
    { os: 'windows', primary: false, label: 'Windows · Bản chạy ngay không cần cài (.zip, x64)', file: `${base}-windows-x64-portable.zip` },
    { os: 'macos', primary: true, label: 'macOS · .dmg (Apple Silicon và Intel)', file: `${base}-macos-universal.dmg` },
    { os: 'linux', primary: true, label: 'Linux · AppImage (x86_64)', file: `${base}-linux-x86_64.AppImage` },
    { os: 'linux', primary: false, label: 'Linux · .deb (amd64)', file: `${linux}_amd64.deb` },
    { os: 'linux', primary: false, label: 'Linux · .rpm (x86_64)', file: `${linux}.x86_64.rpm` },
  ] as const
  return { releaseUrl, assets: assets.map(asset => ({ ...asset, url: `${releaseUrl}/download/${asset.file}` })) }
}

export function suiteDownloads() {
  const releaseUrl = 'https://github.com/tuananhfr/erpcons-office/releases/latest'
  const assets = [
    { os: 'windows', primary: true, label: 'Windows · Cài trọn bộ (.exe, x64)', file: 'ERPCons-VanPhong-windows-x64-setup.exe' },
    { os: 'windows', primary: false, label: 'Windows · Bản chạy ngay (.zip, x64)', file: 'ERPCons-VanPhong-windows-x64-portable.zip' },
    { os: 'macos', primary: true, label: 'macOS · .dmg (Apple Silicon và Intel)', file: 'ERPCons-VanPhong-macos-universal.dmg' },
    { os: 'linux', primary: true, label: 'Linux · Bộ AppImage (x86_64)', file: 'ERPCons-VanPhong-linux-x86_64-AppImage.tar.gz' },
    { os: 'linux', primary: false, label: 'Linux · Bộ .deb (amd64)', file: 'erpcons-vanphong_amd64-deb.tar.gz' },
    { os: 'linux', primary: false, label: 'Linux · Bộ .rpm (x86_64)', file: 'erpcons-vanphong.x86_64-rpm.tar.gz' },
  ] as const
  return { releaseUrl, assets: assets.map(asset => ({ ...asset, url: `${releaseUrl}/download/${asset.file}` })) }
}
