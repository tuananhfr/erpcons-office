'use client'

import { useSyncExternalStore } from 'react'
import type { EditorEntry } from '@/config/editors.ts'
import { desktopDownloads, detectDesktopOS, suiteDownloads } from '@/lib/desktop/downloads.ts'

const subscribe = () => () => {}
const clientOS = () => detectDesktopOS(navigator)
const serverOS = () => null

export function DesktopDownloadLinks({ editor }: { editor?: EditorEntry }) {
  const os = useSyncExternalStore(subscribe, clientOS, serverOS)
  const { assets, releaseUrl } = editor ? desktopDownloads(editor) : suiteDownloads()
  const name = editor?.name ?? 'ERPCons Văn phòng'
  return <>
    {os === 'mobile' && editor ? <p>Bản cài dành cho máy tính. Trên điện thoại, <a href={`/${editor.slug}/`}>mở {editor.name} trên web</a>.</p> : null}
    <ul className="erp-downloads__links">{assets.map(asset => <li key={asset.file}>
      <a href={asset.url} className={!editor && os === asset.os && asset.primary ? 'erp-btn erp-btn--primary' : undefined}
        aria-label={`Tải ${name} · ${asset.label}`}>
        {asset.label}
      </a>
    </li>)}</ul>
    <a href={releaseUrl}>Ghi chú phát hành<span className="erp-sr-only"> · {name}</span></a>
  </>
}
