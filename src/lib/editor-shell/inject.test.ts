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
    expect(out).toContain('<title>Văn bản – soạn và sửa tệp Word (.docx) trực tuyến | ERPCons Văn phòng</title>')
    expect(out).toContain('<link rel="canonical" href="https://office.erpcons.vn/van-ban/">')
    expect(out).not.toContain('<title>WordCraft</title>')
    expect(out).not.toContain('wordcraft-45f84b7721cb79a9.ico')
    expect(out).toContain('<link rel="icon" href="/brand/erpcons-mark.svg" type="image/svg+xml">')
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
    expect(out).toContain('<a class="erp-shell__brand" href="/" aria-label="ERPCons Văn phòng">')
  })

  it('moves both canvas and loading element below the bar', () => {
    const out = injectEditorShell(trunkWord, word, EDITORS, assets)
    expect(out).toContain('#wordcraft_canvas{')
    expect(out).toContain('#wordcraft_loading{')
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

  it('fails when an injection point is missing', () => {
    expect(() => injectEditorShell(trunkWord.replace('</head>', ''), word, EDITORS, assets)).toThrow('expected exactly one </head>')
    expect(() => injectEditorShell(trunkWord.replace('<body>', ''), word, EDITORS, assets)).toThrow('expected exactly one <body>')
    expect(() => injectEditorShell(trunkWord.replace('wordcraft_canvas', 'other'), word, EDITORS, assets)).toThrow('canvas #wordcraft_canvas not found')
    expect(() => injectEditorShell(trunkWord.replace(/<div id="wordcraft_loading">.*<\/div>/, ''), word, EDITORS, assets)).toThrow('loading note #wordcraft_loading not found')
  })
})
