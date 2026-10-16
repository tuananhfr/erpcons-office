import { editorPath, type EditorEntry } from '../../config/editors.ts'
import { PWA_THEME_COLOR } from '../pwa/web-manifest.ts'
import { editorSeoTags } from '../seo/editor-head.ts'
import { SEO_ASSETS, SEO_BRAND } from '../seo/page-seo.ts'

export const SHELL_MARKER = 'data-erpcons-shell'
export const LOADING_MARKER = 'data-erpcons-loading'

export interface ShellAssets {
  css: string
  script: string
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function countMatches(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0
}

const LOADING_TEXT = 'Đang khởi tạo...'

// The upstream note names the upstream app ("Loading WordCraft…"); the engine removes the element itself once started.
// loadingId is a plain CSS identifier (validateEditors), so it is safe inside the pattern.
function replaceLoadingNote(html: string, editor: EditorEntry): string {
  if (!editor.loadingId) return html
  const note = new RegExp(String.raw`(<div\b[^>]*\bid="${editor.loadingId}"[^>]*>)[\s\S]*?(</div>)`, 'i')
  if (!note.test(html)) throw new Error(`${editor.slug}: loading note #${editor.loadingId} not found`)
  return html.replace(note, (_m, open: string, close: string) => `${open}${LOADING_TEXT}${close}`)
}

// Other editors open in a new tab: navigating away would drop the unsaved document in this one.
function navLinks(current: EditorEntry, editors: readonly EditorEntry[]): string {
  return editors
    .map((e) => (e.slug === current.slug
      ? `<a href="${editorPath(e.slug)}" aria-current="page">${escapeHtml(e.name)}</a>`
      : `<a href="${editorPath(e.slug)}" target="_blank" rel="noopener" aria-label="${escapeHtml(e.name)} (tab mới)">${escapeHtml(e.name)}</a>`))
    .join('')
}

function headTags(editor: EditorEntry, assets: ShellAssets): string {
  // Upstream styles pin the canvas to the viewport; push it below the bar for both layouts (absolute and flow).
  const below = (id: string) =>
    `#${id}{position:absolute!important;top:var(--erp-shell-h)!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:calc(100% - var(--erp-shell-h))!important}`
  const placement = [editor.canvasId, editor.loadingId].filter((id): id is string => Boolean(id)).map(below).join('')
  return [
    ...editorSeoTags(editor),
    '<link rel="manifest" href="/manifest.webmanifest">',
    `<meta name="theme-color" content="${PWA_THEME_COLOR}">`,
    `<style ${SHELL_MARKER}>${assets.css}${placement}</style>`,
  ].join('\n')
}

function bodyTags(editor: EditorEntry, editors: readonly EditorEntry[], assets: ShellAssets): string {
  const links = navLinks(editor, editors)
  return [
    `<header class="erp-shell" ${SHELL_MARKER}>`,
    `<a class="erp-shell__brand" href="/" aria-label="${escapeHtml(SEO_BRAND)}, trang chủ"><img src="${SEO_ASSETS.logo64}" alt="" width="28" height="28"><span>Văn phòng <small>by <b>ERPCons</b></small></span></a>`,
    `<span class="erp-shell__current">${escapeHtml(editor.name)}</span>`,
    `<nav class="erp-shell__nav" aria-label="Chức năng">${links}</nav>`,
    `<details class="erp-shell__menu"><summary>Chức năng</summary><nav aria-label="Chức năng">${links}</nav></details>`,
    `</header>`,
    // Engines without a note of their own (PDF) get one; shell.js drops it on TrunkApplicationStarted.
    ...(editor.loadingId ? [] : [`<div class="erp-shell__loading" ${LOADING_MARKER}>${LOADING_TEXT}</div>`]),
    `<p class="erp-shell__unsupported" role="alert">Trình duyệt này không có WebGPU hoặc WebGL2 nên không chạy được trình soạn thảo. Hãy dùng Chrome, Edge, Firefox hoặc Safari phiên bản mới.</p>`,
    `<noscript><p class="erp-shell__noscript">Cần bật JavaScript để dùng trình soạn thảo.</p></noscript>`,
    `<script>${assets.script}</script>`,
  ].join('\n')
}

/** Adds the ERPCons bar, SEO tags and shell script to a trunk-built editor page. */
export function injectEditorShell(html: string, editor: EditorEntry, editors: readonly EditorEntry[], assets: ShellAssets): string {
  if (html.includes(SHELL_MARKER)) return html
  if (countMatches(html, /<\/head>/gi) !== 1) throw new Error(`${editor.slug}: expected exactly one </head>`)
  if (countMatches(html, /<body\b[^>]*>/gi) !== 1) throw new Error(`${editor.slug}: expected exactly one <body>`)
  if (!html.includes(`id="${editor.canvasId}"`)) throw new Error(`${editor.slug}: canvas #${editor.canvasId} not found`)

  return replaceLoadingNote(html, editor)
    .replace(/<html\b([^>]*)>/i, (_tag, attrs: string) => `<html${attrs.replace(/\s+lang=("[^"]*"|'[^']*'|\S+)/i, '')} lang="vi">`)
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<link\b[^>]*\brel=["']?(?:shortcut )?icon["']?[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `${headTags(editor, assets)}\n</head>`)
    .replace(/<body\b[^>]*>/i, (tag) => `${tag}\n${bodyTags(editor, editors, assets)}`)
}
