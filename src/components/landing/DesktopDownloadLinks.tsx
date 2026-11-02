'use client'

import { useSyncExternalStore } from 'react'
import type { EditorEntry } from '@/config/editors.ts'
import { desktopDownloads, detectDesktopOS, suiteDownloads } from '@/lib/desktop/downloads.ts'

const subscribe = () => () => {}
const clientOS = () => detectDesktopOS(navigator)
const serverOS = () => null

function DownloadIcon() {
  return <svg className="erp-download-glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" /></svg>
}

export function DesktopDownloadLinks({ editor }: { editor?: EditorEntry }) {
  const os = useSyncExternalStore(subscribe, clientOS, serverOS)
  const { assets, releaseUrl } = editor ? desktopDownloads(editor) : suiteDownloads()
  const name = editor?.name ?? 'ERPCons Office'
  return <div className={`erp-download-options${editor ? ' erp-download-options--tool' : ' erp-download-options--suite'}`}>
    {os === 'mobile' && editor ? <p className="erp-download-options__mobile">Trên điện thoại, <a href={`/${editor.slug}/`}>mở {editor.name} trên web</a>.</p> : null}
    <ul className="erp-downloads__links">{assets.map(asset => <li key={asset.file}>
      <a href={asset.url} className={!editor && asset.primary
        ? (os === asset.os ? 'erp-btn erp-btn--primary' : 'erp-btn erp-btn--secondary')
        : 'erp-download-option'}
        title={asset.label}
        aria-label={`Tải ${name} · ${asset.label}`}>
        {asset.primary && !editor && <DownloadIcon />}
        {editor ? (asset.primary ? 'Bộ cài' : 'ZIP') : (asset.primary ? 'Tải trọn bộ Windows' : 'Bản ZIP')}
        {editor && <span className="erp-sr-only"> · {asset.label}</span>}
      </a>
    </li>)}</ul>
    {editor
      ? <a className="erp-download-release" href={releaseUrl} aria-label={`Ghi chú phát hành · ${name}`}><span aria-hidden="true">↗</span><span className="erp-sr-only">Ghi chú phát hành · {name}</span></a>
      : <div className="erp-download-options__footer"><p>Bản ZIP chạy ngay, không cần cài đặt.</p><a className="erp-download-release" href={releaseUrl} aria-label={`Ghi chú phát hành · ${name}`}>Ghi chú phát hành <span aria-hidden="true">↗</span></a></div>}
  </div>
}
