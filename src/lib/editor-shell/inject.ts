import { editorPath, type EditorEntry } from '../../config/editors.ts'
import { PWA_THEME_COLOR } from '../pwa/web-manifest.ts'
import { editorSeoTags } from '../seo/editor-head.ts'
import { SEO_ASSETS, SEO_BRAND } from '../seo/page-seo.ts'

export const SHELL_MARKER = 'data-erpcons-shell'
export const LOADING_MARKER = 'data-erpcons-loading'

export interface ShellAssets {
  css: string
  script: string
  /** PI sign-in is enabled (`src/config/pi.ts`): the bar gets the account slot account-ui.js fills in. */
  account?: boolean
  /** Online documents are on: the editor pages may hold a public link token (in the fragment). */
  online?: boolean
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function countMatches(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0
}

const LOADING_TEXT = 'Đang khởi tạo...'

function loadingStatus(firstDownloadMb: number | null | undefined): string {
  if (firstDownloadMb === null || firstDownloadMb === undefined) return LOADING_TEXT
  const size = firstDownloadMb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  return `${LOADING_TEXT} Lần đầu tải khoảng ${size} MB, những lần sau nhanh hơn.`
}

// The canvas carries no text, so this screen is all a crawler reads of the page: each editor's own copy keeps the
// four pages from being thin duplicates of each other. Users read it while the first download runs.
function loadingContent(editor: EditorEntry, firstDownloadMb: number | null | undefined): string {
  const formats = editor.accepts.map((ext) => ext.toUpperCase()).join(', ')
  return [
    '<div class="erp-loading">',
    `<h1 class="erp-loading__title">${escapeHtml(editor.seoTitle)}</h1>`,
    `<p class="erp-loading__intro">${escapeHtml(editor.intro)}</p>`,
    `<ul class="erp-loading__features">${editor.features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`,
    `<p class="erp-loading__formats">Mở được: ${escapeHtml(formats)}</p>`,
    `<p class="erp-loading__status" role="status">${escapeHtml(loadingStatus(firstDownloadMb))}</p>`,
    '</div>',
  ].join('')
}

// The upstream note names the upstream app ("Loading WordCraft…"); the engine removes the element itself once started.
// loadingId is a plain CSS identifier (validateEditors), so it is safe inside the pattern.
function replaceLoadingNote(html: string, editor: EditorEntry, content: string): string {
  if (!editor.loadingId) return html
  const note = new RegExp(String.raw`(<div\b[^>]*\bid="${editor.loadingId}"[^>]*>)[\s\S]*?(</div>)`, 'i')
  if (!note.test(html)) throw new Error(`${editor.slug}: loading note #${editor.loadingId} not found`)
  return html.replace(note, (_m, open: string, close: string) => `${open}${content}${close}`)
}

const VIEWPORT_META = /<meta\b(?=[^>]*\bname=["']?viewport["'\s/>])[^>]*>/gi
const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1'
// Notched phones report safe-area insets only with viewport-fit=cover; resizes-content makes Chrome Android
// shrink the layout for the soft keyboard. Each fork's own keys (user-scalable…) are kept.
const VIEWPORT_KEYS: Readonly<Record<string, string>> = { 'viewport-fit': 'cover', 'interactive-widget': 'resizes-content' }

function viewportContent(content: string): string {
  const entries = new Map<string, string>()
  for (const part of content.split(/[,;]/)) {
    const [key, ...value] = part.split('=')
    if (key.trim()) entries.set(key.trim().toLowerCase(), value.join('=').trim())
  }
  for (const [key, value] of Object.entries(VIEWPORT_KEYS)) entries.set(key, value)
  return [...entries].map(([key, value]) => (value ? `${key}=${value}` : key)).join(', ')
}

function rewriteViewport(html: string, editor: EditorEntry): string {
  const [meta, ...extra] = html.match(VIEWPORT_META) ?? []
  if (extra.length) throw new Error(`${editor.slug}: expected at most one viewport meta`)
  const tag = (content: string) => `<meta name="viewport" content="${escapeHtml(viewportContent(content))}">`
  if (!meta) return html.replace(/<\/head>/i, () => `${tag(DEFAULT_VIEWPORT)}\n</head>`)
  const content = /\bcontent=(?:"([^"]*)"|'([^']*)')/i.exec(meta)
  return html.replace(meta, () => tag(content?.[1] ?? content?.[2] ?? DEFAULT_VIEWPORT))
}

// eframe drops AccessKit on the web, so the canvas is at least named for screen readers.
function labelCanvas(html: string, editor: EditorEntry): string {
  const canvas = new RegExp(String.raw`<canvas\b(?=[^>]*\bid="${editor.canvasId}")`, 'i')
  return html.replace(canvas, () => `<canvas role="application" aria-label="${escapeHtml(`Trình soạn thảo ${editor.name}`)}"`)
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
  // Upstream styles pin the canvas to the viewport; keep it below the bar, inside the safe area and above the
  // keyboard (shell.css vars) for both layouts (absolute and flow). A canvas is a replaced element: without an
  // explicit size, left/right/bottom would leave it at its bitmap size.
  const below = (id: string) =>
    `#${id}{position:absolute!important;top:var(--erp-top)!important;left:var(--erp-inset-left)!important;right:var(--erp-inset-right)!important;bottom:var(--erp-bottom)!important;`
    + `width:calc(100% - var(--erp-inset-left) - var(--erp-inset-right))!important;height:calc(100% - var(--erp-top) - var(--erp-bottom))!important}`
  const placement = [editor.canvasId, editor.loadingId].filter((id): id is string => Boolean(id)).map(below).join('')
  // The editors pan and pinch themselves; without this the browser may still claim the gesture (scroll, zoom)
  // and Chrome warns about eframe's non-passive document touch listeners.
  const gestures = `#${editor.canvasId}{touch-action:none}`
  return [
    // Defence in depth for the public link page: no Referer at all leaves these pages.
    ...(assets.online ? ['<meta name="referrer" content="no-referrer">'] : []),
    ...editorSeoTags(editor),
    '<link rel="manifest" href="/manifest.webmanifest">',
    `<meta name="theme-color" content="${PWA_THEME_COLOR}">`,
    `<style ${SHELL_MARKER}>${assets.css}${placement}${gestures}</style>`,
  ].join('\n')
}

// Bootstrap Icons "person" (MIT), inline so the bar needs no icon font.
const PERSON_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0m4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4m-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10s-3.516.68-4.168 1.332c-.678.678-.83 1.418-.832 1.664z"/></svg>'

// Starts hidden: account-ui.js reveals it unless the page is embedded or account.js is disabled.
const ACCOUNT_SLOT = [
  '<div class="erp-shell__account" data-erp-account hidden>',
  `<button type="button" class="erp-shell__sign-in" data-erp-account-sign-in>${PERSON_ICON}<span class="erp-shell__sign-in-text">Đăng nhập</span></button>`,
  '<div class="erp-shell__user" data-erp-account-user hidden>',
  '<button type="button" class="erp-shell__avatar" data-erp-account-toggle aria-expanded="false" aria-controls="erp-account-panel" aria-label="Tài khoản"><span data-erp-account-initials aria-hidden="true"></span></button>',
  '<div class="erp-shell__account-panel" id="erp-account-panel" data-erp-account-panel hidden>',
  '<p class="erp-shell__account-name" data-erp-account-name></p>',
  '<p class="erp-shell__account-email" data-erp-account-email></p>',
  '<div class="erp-shell__account-orgs" data-erp-account-orgs role="group" aria-label="Tổ chức" hidden></div>',
  '<button type="button" class="erp-shell__account-action erp-shell__account-sign-out" data-erp-account-sign-out>Đăng xuất</button>',
  '</div>',
  '</div>',
  '<p class="erp-shell__account-note" data-erp-account-note role="status" aria-live="polite"></p>',
  '</div>',
].join('')

function bodyTags(editor: EditorEntry, editors: readonly EditorEntry[], assets: ShellAssets, loading: string): string {
  const links = navLinks(editor, editors)
  return [
    `<header class="erp-shell" ${SHELL_MARKER}>`,
    `<a class="erp-shell__brand" href="/" aria-label="${escapeHtml(SEO_BRAND)}, trang chủ"><img src="${SEO_ASSETS.logo64}" alt="" width="28" height="28"><span>Văn phòng <small>by <b>ERPCons</b></small></span></a>`,
    `<span class="erp-shell__current">${escapeHtml(editor.name)}</span>`,
    `<nav class="erp-shell__nav" aria-label="Chức năng">${links}</nav>`,
    `<details class="erp-shell__menu"><summary>Chức năng</summary><nav aria-label="Chức năng">${links}</nav></details>`,
    ...(assets.account ? [ACCOUNT_SLOT] : []),
    `</header>`,
    // Engines without a note of their own (PDF) get one; shell.js drops it on TrunkApplicationStarted.
    ...(editor.loadingId ? [] : [`<div class="erp-shell__loading" ${LOADING_MARKER}>${loading}</div>`]),
    `<p class="erp-shell__unsupported" role="alert">Trình duyệt này không có WebGPU hoặc WebGL2 nên không chạy được trình soạn thảo. Hãy dùng Chrome, Edge, Firefox hoặc Safari phiên bản mới.</p>`,
    `<noscript><p class="erp-shell__noscript">Cần bật JavaScript để dùng trình soạn thảo.</p></noscript>`,
    `<script>${assets.script}</script>`,
  ].join('\n')
}

/** Adds the ERPCons bar, SEO tags and shell script to a trunk-built editor page. */
export function injectEditorShell(
  html: string, editor: EditorEntry, editors: readonly EditorEntry[], assets: ShellAssets, firstDownloadMb?: number | null,
): string {
  if (html.includes(SHELL_MARKER)) return html
  if (countMatches(html, /<\/head>/gi) !== 1) throw new Error(`${editor.slug}: expected exactly one </head>`)
  if (countMatches(html, /<body\b[^>]*>/gi) !== 1) throw new Error(`${editor.slug}: expected exactly one <body>`)
  if (!html.includes(`id="${editor.canvasId}"`)) throw new Error(`${editor.slug}: canvas #${editor.canvasId} not found`)

  const loading = loadingContent(editor, firstDownloadMb)
  return labelCanvas(rewriteViewport(replaceLoadingNote(html, editor, loading), editor), editor)
    .replace(/<html\b([^>]*)>/i, (_tag, attrs: string) => `<html${attrs.replace(/\s+lang=("[^"]*"|'[^']*'|\S+)/i, '')} lang="vi">`)
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<link\b[^>]*\brel=["']?(?:shortcut )?icon["']?[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `${headTags(editor, assets)}\n</head>`)
    .replace(/<body\b[^>]*>/i, (tag) => `${tag}\n${bodyTags(editor, editors, assets, loading)}`)
}
