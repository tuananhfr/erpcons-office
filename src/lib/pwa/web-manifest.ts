import type { MetadataRoute } from 'next'
import { EDITORS, SITE, editorPath } from '../../config/editors.ts'
import { SEO_ASSETS, SEO_BRAND } from '../seo/page-seo.ts'

export const PWA_THEME_COLOR = '#ffffff'

const MIME_TYPES: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf',
}

function mimeTypeOf(extension: string): string {
  const type = MIME_TYPES[extension]
  if (!type) throw new Error(`no MIME type for ${extension}`)
  return type
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
      accept: { [mimeTypeOf(e.extension)]: [e.extension] },
      icons: [{ src: `/brand/office/${e.slug}-256.png`, sizes: '256x256', type: 'image/png' }],
    })),
    // Android "Share" to the installed app; editor-shell/sw.js receives the POST and opens the right editor.
    share_target: {
      action: '/share-target/',
      method: 'post',
      enctype: 'multipart/form-data',
      params: { files: [{ name: 'file', accept: EDITORS.flatMap((e) => [mimeTypeOf(e.extension), e.extension]) }] },
    },
    shortcuts: EDITORS.map((e) => ({ name: e.name, url: editorPath(e.slug), icons: [{ src: SEO_ASSETS.icon192, sizes: '192x192' }] })),
  }
}
