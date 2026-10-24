import { describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { SHELL_MARKER, injectEditorShell } from './inject.ts'

const assets = { css: '.erp-shell{height:40px}', script: 'console.log("shell")' }
const word = EDITORS[0]
const pdf = EDITORS[3]

const trunkWord = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <title>WordCraft</title>
  <link rel="icon" href="./wordcraft-45f84b7721cb79a9.ico">
  <script type="module">import init from './wordcraft-web-a4ce.js'; init('./wordcraft-web-a4ce_bg.wasm');</script>
</head>
<body>
  <canvas id="wordcraft_canvas"></canvas>
  <div id="wordcraft_loading">Loading WordCraft&hellip;</div>
</body>
</html>`

describe('injectEditorShell', () => {
  it('sets Vietnamese language, title, canonical and drops upstream title/icon', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<html lang="vi">')
    expect(out).toContain('<title>Soạn thảo Word trực tuyến miễn phí | Văn phòng by ERPCons</title>')
    expect(out).toContain('<link rel="canonical" href="https://office.erpcons.ai/van-ban/">')
    expect(out).not.toContain('<title>WordCraft</title>')
    expect(out).not.toContain('wordcraft-45f84b7721cb79a9.ico')
    expect(out).toContain('<link rel="icon" href="/brand/van-phong-icon-32.png" type="image/png" sizes="32x32">')
  })

  it('puts the bar right after <body> and keeps the engine script untouched', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toMatch(/<body>\s*<header class="erp-shell" data-erpcons-shell>/)
    expect(out).toContain(`init('./wordcraft-web-a4ce_bg.wasm')`)
  })

  it('links every feature and marks the current one', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<a href="/van-ban/" aria-current="page">Văn bản</a>')
    expect(out).toContain('<a href="/bang-tinh/" target="_blank" rel="noopener" aria-label="Bảng tính (tab mới)">Bảng tính</a>')
    expect(out).toContain('<a href="/trinh-chieu/" target="_blank" rel="noopener" aria-label="Trình chiếu (tab mới)">Trình chiếu</a>')
    expect(out).toContain('<a href="/pdf/" target="_blank" rel="noopener" aria-label="PDF (tab mới)">PDF</a>')
  })

  it('replaces the upstream loading note, which names the upstream app, with a Vietnamese one', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<div id="wordcraft_loading">Đang khởi tạo...</div>')
    expect(out).not.toMatch(/Loading|WordCraft&hellip;/)
  })

  it('gives PDF, which ships no loading note, one the shell removes once the app starts', () => {
    const html = '<!doctype html>\n<html lang="en"><head><title>PdfCraft</title></head><body><canvas id="pdfcraft"></canvas></body></html>'
    const out = injectEditorShell(html, pdf, EDITORS, assets)
    expect(out).toContain('<div class="erp-shell__loading" data-erpcons-loading>Đang khởi tạo...</div>')
  })

  it('names the logo link for screen readers, since mobile hides its text', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<a class="erp-shell__brand" href="/" aria-label="Văn phòng by ERPCons, trang chủ">')
  })

  it('shows the same Văn phòng logo and wordmark as the landing header', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<img src="/brand/van-phong-logo-64.png" alt="" width="28" height="28">')
    expect(out).toContain('<span>Văn phòng <small>by <b>ERPCons</b></small></span>')
    expect(out).not.toContain('erpcons-mark.svg')
  })

  it('links the web manifest so the app can be installed from any editor', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(out).toContain('<meta name="theme-color" content="#ffffff">')
  })

  it('moves both canvas and loading element below the bar', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('#wordcraft_canvas{')
    expect(out).toContain('#wordcraft_loading{')
  })

  it('keeps the canvas inside the safe area and above the keyboard, with an explicit size', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    const rule = out.match(/#wordcraft_canvas\{[^}]*\}/)![0]
    expect(rule).toContain('top:var(--erp-top)!important')
    expect(rule).toContain('left:var(--erp-inset-left)!important')
    expect(rule).toContain('right:var(--erp-inset-right)!important')
    expect(rule).toContain('bottom:var(--erp-bottom)!important')
    expect(rule).toContain('width:calc(100% - var(--erp-inset-left) - var(--erp-inset-right))!important')
    expect(rule).toContain('height:calc(100% - var(--erp-top) - var(--erp-bottom))!important')
  })

  it('leaves touch gestures on the canvas to the editor, not on the loading screen', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('#wordcraft_canvas{touch-action:none}')
    expect(out.match(/touch-action:none/g)).toHaveLength(1)
  })

  it('lets content reach under the notch and the keyboard resize the layout, keeping the fork\'s zoom choice', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content">')
    expect(out.match(/name="viewport"/g)).toHaveLength(1)
  })

  it('leaves PDF pinch zoom as the fork has it', () => {
    const html = '<!doctype html>\n<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>PdfCraft</title></head><body><canvas id="pdfcraft"></canvas></body></html>'
    const out = injectEditorShell(html, pdf, EDITORS, assets)
    expect(out).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">')
    expect(out).not.toContain('user-scalable')
  })

  it('updates keys a fork already sets instead of repeating them', () => {
    const html = trunkWord.replace('user-scalable=no', 'viewport-fit=auto, user-scalable=no')
    const out = injectEditorShell(html, word, EDITORS, assets)
    expect(out).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content"')
  })

  it('adds a viewport meta when a fork drops it, and refuses two', () => {
    const missing = trunkWord.replace(/<meta name="viewport"[^>]*>/, '')
    expect(injectEditorShell(missing, word, EDITORS, assets)).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">')
    const twice = trunkWord.replace('<title>', '<meta name="viewport" content="width=device-width"><title>')
    expect(() => injectEditorShell(twice, word, EDITORS, assets)).toThrow('expected at most one viewport meta')
  })

  it('names the canvas for screen readers after the editor', () => {
    expect(injectEditorShell(trunkWord, word, EDITORS, assets)).toContain('<canvas role="application" aria-label="Trình soạn thảo Văn bản" id="wordcraft_canvas"></canvas>')
    const html = '<!doctype html>\n<html lang="en"><head><title>PdfCraft</title></head><body><canvas id="pdfcraft"></canvas></body></html>'
    expect(injectEditorShell(html, pdf, EDITORS, assets)).toContain('<canvas role="application" aria-label="Trình soạn thảo PDF" id="pdfcraft">')
  })

  it('handles the PdfCraft page: flow canvas, no loading element, no title icon', () => {
    const html = '<!doctype html>\n<html lang="en"><head><title>PdfCraft</title></head><body><canvas id="pdfcraft"></canvas></body></html>'
    const out = injectEditorShell(html, pdf, EDITORS, assets)
    expect(out).toContain('#pdfcraft{')
    expect(out).not.toContain('_loading{')
  })

  it('accepts body attributes, CRLF and a missing title', () => {
    const html = '<html>\r\n<head>\r\n</head>\r\n<body class="x" data-a="1">\r\n<canvas id="wordcraft_canvas"></canvas>\r\n<div id="wordcraft_loading">Loading</div>\r\n</body>\r\n</html>'
    const out = injectEditorShell(html, word, EDITORS, assets)
    expect(out).toMatch(/<body class="x" data-a="1">\s*<header class="erp-shell"/)
    expect(out.match(/<title>/g)).toHaveLength(1)
  })

  it('removes every upstream icon link', () => {
    const html = trunkWord.replace('</head>', '<link rel="shortcut icon" href="a.ico"><link href="b.png" rel="icon"></head>')
    const out = injectEditorShell(html, word, EDITORS, assets)
    expect(out).not.toContain('a.ico')
    expect(out).not.toContain('b.png')
  })

  it('is idempotent', () => {
    const once = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(injectEditorShell(once, word, EDITORS, assets)).toBe(once)
    expect(once.split(SHELL_MARKER).length - 1).toBe(2)
  })

  it('inlines the shell css and script', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('.erp-shell{height:40px}')
    expect(out).toContain('console.log("shell")')
  })

  it('adds the PI account slot to the bar only when sign-in is enabled, hidden until account-ui.js shows it', () => {
    expect(injectEditorShell(trunkWord, word, EDITORS, assets)).not.toContain('data-erp-account')
    const out = injectEditorShell(trunkWord, word, EDITORS, { ...assets, account: true })
    const bar = out.slice(out.indexOf('<header class="erp-shell"'), out.indexOf('</header>'))
    expect(bar).toContain('<div class="erp-shell__account" data-erp-account hidden>')
    expect(bar).toContain('<span class="erp-shell__sign-in-text">Đăng nhập</span>')
    expect(bar).toContain('data-erp-account-sign-out>Đăng xuất</button>')
    expect(bar).toContain('aria-controls="erp-account-panel"')
    expect(bar).toContain('id="erp-account-panel" data-erp-account-panel hidden')
    expect(bar.indexOf('data-erp-account')).toBeGreaterThan(bar.indexOf('erp-shell__menu'))
  })

  it('fails when an injection point is missing', () => {
    expect(() => injectEditorShell(trunkWord.replace('</head>', ''), word, EDITORS, assets)).toThrow('expected exactly one </head>')
    expect(() => injectEditorShell(trunkWord.replace('<body>', ''), word, EDITORS, assets)).toThrow('expected exactly one <body>')
    expect(() => injectEditorShell(trunkWord.replace('wordcraft_canvas', 'other'), word, EDITORS, assets)).toThrow('canvas #wordcraft_canvas not found')
    expect(() => injectEditorShell(trunkWord.replace(/<div id="wordcraft_loading">.*<\/div>/, ''), word, EDITORS, assets)).toThrow('loading note #wordcraft_loading not found')
  })
})
