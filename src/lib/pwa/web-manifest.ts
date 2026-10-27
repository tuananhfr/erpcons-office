import type { MetadataRoute } from 'next'
import { EDITORS, SITE, editorPath, type EditorEntry } from '../../config/editors.ts'
import { MIME_BY_EXTENSION } from '../files/mime-types.ts'
import { SEO_ASSETS, SEO_BRAND } from '../seo/page-seo.ts'

export const PWA_THEME_COLOR = '#ffffff'

// Android matches share targets by MIME type, Windows "Open with" by extension; both come from editors.ts `accepts`.
function mimeTypesOf(extension: string): readonly string[] {
  const types = MIME_BY_EXTENSION[extension]
  if (!types?.length) throw new Error(`no MIME type for .${extension}`)
  return types
}

export function fileHandlerAccept(editor: EditorEntry): Record<string, string[]> {
  const accept: Record<string, string[]> = {}
  for (const ext of editor.accepts) {
    for (const mime of mimeTypesOf(ext)) (accept[mime] ??= []).push(`.${ext}`)
  }
  return accept
}

export function shareTargetAccept(): string[] {
  const accept = new Set<string>()
  for (const editor of EDITORS) {
    for (const ext of editor.accepts) {
      for (const mime of mimeTypesOf(ext)) accept.add(mime)
      accept.add(`.${ext}`)
    }
  }
  return [...accept]
}

export function webManifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SEO_BRAND,
    short_name: 'Văn phòng',
    description: SITE.description,
    lang: 'vi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: PWA_THEME_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [
      { src: SEO_ASSETS.icon192, sizes: '192x192', type: 'image/png' },
      { src: SEO_ASSETS.icon512, sizes: '512x512', type: 'image/png' },
      { src: SEO_ASSETS.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // "Open with" in Windows/macOS for the installed app; the editor page reads the files from launchQueue.
    file_handlers: EDITORS.map((e) => ({
      action: editorPath(e.slug),
      accept: fileHandlerAccept(e),
      icons: [{ src: `/brand/office/${e.slug}-256.png`, sizes: '256x256', type: 'image/png' }],
    })),
    // Android "Share" to the installed app; editor-shell/sw.js receives the POST and opens the right editor.
    // title/text/url let it answer a link-only share (Zalo, browsers) with guidance; the app then also shows up when
    // sharing any link, a trade-off the owner accepted (docs/file-transfer.md).
    share_target: {
      action: '/share-target/',
      method: 'post',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'file', accept: shareTargetAccept() }] },
    },
    // A share or "Open with" while an editor is open must not navigate that window away from its document.
    launch_handler: { client_mode: 'navigate-new' },
    shortcuts: EDITORS.map((e) => ({ name: e.name, url: editorPath(e.slug), icons: [{ src: SEO_ASSETS.icon192, sizes: '192x192' }] })),
  }
}
