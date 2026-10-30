import type { EditorEntry } from '../../config/editors.ts'

// Only Windows installers are built and released; other systems get no installer and no OS guess.
export type DesktopOS = 'windows'
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
  return null
}

export function desktopDownloads(editor: EditorEntry) {
  const releaseUrl = `https://github.com/tuananhfr/${editor.fork}/releases/latest`
  const base = `ERPCons-${editor.desktop}`
  const assets = [
    { os: 'windows', primary: true, label: 'Windows · Bộ cài (.msi, x64)', file: `${base}-windows-x64.msi` },
    { os: 'windows', primary: false, label: 'Windows · Bản chạy ngay không cần cài (.zip, x64)', file: `${base}-windows-x64-portable.zip` },
  ] as const
  return { releaseUrl, assets: assets.map(asset => ({ ...asset, url: `${releaseUrl}/download/${asset.file}` })) }
}

export function suiteDownloads() {
  const releaseUrl = 'https://github.com/tuananhfr/erpcons-office/releases/latest'
  const assets = [
    { os: 'windows', primary: true, label: 'Windows · Cài trọn bộ (.exe, x64)', file: 'ERPCons-VanPhong-windows-x64-setup.exe' },
    { os: 'windows', primary: false, label: 'Windows · Bản chạy ngay (.zip, x64)', file: 'ERPCons-VanPhong-windows-x64-portable.zip' },
  ] as const
  return { releaseUrl, assets: assets.map(asset => ({ ...asset, url: `${releaseUrl}/download/${asset.file}` })) }
}
