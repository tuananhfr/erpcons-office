# ERPCons Văn phòng — Plan A: site erpcons-office

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng repo `erpcons-office`: landing Next.js xuất tĩnh + script lắp ráp 4 editor Craft (chạy thẳng, có thanh ERPCons) + service worker + server preview giống Apache, chạy hoàn chỉnh ở local.

**Architecture:** `build-editors.mts` build 4 fork bằng trunk và đo dung lượng → `next build` (output export) sinh landing vào `out/` → `assemble.mts` chép bản build từng fork vào `out/<slug>/`, chèn thanh + meta + script vào `index.html`, sinh `sw.js`, nén sẵn `.gz/.br`. `preview.mts` phục vụ `out/` với header như Apache. Logic thuần (chèn HTML, kiểm cấu hình, chọn nén, đường dẫn, luật SW) nằm trong module riêng có test Vitest.

**Tech Stack:** Next.js 16.3.8 (App Router, `output: 'export'`), React 19.2.8, TypeScript ~6.0.2, Vitest ^5.0.2, ESLint 9 + eslint-config-next 16.3.8, bootstrap-icons 1.13.1, Node 24 (chạy `.mts` trực tiếp, type stripping), trunk + Rust ≥ 1.90 cho fork.

**Spec:** `docs/superpowers/specs/2026-10-14-erpcons-office-site-design.md`

**Phạm vi plan này:** chỉ repo `erpcons-office`. Gỡ nhận diện ArtCraft trong 4 fork là **Plan B** (riêng). Plan A kiểm chứng trên bản build `main` chưa sửa của fork — chỉ chạy local, không phát hành.

## Global Constraints

- Repo: `G:\workspace\erpcons-workspace\erpcons-office`; fork ở thư mục anh em `..\{wordcraft,gridcraft,deckcraft,pdfcraft}` (ghi đè bằng env `ERPCONS_WORKSPACE`).
- URL: `/`, `/van-ban/`, `/bang-tinh/`, `/trinh-chieu/`, `/pdf/`; `trailingSlash: true`.
- Origin chính thức: `https://office.erpcons.vn`. Tên hiển thị: `ERPCons Văn phòng`. Không dùng "ERPCons Workspace" ở bất cứ đâu.
- Chữ hiển thị tiếng Việt, `lang="vi"`. Không đa ngôn ngữ.
- Màu chỉ qua biến `--erp-*` (token Light Crimson Ice v1.1); không hex trong component. Crimson `#DA3548` chỉ cho logo + CTA chính.
- Font landing: Inter (subset `latin` + `vietnamese`) qua `next/font/google`.
- Không backend, không gọi origin khác lúc chạy (kể cả font — `next/font` tự host).
- Script Node (`scripts/*.mts`) và module mà script dùng chỉ import tương đối **có đuôi `.ts`**, không alias `@/`.
- Comment code tiếng Anh, chỉ giải thích "why".
- **Chỉ commit khi user yêu cầu rõ.** Không thêm dòng ghi công AI vào commit. Các bước "Commit" bên dưới chỉ chạy khi đã được phép.

## Review Focus

1. `index.html` của trunk khác mẫu: `<body>` có thuộc tính, xuống dòng CRLF, nhiều `<link rel="icon">`, không có `<title>` → chèn vẫn đúng, không nhân đôi (test ở Task 3).
2. URL `/van-ban` thiếu `/`, có query, có `%2e%2e` → preview chuyển hướng 301 / phục vụ đúng / chặn 403, không lọt ra ngoài `out/` (test ở Task 7).
3. `Accept-Encoding` có `br;q=0`, thiếu header, `*` → chọn đúng biến thể nén hoặc trả bản gốc (test ở Task 7).
4. Service worker gặp POST, request khác origin, chính `sw.js`, phản hồi 206 → không cache sai (test ở Task 5).
5. Thiếu bản build một fork → `assemble` dừng trước khi xoá/ghi `out/<slug>/`, không để lại thư mục dở (test ở Task 6).

---

### Task 0: Cài toolchain (một lần trên máy dev)

Không có code; kết quả là các lệnh chạy được.

- [ ] **Step 1: Cài Rust qua rustup**

Run (PowerShell): `winget install --id Rustlang.Rustup -e`
Mở terminal mới. Run: `rustc --version`
Expected: `rustc 1.90.0` trở lên (nếu thấp hơn: `rustup update stable`).

- [ ] **Step 2: Cài Visual Studio C++ Build Tools** (linker MSVC cho test native của fork)

Run: `winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`

- [ ] **Step 3: Target wasm + trunk**

Run: `rustup target add wasm32-unknown-unknown`
Run: `cargo install trunk --locked`
Run: `trunk --version`
Expected: in ra phiên bản trunk.

- [ ] **Step 4: Build thử một fork**

Run (trong `..\wordcraft\apps\wordcraft-web`): `trunk build --release`
Expected: tạo `..\wordcraft\dist\web\index.html` và một `*_bg.wasm`. Lần đầu lâu (biên dịch toàn bộ crate); trunk tự tải `wasm-bindgen`/`wasm-opt` nên cần mạng.

---

### Task 1: Khung repo

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`, `next-env.d.ts` (Next tự sinh)
- Create: `app/layout.tsx`, `app/page.tsx` (tạm, sẽ thay ở Task 8–9)

**Interfaces:**
- Produces: lệnh `npm run dev|build|build:site|preview|test|lint|typecheck` (một số trỏ tới script tạo ở task sau).

- [ ] **Step 1: `git init` và `package.json`**

Run (trong `erpcons-office`): `git init -b main`

```json
{
  "name": "erpcons-office",
  "private": true,
  "type": "module",
  "scripts": {
    "predev": "node scripts/build-editors.mts --skip-rust --allow-missing",
    "dev": "next dev -p 3010",
    "build": "node scripts/build-editors.mts && next build && node scripts/assemble.mts",
    "build:site": "node scripts/build-editors.mts --skip-rust && next build && node scripts/assemble.mts",
    "preview": "node scripts/preview.mts",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "bootstrap-icons": "1.13.1",
    "next": "16.3.8",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "eslint": "^9.39.0",
    "eslint-config-next": "16.3.8",
    "typescript": "~6.0.2",
    "vitest": "^5.0.2"
  }
}
```

Run: `npm install`
Expected: cài xong, không lỗi peer. Nếu `@types/react-dom` hoặc `eslint` báo không có phiên bản khớp: dùng phiên bản mới nhất cùng major mà npm gợi ý, ghi lại vào package.json.

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mts", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 3: `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
}

export default config
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'editor-shell/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: `eslint.config.mjs`**

```js
import nextVitals from 'eslint-config-next/core-web-vitals'

export default [
  { ignores: ['out/**', '.next/**', 'src/generated/**'] },
  ...nextVitals,
]
```

- [ ] **Step 6: `.gitignore`**

```
node_modules/
.next/
out/
src/generated/
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 7: Trang tạm**

`app/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
```

`app/page.tsx`:

```tsx
export default function HomePage() {
  return <main>ERPCons Văn phòng</main>
}
```

- [ ] **Step 8: Kiểm**

Run: `npx next build`
Expected: thành công, có `out/index.html`.
Run: `npm run typecheck` → PASS. Run: `npm run lint` → không lỗi. Run: `npx vitest run --passWithNoTests` → PASS.

- [ ] **Step 9: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "chore: scaffold erpcons-office Next.js static site"
```

---

### Task 2: Sổ đăng ký editor

**Files:**
- Create: `src/config/editors.ts`
- Test: `src/config/editors.test.ts`

**Interfaces:**
- Produces:
  - `type EditorSlug = 'van-ban' | 'bang-tinh' | 'trinh-chieu' | 'pdf'`
  - `interface EditorEntry { slug: EditorSlug; name: string; extension: string; fork: string; webApp: string; canvasId: string; loadingId?: string; upstreamName: string; icon: string; summary: string; seoTitle: string; seoDescription: string }`
  - `const SITE: { name: string; origin: string; description: string }`
  - `const EDITORS: readonly EditorEntry[]`
  - `function editorPath(slug: EditorSlug): string` → `"/van-ban/"`
  - `function validateEditors(list: readonly EditorEntry[]): string[]` → danh sách lỗi, rỗng = hợp lệ

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { EDITORS, editorPath, validateEditors, type EditorEntry } from './editors.ts'

describe('EDITORS', () => {
  it('is valid', () => {
    expect(validateEditors(EDITORS)).toEqual([])
  })

  it('lists the four features in landing order', () => {
    expect(EDITORS.map((e) => e.slug)).toEqual(['van-ban', 'bang-tinh', 'trinh-chieu', 'pdf'])
  })

  it('matches the canvas ids shipped by the forks', () => {
    expect(EDITORS.map((e) => [e.fork, e.canvasId, e.loadingId ?? null])).toEqual([
      ['wordcraft', 'wordcraft_canvas', 'wordcraft_loading'],
      ['gridcraft', 'gridcraft_canvas', 'gridcraft_loading'],
      ['deckcraft', 'deckcraft_canvas', 'deckcraft_loading'],
      ['pdfcraft', 'pdfcraft', null],
    ])
  })
})

describe('editorPath', () => {
  it('always ends with a slash', () => {
    expect(editorPath('van-ban')).toBe('/van-ban/')
  })
})

describe('validateEditors', () => {
  const base = EDITORS[0]

  it('reports duplicate slugs and canvas ids', () => {
    const dup: EditorEntry[] = [base, { ...base }]
    expect(validateEditors(dup)).toEqual([
      'duplicate slug: van-ban',
      'duplicate canvasId: wordcraft_canvas',
    ])
  })

  it('reports ids that are not safe CSS identifiers', () => {
    expect(validateEditors([{ ...base, canvasId: 'bad id' }])).toEqual(['unsafe canvasId: bad id'])
  })

  it('reports an extension without a leading dot', () => {
    expect(validateEditors([{ ...base, extension: 'docx' }])).toEqual(['extension must start with a dot: docx'])
  })
})
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/config/editors.test.ts`
Expected: FAIL — không tìm thấy module `./editors.ts`.

- [ ] **Step 3: Cài đặt**

```ts
export type EditorSlug = 'van-ban' | 'bang-tinh' | 'trinh-chieu' | 'pdf'

export interface EditorEntry {
  slug: EditorSlug
  name: string
  extension: string
  fork: string
  webApp: string
  canvasId: string
  loadingId?: string
  upstreamName: string
  icon: string
  summary: string
  seoTitle: string
  seoDescription: string
}

export const SITE = {
  name: 'ERPCons Văn phòng',
  origin: 'https://office.erpcons.vn',
  description: 'Soạn văn bản, bảng tính, trình chiếu và PDF ngay trên trình duyệt — miễn phí, không cần cài đặt, tệp không rời máy.',
} as const

export const EDITORS: readonly EditorEntry[] = [
  {
    slug: 'van-ban', name: 'Văn bản', extension: '.docx', fork: 'wordcraft', webApp: 'apps/wordcraft-web',
    canvasId: 'wordcraft_canvas', loadingId: 'wordcraft_loading', upstreamName: 'WordCraft', icon: 'file-earmark-word',
    summary: 'Mở, chỉnh sửa và lưu tệp Word (.docx).',
    seoTitle: 'Văn bản – soạn và sửa tệp Word (.docx) trực tuyến',
    seoDescription: 'Mở, chỉnh sửa và lưu tệp .docx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'bang-tinh', name: 'Bảng tính', extension: '.xlsx', fork: 'gridcraft', webApp: 'apps/gridcraft-web',
    canvasId: 'gridcraft_canvas', loadingId: 'gridcraft_loading', upstreamName: 'GridCraft', icon: 'file-earmark-spreadsheet',
    summary: 'Mở, chỉnh sửa và lưu bảng tính Excel (.xlsx).',
    seoTitle: 'Bảng tính – mở và sửa tệp Excel (.xlsx) trực tuyến',
    seoDescription: 'Mở, chỉnh sửa và lưu bảng tính .xlsx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'trinh-chieu', name: 'Trình chiếu', extension: '.pptx', fork: 'deckcraft', webApp: 'apps/deckcraft-web',
    canvasId: 'deckcraft_canvas', loadingId: 'deckcraft_loading', upstreamName: 'DeckCraft', icon: 'file-earmark-slides',
    summary: 'Mở, chỉnh sửa và lưu bài trình chiếu PowerPoint (.pptx).',
    seoTitle: 'Trình chiếu – mở và sửa tệp PowerPoint (.pptx) trực tuyến',
    seoDescription: 'Mở, chỉnh sửa và lưu bài trình chiếu .pptx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'pdf', name: 'PDF', extension: '.pdf', fork: 'pdfcraft', webApp: 'apps/pdfcraft-web',
    canvasId: 'pdfcraft', upstreamName: 'PdfCraft', icon: 'file-earmark-pdf',
    summary: 'Xem, ghi chú, sắp xếp trang, điền biểu mẫu và ký tệp PDF.',
    seoTitle: 'PDF – xem, sắp xếp trang và điền biểu mẫu PDF trực tuyến',
    seoDescription: 'Xem, ghi chú, gộp, tách, sắp xếp trang và điền biểu mẫu PDF ngay trên trình duyệt. Miễn phí, tệp không tải lên máy chủ.',
  },
]

export function editorPath(slug: EditorSlug): string {
  return `/${slug}/`
}

const CSS_IDENT = /^[A-Za-z][\w-]*$/

export function validateEditors(list: readonly EditorEntry[]): string[] {
  const problems: string[] = []
  const seen = { slug: new Set<string>(), canvasId: new Set<string>() }
  for (const editor of list) {
    for (const key of ['slug', 'canvasId'] as const) {
      if (seen[key].has(editor[key])) problems.push(`duplicate ${key}: ${editor[key]}`)
      seen[key].add(editor[key])
    }
    for (const id of [editor.canvasId, editor.loadingId]) {
      if (id !== undefined && !CSS_IDENT.test(id)) problems.push(`unsafe canvasId: ${id}`)
    }
    if (!editor.extension.startsWith('.')) problems.push(`extension must start with a dot: ${editor.extension}`)
  }
  return problems
}
```

- [ ] **Step 4: Chạy, xác nhận qua**

Run: `npx vitest run src/config/editors.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit** (chỉ khi được phép)

```bash
git add src/config
git commit -m "feat: add editor registry"
```

---

### Task 3: Chèn thanh ERPCons vào trang editor

**Files:**
- Create: `src/lib/editor-shell/inject.ts`
- Create: `editor-shell/shell.css`, `editor-shell/shell.js`
- Test: `src/lib/editor-shell/inject.test.ts`

**Interfaces:**
- Consumes: `EditorEntry`, `EDITORS`, `SITE`, `editorPath` (Task 2).
- Produces:
  - `const SHELL_MARKER = 'data-erpcons-shell'`
  - `interface ShellAssets { css: string; script: string }`
  - `function injectEditorShell(html: string, editor: EditorEntry, editors: readonly EditorEntry[], assets: ShellAssets): string` — ném `Error` khi thiếu điểm chèn.

**Ghi chú lệch spec (đã cân nhắc):** khi thiếu WebGPU/WebGL2, script chỉ **che canvas và hiện câu báo**; module wasm do trunk chèn vẫn được trình duyệt nạp (không chặn được module script đã nằm trong HTML mà không sửa fork). Người dùng vẫn chỉ thấy câu báo.

- [ ] **Step 1: Viết test thất bại**

```ts
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
    expect(out).toContain('<a href="/bang-tinh/">Bảng tính</a>')
    expect(out).toContain('<a href="/trinh-chieu/">Trình chiếu</a>')
    expect(out).toContain('<a href="/pdf/">PDF</a>')
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
    const html = '<html>\r\n<head>\r\n</head>\r\n<body class="x" data-a="1">\r\n<canvas id="wordcraft_canvas"></canvas>\r\n</body>\r\n</html>'
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
  })
})
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/lib/editor-shell/inject.test.ts`
Expected: FAIL — không tìm thấy `./inject.ts`.

- [ ] **Step 3: Cài đặt `inject.ts`**

```ts
import { SITE, editorPath, type EditorEntry } from '../../config/editors.ts'

export const SHELL_MARKER = 'data-erpcons-shell'

export interface ShellAssets {
  css: string
  script: string
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function countMatches(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0
}

function navLinks(current: EditorEntry, editors: readonly EditorEntry[]): string {
  return editors
    .map((e) => (e.slug === current.slug
      ? `<a href="${editorPath(e.slug)}" aria-current="page">${escapeHtml(e.name)}</a>`
      : `<a href="${editorPath(e.slug)}">${escapeHtml(e.name)}</a>`))
    .join('')
}

function headTags(editor: EditorEntry, assets: ShellAssets): string {
  const url = SITE.origin + editorPath(editor.slug)
  const title = `${editor.seoTitle} | ${SITE.name}`
  // Upstream styles pin the canvas to the viewport; push it below the bar for both layouts (absolute and flow).
  const below = (id: string) =>
    `#${id}{position:absolute!important;top:var(--erp-shell-h)!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:calc(100% - var(--erp-shell-h))!important}`
  const placement = [editor.canvasId, editor.loadingId].filter((id): id is string => Boolean(id)).map(below).join('')
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(editor.seoDescription)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE.name)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(editor.seoDescription)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE.origin}/brand/og-image.png">`,
    `<link rel="icon" href="/brand/erpcons-mark.svg" type="image/svg+xml">`,
    `<style ${SHELL_MARKER}>${assets.css}${placement}</style>`,
  ].join('\n')
}

function bodyTags(editor: EditorEntry, editors: readonly EditorEntry[], assets: ShellAssets): string {
  const links = navLinks(editor, editors)
  return [
    `<header class="erp-shell" ${SHELL_MARKER}>`,
    `<a class="erp-shell__brand" href="/"><img src="/brand/erpcons-mark.svg" alt="" width="24" height="24"><span>${escapeHtml(SITE.name)}</span></a>`,
    `<span class="erp-shell__current">${escapeHtml(editor.name)}</span>`,
    `<nav class="erp-shell__nav" aria-label="Chức năng">${links}</nav>`,
    `<details class="erp-shell__menu"><summary>Chức năng</summary><nav aria-label="Chức năng">${links}</nav></details>`,
    `</header>`,
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

  return html
    .replace(/<html\b([^>]*)>/i, (_tag, attrs: string) => `<html${attrs.replace(/\s+lang=("[^"]*"|'[^']*'|\S+)/i, '')} lang="vi">`)
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<link\b[^>]*\brel=["']?(?:shortcut )?icon["']?[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `${headTags(editor, assets)}\n</head>`)
    .replace(/<body\b[^>]*>/i, (tag) => `${tag}\n${bodyTags(editor, editors, assets)}`)
}
```

- [ ] **Step 4: Tạo `editor-shell/shell.css`**

```css
:root {
  --erp-shell-h: 40px;
  --erp-crimson: #da3548;
  --erp-ink: #101820;
  --erp-text-2: #344454;
  --erp-surface: #ffffff;
  --erp-surface-2: #e7eef2;
  --erp-border: #d6e0e6;
  --erp-focus: #3678d4;
}
.erp-shell {
  position: fixed; inset: 0 0 auto 0; z-index: 10; height: var(--erp-shell-h); box-sizing: border-box;
  display: flex; align-items: center; gap: 16px; padding: 0 12px;
  background: var(--erp-surface); border-bottom: 1px solid var(--erp-border); color: var(--erp-ink);
  font: 500 14px/1 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.erp-shell a { color: inherit; text-decoration: none; border-radius: 4px; }
.erp-shell a:focus-visible, .erp-shell summary:focus-visible { outline: 2px solid var(--erp-focus); outline-offset: 2px; }
.erp-shell__brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; white-space: nowrap; }
.erp-shell__current { display: none; color: var(--erp-text-2); }
.erp-shell__nav { display: flex; gap: 4px; margin-left: auto; }
.erp-shell__nav a { padding: 8px 12px; color: var(--erp-text-2); }
.erp-shell__nav a:hover { background: var(--erp-surface-2); }
.erp-shell__nav a[aria-current="page"] { color: var(--erp-ink); box-shadow: inset 0 -2px 0 var(--erp-crimson); }
.erp-shell__menu { display: none; margin-left: auto; position: relative; }
.erp-shell__menu summary { cursor: pointer; padding: 8px 12px; list-style: none; border: 1px solid var(--erp-border); border-radius: 4px; }
.erp-shell__menu nav { position: absolute; right: 0; top: calc(100% + 4px); display: grid; min-width: 180px; padding: 4px;
  background: var(--erp-surface); border: 1px solid var(--erp-border); border-radius: 8px; }
.erp-shell__menu nav a { padding: 12px; }
.erp-shell__menu nav a[aria-current="page"] { font-weight: 700; box-shadow: inset 2px 0 0 var(--erp-crimson); }
.erp-shell__unsupported, .erp-shell__noscript {
  position: fixed; inset: var(--erp-shell-h) 0 0 0; z-index: 9; margin: 0; padding: 32px 16px;
  background: var(--erp-surface); color: var(--erp-ink); font: 400 16px/1.6 Inter, system-ui, sans-serif; text-align: center;
}
.erp-shell__unsupported { display: none; }
.erp-shell-unsupported .erp-shell__unsupported { display: block; }
@media (max-width: 767px) {
  .erp-shell__brand span { display: none; }
  .erp-shell__current { display: inline; }
  .erp-shell__nav { display: none; }
  .erp-shell__menu { display: block; }
}
```

- [ ] **Step 5: Tạo `editor-shell/shell.js`**

```js
(function () {
  var supported = false
  try { supported = Boolean(navigator.gpu) } catch (e) { supported = false }
  if (!supported) {
    try {
      var gl = document.createElement('canvas').getContext('webgl2')
      supported = Boolean(gl)
      var lose = gl && gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    } catch (e) { supported = false }
  }
  if (!supported) document.documentElement.classList.add('erp-shell-unsupported')
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}) })
  }
})()
```

- [ ] **Step 6: Chạy, xác nhận qua**

Run: `npx vitest run src/lib/editor-shell/inject.test.ts`
Expected: PASS (10 test).

- [ ] **Step 7: Commit** (chỉ khi được phép)

```bash
git add src/lib/editor-shell editor-shell/shell.css editor-shell/shell.js
git commit -m "feat: inject ERPCons bar and SEO tags into editor pages"
```

---

### Task 4: Build fork và đo dung lượng tải

**Files:**
- Create: `src/lib/build/editor-sizes.ts`
- Create: `scripts/build-editors.mts`
- Create: `src/lib/build/workspace.ts`
- Test: `src/lib/build/editor-sizes.test.ts`

**Interfaces:**
- Consumes: `EDITORS`, `EditorEntry` (Task 2).
- Produces:
  - `function workspaceRoot(): string` — `ERPCONS_WORKSPACE` hoặc thư mục cha của repo.
  - `function forkDist(editor: EditorEntry, root: string): string` → `<root>/<fork>/dist/web`
  - `function downloadMegabytes(files: { name: string; gzipBytes: number }[]): number` — tổng `.wasm` + `.js`, MB làm tròn 1 chữ số.
  - Tệp sinh ra `src/generated/editor-sizes.json`: `Record<EditorSlug, number | null>`.

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { downloadMegabytes } from './editor-sizes.ts'

describe('downloadMegabytes', () => {
  it('sums only wasm and js, in decimal megabytes with one decimal', () => {
    expect(downloadMegabytes([
      { name: 'wordcraft-web-a4ce_bg.wasm', gzipBytes: 14_750_202 },
      { name: 'wordcraft-web-a4ce.js', gzipBytes: 40_000 },
      { name: 'wordcraft.ico', gzipBytes: 9_000_000 },
      { name: 'index.html', gzipBytes: 1_000 },
    ])).toBe(14.8)
  })

  it('returns 0 for an empty build', () => {
    expect(downloadMegabytes([])).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/lib/build/editor-sizes.test.ts`
Expected: FAIL — không tìm thấy `./editor-sizes.ts`.

- [ ] **Step 3: Cài đặt**

`src/lib/build/editor-sizes.ts`:

```ts
const COUNTED = /\.(wasm|js)$/i

/** What a first visit downloads (gzip), shown on the landing. */
export function downloadMegabytes(files: { name: string; gzipBytes: number }[]): number {
  const bytes = files.filter((f) => COUNTED.test(f.name)).reduce((sum, f) => sum + f.gzipBytes, 0)
  return Math.round(bytes / 100_000) / 10
}
```

`src/lib/build/workspace.ts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EditorEntry } from '../../config/editors.ts'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export function workspaceRoot(): string {
  return process.env.ERPCONS_WORKSPACE ? path.resolve(process.env.ERPCONS_WORKSPACE) : path.resolve(REPO_ROOT, '..')
}

export function forkDist(editor: EditorEntry, root: string): string {
  return path.join(root, editor.fork, 'dist', 'web')
}
```

`scripts/build-editors.mts`:

```ts
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { EDITORS } from '../src/config/editors.ts'
import { downloadMegabytes } from '../src/lib/build/editor-sizes.ts'
import { REPO_ROOT, forkDist, workspaceRoot } from '../src/lib/build/workspace.ts'

const skipRust = process.argv.includes('--skip-rust')
const allowMissing = process.argv.includes('--allow-missing')
const root = workspaceRoot()
const sizes: Record<string, number | null> = {}

for (const editor of EDITORS) {
  if (!skipRust) {
    console.log(`[${editor.slug}] trunk build --release in ${editor.fork}/${editor.webApp}`)
    // shell: true lets Windows resolve trunk.exe from PATH the same way a terminal does.
    const run = spawnSync('trunk', ['build', '--release'], { cwd: path.join(root, editor.fork, editor.webApp), stdio: 'inherit', shell: process.platform === 'win32' })
    if (run.status !== 0) throw new Error(`[${editor.slug}] trunk build failed (exit ${run.status})`)
  }
  const dist = forkDist(editor, root)
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    if (allowMissing) {
      console.warn(`[${editor.slug}] no build at ${dist}; size left empty`)
      sizes[editor.slug] = null
      continue
    }
    throw new Error(`[${editor.slug}] missing build: ${dist}/index.html`)
  }
  const files = fs.readdirSync(dist).filter((name) => fs.statSync(path.join(dist, name)).isFile())
    .map((name) => ({ name, gzipBytes: gzipSync(fs.readFileSync(path.join(dist, name)), { level: 9 }).length }))
  sizes[editor.slug] = downloadMegabytes(files)
  console.log(`[${editor.slug}] first download ≈ ${sizes[editor.slug]} MB`)
}

const out = path.join(REPO_ROOT, 'src', 'generated', 'editor-sizes.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(sizes, null, 2) + '\n')
```

- [ ] **Step 4: Chạy test, xác nhận qua**

Run: `npx vitest run src/lib/build/editor-sizes.test.ts`
Expected: PASS.

- [ ] **Step 5: Chạy script với bản build đã có ở Task 0**

Run: `node scripts/build-editors.mts --skip-rust --allow-missing`
Expected: `[van-ban] first download ≈ 14.8 MB` (xấp xỉ), các fork chưa build in cảnh báo; tệp `src/generated/editor-sizes.json` được tạo.

- [ ] **Step 6: Commit** (chỉ khi được phép)

```bash
git add src/lib/build scripts/build-editors.mts
git commit -m "feat: build forks with trunk and measure first-download size"
```

---

### Task 5: Service worker

**Files:**
- Create: `editor-shell/sw.js`
- Test: `editor-shell/sw.test.ts`

**Interfaces:**
- Produces: `editor-shell/sw.js` có chuỗi `__BUILD_ID__` (Task 6 thay bằng mã build) và hàm toàn cục `classify(url: URL, method: string, mode: string, origin: string): 'bypass' | 'network-first' | 'cache-first'`.

- [ ] **Step 1: Viết test thất bại**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

type Strategy = 'bypass' | 'network-first' | 'cache-first'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadWorker() {
  const listeners: Record<string, unknown> = {}
  const context = {
    URL,
    self: { addEventListener: (type: string, fn: unknown) => { listeners[type] = fn }, location: { origin: 'https://office.erpcons.vn' } },
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), context)
  return { classify: (context as unknown as { classify: (u: URL, m: string, mode: string, o: string) => Strategy }).classify, listeners }
}

const origin = 'https://office.erpcons.vn'
const at = (p: string) => new URL(p, origin)

describe('sw classify', () => {
  const { classify, listeners } = loadWorker()

  it('registers install, activate and fetch handlers', () => {
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install'])
  })

  it('uses network-first for pages', () => {
    expect(classify(at('/van-ban/'), 'GET', 'navigate', origin)).toBe('network-first')
    expect(classify(at('/'), 'GET', 'navigate', origin)).toBe('network-first')
    expect(classify(at('/van-ban/index.html'), 'GET', 'no-cors', origin)).toBe('network-first')
  })

  it('uses cache-first for hashed engine files', () => {
    expect(classify(at('/van-ban/wordcraft-web-a4ceca68febdadee_bg.wasm'), 'GET', 'cors', origin)).toBe('cache-first')
    expect(classify(at('/_next/static/chunks/app.js'), 'GET', 'no-cors', origin)).toBe('cache-first')
  })

  it('never handles writes, other origins or the worker itself', () => {
    expect(classify(at('/van-ban/'), 'POST', 'navigate', origin)).toBe('bypass')
    expect(classify(new URL('https://example.com/a.js'), 'GET', 'cors', origin)).toBe('bypass')
    expect(classify(at('/sw.js'), 'GET', 'no-cors', origin)).toBe('bypass')
  })

  it('keeps a build placeholder for assemble to fill in', () => {
    expect(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')).toContain('__BUILD_ID__')
  })
})
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run editor-shell/sw.test.ts`
Expected: FAIL — ENOENT `sw.js`.

- [ ] **Step 3: Cài đặt `editor-shell/sw.js`**

```js
var CACHE = 'erpcons-office-__BUILD_ID__'

function classify(url, method, mode, origin) {
  if (method !== 'GET' || url.origin !== origin || url.pathname === '/sw.js') return 'bypass'
  if (mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return 'network-first'
  return 'cache-first'
}

// Only full 200 responses are stored: Cache.put rejects 206 range replies.
function storable(response) {
  return response.status === 200 && response.type === 'basic'
}

async function networkFirst(request) {
  var cache = await caches.open(CACHE)
  try {
    var response = await fetch(request)
    if (storable(response)) await cache.put(request, response.clone())
    return response
  } catch (error) {
    var hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    throw error
  }
}

async function cacheFirst(request) {
  var cache = await caches.open(CACHE)
  var hit = await cache.match(request)
  if (hit) return hit
  var response = await fetch(request)
  if (storable(response)) await cache.put(request, response.clone())
  return response
}

self.addEventListener('install', function () { self.skipWaiting() })

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('erpcons-office-') === 0 && k !== CACHE }).map(function (k) { return caches.delete(k) })) })
      .then(function () { return self.clients.claim() }),
  )
})

self.addEventListener('fetch', function (event) {
  var strategy = classify(new URL(event.request.url), event.request.method, event.request.mode, self.location.origin)
  if (strategy === 'bypass') return
  event.respondWith(strategy === 'network-first' ? networkFirst(event.request) : cacheFirst(event.request))
})
```

- [ ] **Step 4: Chạy, xác nhận qua**

Run: `npx vitest run editor-shell/sw.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit** (chỉ khi được phép)

```bash
git add editor-shell/sw.js editor-shell/sw.test.ts
git commit -m "feat: add offline service worker"
```

---

### Task 6: Lắp ráp `out/`

**Files:**
- Create: `src/lib/build/assemble.ts`
- Create: `src/lib/build/precompress.ts`
- Create: `scripts/assemble.mts`
- Test: `src/lib/build/assemble.test.ts`, `src/lib/build/precompress.test.ts`

**Interfaces:**
- Consumes: `EDITORS`, `injectEditorShell`, `ShellAssets` (Task 3), `forkDist`, `workspaceRoot`, `REPO_ROOT` (Task 4), `editor-shell/sw.js` (Task 5).
- Produces:
  - `function installEditor(editor: EditorEntry, sourceDir: string, outDir: string, editors: readonly EditorEntry[], assets: ShellAssets): void` — kiểm nguồn + chèn trong bộ nhớ **trước**, rồi mới xoá và chép `out/<slug>/`.
  - `function buildId(parts: string[]): string` — sha256 rút 12 ký tự.
  - `function precompressDir(dir: string): { files: number }` — viết `.gz` và `.br` cạnh mỗi tệp `.wasm .js .css .html .svg .json .xml .txt ≥ 1024 byte`.

- [ ] **Step 1: Viết test thất bại**

`src/lib/build/assemble.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { buildId, installEditor } from './assemble.ts'

const assets = { css: '', script: '' }
const word = EDITORS[0]
const page = '<html lang="en"><head><title>W</title></head><body><canvas id="wordcraft_canvas"></canvas></body></html>'
let tmp: string

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-assemble-'))
  const source = path.join(tmp, 'dist')
  const out = path.join(tmp, 'out')
  fs.mkdirSync(path.join(source, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(source, 'index.html'), page)
  fs.writeFileSync(path.join(source, 'app_bg.wasm'), 'wasm')
  fs.writeFileSync(path.join(source, 'nested', 'font.ttf'), 'font')
  fs.mkdirSync(path.join(out, 'van-ban'), { recursive: true })
  fs.writeFileSync(path.join(out, 'van-ban', 'stale.js'), 'old')
  return { source, out }
}

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('installEditor', () => {
  it('replaces out/<slug> with the build and injects the shell', () => {
    const { source, out } = setup()
    installEditor(word, source, out, EDITORS, assets)
    const target = path.join(out, 'van-ban')
    expect(fs.existsSync(path.join(target, 'stale.js'))).toBe(false)
    expect(fs.readFileSync(path.join(target, 'nested', 'font.ttf'), 'utf8')).toBe('font')
    expect(fs.readFileSync(path.join(target, 'index.html'), 'utf8')).toContain('data-erpcons-shell')
  })

  it('leaves the previous output untouched when the build is missing', () => {
    const { out } = setup()
    expect(() => installEditor(word, path.join(tmp, 'nope'), out, EDITORS, assets)).toThrow('missing build')
    expect(fs.readFileSync(path.join(out, 'van-ban', 'stale.js'), 'utf8')).toBe('old')
  })

  it('leaves the previous output untouched when injection fails', () => {
    const { source, out } = setup()
    fs.writeFileSync(path.join(source, 'index.html'), '<html><head></head><body></body></html>')
    expect(() => installEditor(word, source, out, EDITORS, assets)).toThrow('canvas #wordcraft_canvas not found')
    expect(fs.existsSync(path.join(out, 'van-ban', 'stale.js'))).toBe(true)
  })
})

describe('buildId', () => {
  it('is stable for the same inputs and changes with them', () => {
    expect(buildId(['a', 'b'])).toBe(buildId(['a', 'b']))
    expect(buildId(['a', 'b'])).not.toBe(buildId(['a', 'c']))
    expect(buildId(['a'])).toMatch(/^[0-9a-f]{12}$/)
  })
})
```

`src/lib/build/precompress.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { precompressDir } from './precompress.ts'

let tmp: string
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('precompressDir', () => {
  it('writes .gz and .br for large text and wasm files only', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-compress-'))
    const big = 'x'.repeat(4096)
    fs.mkdirSync(path.join(tmp, 'sub'))
    fs.writeFileSync(path.join(tmp, 'sub', 'a_bg.wasm'), big)
    fs.writeFileSync(path.join(tmp, 'small.js'), 'x')
    fs.writeFileSync(path.join(tmp, 'photo.png'), big)

    expect(precompressDir(tmp)).toEqual({ files: 1 })
    expect(gunzipSync(fs.readFileSync(path.join(tmp, 'sub', 'a_bg.wasm.gz'))).toString()).toBe(big)
    expect(brotliDecompressSync(fs.readFileSync(path.join(tmp, 'sub', 'a_bg.wasm.br'))).toString()).toBe(big)
    expect(fs.existsSync(path.join(tmp, 'small.js.gz'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'photo.png.gz'))).toBe(false)
  })

  it('does not compress its own outputs on a second run', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-compress-'))
    fs.writeFileSync(path.join(tmp, 'a.js'), 'y'.repeat(4096))
    precompressDir(tmp)
    expect(precompressDir(tmp)).toEqual({ files: 1 })
    expect(fs.existsSync(path.join(tmp, 'a.js.gz.gz'))).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/lib/build`
Expected: FAIL — không tìm thấy `./assemble.ts`, `./precompress.ts`.

- [ ] **Step 3: Cài đặt `assemble.ts`**

```ts
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { EditorEntry } from '../../config/editors.ts'
import { injectEditorShell, type ShellAssets } from '../editor-shell/inject.ts'

/** Validates and injects in memory first so a bad build never wipes the previous output. */
export function installEditor(editor: EditorEntry, sourceDir: string, outDir: string, editors: readonly EditorEntry[], assets: ShellAssets): void {
  const sourceIndex = path.join(sourceDir, 'index.html')
  if (!fs.existsSync(sourceIndex)) throw new Error(`[${editor.slug}] missing build: ${sourceIndex}`)
  const page = injectEditorShell(fs.readFileSync(sourceIndex, 'utf8'), editor, editors, assets)

  const target = path.join(outDir, editor.slug)
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(sourceDir, target, { recursive: true })
  fs.writeFileSync(path.join(target, 'index.html'), page)
}

export function buildId(parts: string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex').slice(0, 12)
}
```

- [ ] **Step 4: Cài đặt `precompress.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const COMPRESSIBLE = /\.(wasm|js|mjs|css|html|svg|json|xml|txt)$/i
const MIN_BYTES = 1024

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** Precompressed siblings let the server send .br/.gz without compressing per request. */
export function precompressDir(dir: string): { files: number } {
  let files = 0
  for (const file of walk(dir)) {
    if (!COMPRESSIBLE.test(file)) continue
    const bytes = fs.readFileSync(file)
    if (bytes.length < MIN_BYTES) continue
    fs.writeFileSync(file + '.gz', gzipSync(bytes, { level: 9 }))
    fs.writeFileSync(file + '.br', brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
    }))
    files++
  }
  return { files }
}
```

- [ ] **Step 5: Chạy test, xác nhận qua**

Run: `npx vitest run src/lib/build`
Expected: PASS (assemble 4 test, precompress 2 test, editor-sizes 2 test).

- [ ] **Step 6: Cài đặt `scripts/assemble.mts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { EDITORS } from '../src/config/editors.ts'
import { buildId, installEditor } from '../src/lib/build/assemble.ts'
import { precompressDir } from '../src/lib/build/precompress.ts'
import { REPO_ROOT, forkDist, workspaceRoot } from '../src/lib/build/workspace.ts'

const out = path.join(REPO_ROOT, 'out')
if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('out/index.html missing — run next build first')

const shell = path.join(REPO_ROOT, 'editor-shell')
const assets = {
  css: fs.readFileSync(path.join(shell, 'shell.css'), 'utf8'),
  script: fs.readFileSync(path.join(shell, 'shell.js'), 'utf8'),
}

const root = workspaceRoot()
for (const editor of EDITORS) {
  installEditor(editor, forkDist(editor, root), out, EDITORS, assets)
  console.log(`[${editor.slug}] installed from ${editor.fork}`)
}

const nextBuildId = fs.readFileSync(path.join(REPO_ROOT, '.next', 'BUILD_ID'), 'utf8')
const id = buildId([nextBuildId, ...EDITORS.map((e) => fs.readFileSync(path.join(out, e.slug, 'index.html'), 'utf8'))])
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(shell, 'sw.js'), 'utf8').replace('__BUILD_ID__', id))
console.log(`sw.js build ${id}`)

const { files } = precompressDir(out)
console.log(`precompressed ${files} files`)
```

- [ ] **Step 7: Chạy thử đầu-cuối với bản build có sẵn** (cần cả 4 fork đã `trunk build`; nếu chưa: `npm run build` thay vì `build:site`)

Run: `npm run build:site`
Expected: in `[van-ban] installed…` cho cả 4, `sw.js build <12 hex>`, `precompressed N files`; có `out/van-ban/index.html` chứa `data-erpcons-shell`, `out/sw.js` không còn `__BUILD_ID__`.

- [ ] **Step 8: Commit** (chỉ khi được phép)

```bash
git add src/lib/build scripts/assemble.mts
git commit -m "feat: assemble editors into the static site with precompression"
```

---

### Task 7: Server preview giống Apache

**Files:**
- Create: `src/lib/preview/static-server.ts`
- Create: `scripts/preview.mts`
- Test: `src/lib/preview/static-server.test.ts`

**Interfaces:**
- Produces:
  - `type Resolved = { kind: 'file'; rel: string } | { kind: 'redirect'; location: string } | { kind: 'forbidden' }`
  - `function resolveRequest(rawUrl: string, isDirectory: (rel: string) => boolean): Resolved` — `rel` dùng `/`, không có `/` đầu.
  - `function pickEncoding(acceptEncoding: string | undefined, available: { br: boolean; gzip: boolean }): 'br' | 'gzip' | null`
  - `function contentTypeFor(rel: string): string`
  - `function cacheControlFor(rel: string): string`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { cacheControlFor, contentTypeFor, pickEncoding, resolveRequest } from './static-server.ts'

const dirs = new Set(['', 'van-ban', '_next'])
const isDirectory = (rel: string) => dirs.has(rel)

describe('resolveRequest', () => {
  it('serves index.html for directories with a trailing slash', () => {
    expect(resolveRequest('/', isDirectory)).toEqual({ kind: 'file', rel: 'index.html' })
    expect(resolveRequest('/van-ban/', isDirectory)).toEqual({ kind: 'file', rel: 'van-ban/index.html' })
  })

  it('redirects directories without a trailing slash, keeping the query', () => {
    expect(resolveRequest('/van-ban', isDirectory)).toEqual({ kind: 'redirect', location: '/van-ban/' })
    expect(resolveRequest('/van-ban?x=1', isDirectory)).toEqual({ kind: 'redirect', location: '/van-ban/?x=1' })
  })

  it('ignores the query for files', () => {
    expect(resolveRequest('/van-ban/a_bg.wasm?v=2', isDirectory)).toEqual({ kind: 'file', rel: 'van-ban/a_bg.wasm' })
  })

  it('rejects traversal, encoded or not', () => {
    expect(resolveRequest('/../secret', isDirectory)).toEqual({ kind: 'forbidden' })
    expect(resolveRequest('/van-ban/%2e%2e/%2e%2e/secret', isDirectory)).toEqual({ kind: 'forbidden' })
    expect(resolveRequest('/van-ban/..%5c..%5csecret', isDirectory)).toEqual({ kind: 'forbidden' })
  })

  it('rejects malformed escapes', () => {
    expect(resolveRequest('/%E0%A4%A', isDirectory)).toEqual({ kind: 'forbidden' })
  })
})

describe('pickEncoding', () => {
  const both = { br: true, gzip: true }
  it('prefers brotli, then gzip', () => {
    expect(pickEncoding('gzip, deflate, br', both)).toBe('br')
    expect(pickEncoding('gzip', both)).toBe('gzip')
  })
  it('honours q=0 and missing variants', () => {
    expect(pickEncoding('br;q=0, gzip', both)).toBe('gzip')
    expect(pickEncoding('br', { br: false, gzip: true })).toBeNull()
  })
  it('handles absent header and wildcard', () => {
    expect(pickEncoding(undefined, both)).toBeNull()
    expect(pickEncoding('*', both)).toBe('br')
  })
})

describe('contentTypeFor', () => {
  it('maps engine and site files', () => {
    expect(contentTypeFor('van-ban/a_bg.wasm')).toBe('application/wasm')
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeFor('van-ban/a.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('brand/erpcons-mark.svg')).toBe('image/svg+xml')
    expect(contentTypeFor('x.unknown')).toBe('application/octet-stream')
  })
})

describe('cacheControlFor', () => {
  it('never caches pages and the worker', () => {
    expect(cacheControlFor('van-ban/index.html')).toBe('no-cache')
    expect(cacheControlFor('sw.js')).toBe('no-cache')
  })
  it('caches hashed files for a year', () => {
    expect(cacheControlFor('van-ban/wordcraft-web-a4ceca68febdadee_bg.wasm')).toBe('public, max-age=31536000, immutable')
    expect(cacheControlFor('_next/static/chunks/main.js')).toBe('public, max-age=31536000, immutable')
  })
  it('caches other files briefly', () => {
    expect(cacheControlFor('brand/erpcons-mark.svg')).toBe('public, max-age=3600')
  })
})
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/lib/preview/static-server.test.ts`
Expected: FAIL — không tìm thấy `./static-server.ts`.

- [ ] **Step 3: Cài đặt `static-server.ts`**

```ts
export type Resolved = { kind: 'file'; rel: string } | { kind: 'redirect'; location: string } | { kind: 'forbidden' }

/** Mirrors Apache's DirectorySlash + DirectoryIndex so local preview matches production URLs. */
export function resolveRequest(rawUrl: string, isDirectory: (rel: string) => boolean): Resolved {
  const queryAt = rawUrl.indexOf('?')
  const rawPath = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt)
  const query = queryAt === -1 ? '' : rawUrl.slice(queryAt)
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return { kind: 'forbidden' }
  }
  const segments = decoded.split(/[\\/]/)
  if (segments.some((s) => s === '..' || s === '.')) return { kind: 'forbidden' }
  const rel = segments.filter(Boolean).join('/')
  const endsWithSlash = rawPath.endsWith('/')
  if (rel === '' || isDirectory(rel)) {
    if (!endsWithSlash) return { kind: 'redirect', location: `/${rel}/${query}` }
    return { kind: 'file', rel: rel === '' ? 'index.html' : `${rel}/index.html` }
  }
  return { kind: 'file', rel }
}

export function pickEncoding(acceptEncoding: string | undefined, available: { br: boolean; gzip: boolean }): 'br' | 'gzip' | null {
  if (!acceptEncoding) return null
  const accepted = new Map<string, number>()
  for (const part of acceptEncoding.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';')
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    accepted.set(name, q ? Number(q.slice(2)) : 1)
  }
  const allowed = (name: string) => (accepted.get(name) ?? accepted.get('*') ?? 0) > 0
  if (available.br && allowed('br')) return 'br'
  if (available.gzip && allowed('gzip')) return 'gzip'
  return null
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', wasm: 'application/wasm', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json',
}

export function contentTypeFor(rel: string): string {
  const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase()
  return TYPES[ext] ?? 'application/octet-stream'
}

// trunk appends a 16-hex content hash; Next puts hashed assets under _next/static.
const HASHED = /(^|\/)_next\/static\/|-[0-9a-f]{16}(_bg)?\.[a-z0-9]+$/

export function cacheControlFor(rel: string): string {
  if (rel.endsWith('.html') || rel === 'sw.js') return 'no-cache'
  if (HASHED.test(rel)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}
```

- [ ] **Step 4: Chạy test, xác nhận qua**

Run: `npx vitest run src/lib/preview/static-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Cài đặt `scripts/preview.mts`**

```ts
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { REPO_ROOT } from '../src/lib/build/workspace.ts'
import { cacheControlFor, contentTypeFor, pickEncoding, resolveRequest } from '../src/lib/preview/static-server.ts'

const root = path.join(REPO_ROOT, 'out')
const port = Number(process.env.PORT ?? 3011)
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('out/ is empty — run npm run build:site first')

const isDirectory = (rel: string) => fs.statSync(path.join(root, rel), { throwIfNoEntry: false })?.isDirectory() ?? false

http.createServer((req, res) => {
  const resolved = resolveRequest(req.url ?? '/', isDirectory)
  if (resolved.kind === 'forbidden') { res.writeHead(403).end('Forbidden'); return }
  if (resolved.kind === 'redirect') { res.writeHead(301, { Location: resolved.location }).end(); return }

  const file = path.join(root, resolved.rel)
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    const notFound = path.join(root, '404.html')
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found')
    return
  }
  const encoding = pickEncoding(req.headers['accept-encoding'], { br: fs.existsSync(file + '.br'), gzip: fs.existsSync(file + '.gz') })
  const body = encoding === 'br' ? file + '.br' : encoding === 'gzip' ? file + '.gz' : file
  res.writeHead(200, {
    'Content-Type': contentTypeFor(resolved.rel),
    'Cache-Control': cacheControlFor(resolved.rel),
    'Vary': 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
    'Content-Length': fs.statSync(body).size,
  })
  if (req.method === 'HEAD') { res.end(); return }
  fs.createReadStream(body).pipe(res)
}).listen(port, () => console.log(`ERPCons Văn phòng preview: http://localhost:${port}/`))
```

- [ ] **Step 6: Chạy thử**

Run: `npm run preview` (giữ chạy), ở terminal khác:
Run: `curl -sI -H "Accept-Encoding: br" http://localhost:3011/van-ban/` → `200`, `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-cache`.
Run: `curl -sI http://localhost:3011/van-ban` → `301`, `Location: /van-ban/`.
Lấy tên `.wasm` trong `out/van-ban/`, Run: `curl -sI -H "Accept-Encoding: gzip, br" http://localhost:3011/van-ban/<tên>.wasm` → `Content-Type: application/wasm`, `Content-Encoding: br`, `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 7: Commit** (chỉ khi được phép)

```bash
git add src/lib/preview scripts/preview.mts
git commit -m "feat: add Apache-like local preview server"
```

---

### Task 8: Nhận diện, token, layout và SEO

**Files:**
- Create: `public/brand/erpcons-mark.svg` (chép từ `G:\workspace\erpcons_frontend\public\favicon.svg`)
- Create: `public/brand/icon-192.png`, `public/brand/icon-512.png` (chép từ `pwa-192x192.png`, `pwa-512x512.png` của erpcons_frontend)
- Create: `public/brand/og-image.png` (tạm chép `pwa-512x512.png`; ảnh OG 1200×630 riêng là việc sau)
- Create: `src/styles/tokens.css`, `src/styles/landing.css`
- Create: `src/components/RegisterServiceWorker.tsx`, `src/components/JsonLd.tsx`
- Create: `src/lib/seo/structured-data.ts`
- Create: `app/sitemap.ts`, `app/robots.ts`
- Modify: `app/layout.tsx` (thay bản tạm của Task 1)
- Test: `src/lib/seo/structured-data.test.ts`

**Interfaces:**
- Consumes: `SITE`, `EDITORS`, `editorPath` (Task 2).
- Produces:
  - `function softwareApplicationLd(): Record<string, unknown>`
  - `function faqLd(items: { question: string; answer: string }[]): Record<string, unknown>`
  - `function sitemapEntries(): { url: string; priority: number }[]`
  - Component `JsonLd({ data }: { data: Record<string, unknown> })`, `RegisterServiceWorker()`.
  - Class CSS dùng ở Task 9 (định nghĩa trong `landing.css`): `erp-container`, `erp-section`, `erp-btn`, `erp-btn--primary`, `erp-btn--secondary`.

- [ ] **Step 1: Chép tệp nhận diện**

Run (PowerShell, trong `erpcons-office`):
```powershell
New-Item -ItemType Directory -Force public\brand | Out-Null
$src = 'G:\workspace\erpcons_frontend\public'
Copy-Item "$src\favicon.svg" public\brand\erpcons-mark.svg
Copy-Item "$src\pwa-192x192.png" public\brand\icon-192.png
Copy-Item "$src\pwa-512x512.png" public\brand\icon-512.png
Copy-Item "$src\pwa-512x512.png" public\brand\og-image.png
```

- [ ] **Step 2: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { faqLd, sitemapEntries, softwareApplicationLd } from './structured-data.ts'

describe('structured data', () => {
  it('describes a free browser application', () => {
    expect(softwareApplicationLd()).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'ERPCons Văn phòng',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      url: 'https://office.erpcons.vn/',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
      inLanguage: 'vi',
    })
  })

  it('turns FAQ items into a FAQPage', () => {
    expect(faqLd([{ question: 'Q?', answer: 'A.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }],
    })
  })

  it('lists the landing and the four editors', () => {
    expect(sitemapEntries().map((e) => e.url)).toEqual([
      'https://office.erpcons.vn/',
      'https://office.erpcons.vn/van-ban/',
      'https://office.erpcons.vn/bang-tinh/',
      'https://office.erpcons.vn/trinh-chieu/',
      'https://office.erpcons.vn/pdf/',
    ])
  })
})
```

Run: `npx vitest run src/lib/seo` → FAIL (không tìm thấy module).

- [ ] **Step 3: Cài đặt `structured-data.ts`**

```ts
import { EDITORS, SITE, editorPath } from '../../config/editors.ts'

export function softwareApplicationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    url: `${SITE.origin}/`,
    inLanguage: 'vi',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
    featureList: EDITORS.map((e) => `${e.name} (${e.extension})`),
  }
}

export function faqLd(items: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  }
}

export function sitemapEntries(): { url: string; priority: number }[] {
  return [
    { url: `${SITE.origin}/`, priority: 1 },
    ...EDITORS.map((e) => ({ url: SITE.origin + editorPath(e.slug), priority: 0.8 })),
  ]
}
```

Run: `npx vitest run src/lib/seo` → PASS.

- [ ] **Step 4: `app/sitemap.ts` và `app/robots.ts`**

```ts
import type { MetadataRoute } from 'next'
import { sitemapEntries } from '@/lib/seo/structured-data.ts'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map(({ url, priority }) => ({ url, priority, changeFrequency: 'monthly' }))
}
```

```ts
import type { MetadataRoute } from 'next'
import { SITE } from '@/config/editors.ts'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE.origin}/sitemap.xml` }
}
```

- [ ] **Step 5: Component nhỏ**

`src/components/JsonLd.tsx`:

```tsx
// JSON-LD must be inline; escaping "<" keeps a "</script>" inside text from closing the tag.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
```

`src/components/RegisterServiceWorker.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
```

- [ ] **Step 6: Token và CSS nền**

`src/styles/tokens.css`:

```css
:root {
  --erp-crimson: #da3548;
  --erp-crimson-hover: #c22d3f;
  --erp-blue: #3678d4;
  --erp-teal: #16a6a0;
  --erp-green: #27a66f;
  --erp-bg: #f2f6f8;
  --erp-surface: #ffffff;
  --erp-surface-2: #e7eef2;
  --erp-text: #101820;
  --erp-text-2: #344454;
  --erp-border: #d6e0e6;
  --erp-focus: #3678d4;
  --erp-warning: #c88920;
  --erp-radius-sm: 4px;
  --erp-radius-md: 8px;
  --erp-radius-lg: 12px;
  --erp-space-1: 4px;
  --erp-space-2: 8px;
  --erp-space-3: 12px;
  --erp-space-4: 16px;
  --erp-space-5: 24px;
  --erp-space-6: 32px;
  --erp-space-7: 48px;
  --erp-space-8: 64px;
  --erp-space-9: 96px;
}
```

`src/styles/landing.css`:

```css
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--erp-bg); color: var(--erp-text); font-family: var(--erp-font), system-ui, sans-serif; font-size: 16px; line-height: 1.6; }
a { color: var(--erp-blue); }
:focus-visible { outline: 2px solid var(--erp-focus); outline-offset: 2px; }
.erp-container { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 var(--erp-space-4); }
.erp-section { padding: var(--erp-space-8) 0; }
.erp-section h2 { margin: 0 0 var(--erp-space-5); font-size: 24px; font-weight: 600; line-height: 1.3; }
.erp-btn { display: inline-flex; align-items: center; gap: var(--erp-space-2); min-height: 44px; padding: 0 var(--erp-space-5);
  border-radius: var(--erp-radius-md); font-weight: 600; text-decoration: none; border: 1px solid transparent; }
.erp-btn--primary { background: var(--erp-crimson); color: #fff; }
.erp-btn--primary:hover { background: var(--erp-crimson-hover); }
.erp-btn--secondary { background: var(--erp-surface); color: var(--erp-text); border-color: var(--erp-border); }
.erp-btn--secondary:hover { background: var(--erp-surface-2); }
.erp-icon { width: 1em; height: 1em; flex: none; }
@media (max-width: 767px) { .erp-section { padding: var(--erp-space-7) 0; } }
```

(Ghi chú: `#fff` trên nút crimson là chữ trên nền nhận diện, đúng `foundation.snow` của design system; nếu muốn tuyệt đối không hex ngoài `tokens.css`, đổi thành `var(--erp-surface)`.)

- [ ] **Step 7: `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker.tsx'
import { SITE } from '@/config/editors.ts'
import '@/styles/tokens.css'
import '@/styles/landing.css'

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--erp-font' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: `${SITE.name} – soạn văn bản, bảng tính, trình chiếu và PDF miễn phí`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  alternates: { canonical: '/' },
  icons: { icon: '/brand/erpcons-mark.svg', apple: '/brand/icon-192.png' },
  openGraph: { type: 'website', siteName: SITE.name, locale: 'vi_VN', url: '/', images: ['/brand/og-image.png'] },
}

export const viewport: Viewport = { themeColor: '#f2f6f8', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Kiểm**

Run: `npm run typecheck` → PASS. Run: `npx next build` → thành công; có `out/sitemap.xml` (5 URL), `out/robots.txt`.

- [ ] **Step 9: Commit** (chỉ khi được phép)

```bash
git add public/brand src/styles src/components src/lib/seo app
git commit -m "feat: add brand assets, Crimson Ice tokens, layout and SEO metadata"
```

---

### Task 9: Các phần của landing

Khi dựng phần giao diện của task này, dùng skill `design-taste-frontend` (theo quy định của user) **trong khung** token Crimson Ice và class nền ở Task 8 — không thêm màu/font mới. Mã bên dưới là bản chạy được tối thiểu; skill chỉ được tinh chỉnh bố cục/khoảng cách/nhịp chữ, không đổi nội dung hay cấu trúc component.

**Files:**
- Create: `src/content/landing.ts`
- Create: `src/components/Icon.tsx`
- Create: `src/components/landing/{SiteHeader,Hero,FeatureGrid,WhyUse,Notices,Faq,SiteFooter}.tsx`
- Create: `src/styles/landing-sections.css`
- Modify: `app/page.tsx`, `app/layout.tsx` (thêm import `landing-sections.css`)
- Test: `src/content/landing.test.ts`

**Interfaces:**
- Consumes: `EDITORS`, `SITE`, `editorPath` (Task 2); `JsonLd`, `faqLd`, `softwareApplicationLd` (Task 8); `src/generated/editor-sizes.json` (Task 4).
- Produces: `FAQ: { question: string; answer: string }[]`, `WHY: { icon: string; title: string; text: string }[]`, `NOTICES: string[]`, `FORK_REPOS: { name: string; url: string }[]`, `function formatSize(mb: number | null | undefined): string | null`.

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from 'vitest'
import { EDITORS } from '../config/editors.ts'
import { FAQ, FORK_REPOS, formatSize } from './landing.ts'

describe('landing content', () => {
  it('has the FAQ questions the spec asks for', () => {
    expect(FAQ.map((f) => f.question)).toEqual([
      'Tệp của tôi có bị tải lên máy chủ không?',
      'Lưu tệp như thế nào?',
      'Vì sao lần mở đầu tiên chậm?',
      'Có dùng được trên điện thoại không?',
      'Có mất phí không?',
    ])
  })

  it('links one fork repo per editor', () => {
    expect(FORK_REPOS.map((r) => r.url)).toEqual(EDITORS.map((e) => `https://github.com/tuananhfr/${e.fork}`))
  })

  it('formats sizes in Vietnamese decimal style and hides unknown ones', () => {
    expect(formatSize(14.8)).toBe('khoảng 14,8 MB')
    expect(formatSize(null)).toBeNull()
    expect(formatSize(undefined)).toBeNull()
  })
})
```

Run: `npx vitest run src/content` → FAIL.

- [ ] **Step 2: `src/content/landing.ts`**

```ts
import { EDITORS } from '../config/editors.ts'

export const WHY = [
  { icon: 'shield-lock', title: 'Tệp không rời máy', text: 'Mọi thao tác chạy ngay trong trình duyệt. Tệp không được tải lên máy chủ nào.' },
  { icon: 'person-check', title: 'Không cần tài khoản', text: 'Mở trang là dùng được, không đăng ký, không đăng nhập.' },
  { icon: 'wifi-off', title: 'Dùng được khi mất mạng', text: 'Sau lần mở đầu tiên khi có mạng, trình soạn thảo vẫn mở được lúc không có kết nối.' },
]

export const NOTICES = [
  'Đây là bản beta: tệp phức tạp có thể hiển thị khác bản gốc. Hãy giữ một bản sao của tệp ban đầu.',
  'Giao diện trình soạn thảo hiện bằng tiếng Anh.',
  'Dùng tốt nhất trên máy tính; trên điện thoại một số thanh công cụ có thể bị chật.',
  'Cần trình duyệt có WebGPU hoặc WebGL2 (Chrome, Edge, Firefox, Safari phiên bản mới).',
]

export const FAQ = [
  { question: 'Tệp của tôi có bị tải lên máy chủ không?', answer: 'Không. Tệp được mở và xử lý ngay trong trình duyệt trên máy bạn. Máy chủ chỉ gửi phần mềm trình soạn thảo, không nhận tệp của bạn.' },
  { question: 'Lưu tệp như thế nào?', answer: 'Dùng lệnh lưu của trình soạn thảo (Ctrl+S hoặc menu File). Tệp được tải về máy bạn.' },
  { question: 'Vì sao lần mở đầu tiên chậm?', answer: 'Lần đầu trình duyệt phải tải trình soạn thảo (vài MB đến khoảng 15 MB). Từ lần sau phần này đã có sẵn trên máy nên mở nhanh hơn nhiều.' },
  { question: 'Có dùng được trên điện thoại không?', answer: 'Mở được, nhưng giao diện được thiết kế cho màn hình lớn. Để làm việc thoải mái, nên dùng máy tính.' },
  { question: 'Có mất phí không?', answer: 'Không. ERPCons Văn phòng miễn phí và không cần tài khoản.' },
]

export const FORK_REPOS = EDITORS.map((e) => ({ name: e.upstreamName, url: `https://github.com/tuananhfr/${e.fork}` }))

export function formatSize(mb: number | null | undefined): string | null {
  if (mb === null || mb === undefined) return null
  return `khoảng ${mb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}
```

Run: `npx vitest run src/content` → PASS.

- [ ] **Step 3: `src/components/Icon.tsx`** (đọc SVG Bootstrap Icons lúc build — trang xuất tĩnh nên không có fs lúc chạy)

```tsx
import fs from 'node:fs'
import path from 'node:path'

const ICONS_DIR = path.join(process.cwd(), 'node_modules', 'bootstrap-icons', 'icons')
const NAME = /^[a-z0-9-]+$/

export function Icon({ name, label }: { name: string; label?: string }) {
  if (!NAME.test(name)) throw new Error(`invalid icon name: ${name}`)
  const svg = fs.readFileSync(path.join(ICONS_DIR, `${name}.svg`), 'utf8')
    .replace('<svg ', `<svg class="erp-icon" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} focusable="false" `)
  return <span className="erp-icon-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
}
```

- [ ] **Step 4: Các phần landing**

`src/components/landing/SiteHeader.tsx`:

```tsx
import { SITE } from '@/config/editors.ts'

export function SiteHeader() {
  return (
    <header className="erp-site-header">
      <div className="erp-container erp-site-header__inner">
        <a className="erp-site-header__brand" href="/">
          <img src="/brand/erpcons-mark.svg" alt="" width={28} height={28} />
          <span>{SITE.name}</span>
        </a>
        <a className="erp-btn erp-btn--secondary" href="#chuc-nang">Chức năng</a>
      </div>
    </header>
  )
}
```

`src/components/landing/Hero.tsx`:

```tsx
import { SITE } from '@/config/editors.ts'

export function Hero() {
  return (
    <section className="erp-hero">
      <div className="erp-container">
        <p className="erp-hero__eyebrow">Miễn phí · Không cần cài đặt · Tệp không rời máy</p>
        <h1>{SITE.name}</h1>
        <p className="erp-hero__lead">Soạn văn bản, bảng tính, trình chiếu và PDF ngay trên trình duyệt.</p>
        <a className="erp-btn erp-btn--primary" href="#chuc-nang">Bắt đầu</a>
      </div>
    </section>
  )
}
```

`src/components/landing/FeatureGrid.tsx`:

```tsx
import { Icon } from '@/components/Icon.tsx'
import { EDITORS, editorPath } from '@/config/editors.ts'
import { formatSize } from '@/content/landing.ts'
import sizes from '@/generated/editor-sizes.json'

export function FeatureGrid() {
  const known = sizes as Record<string, number | null>
  return (
    <section id="chuc-nang" className="erp-section" aria-labelledby="chuc-nang-title">
      <div className="erp-container">
        <h2 id="chuc-nang-title">Chức năng</h2>
        <ul className="erp-features">
          {EDITORS.map((editor) => {
            const size = formatSize(known[editor.slug])
            return (
              <li key={editor.slug} className="erp-feature">
                <span className="erp-feature__icon"><Icon name={editor.icon} /></span>
                <h3>{editor.name} <span className="erp-feature__ext">{editor.extension}</span></h3>
                <p>{editor.summary}</p>
                {size ? <p className="erp-feature__size">Lần đầu tải {size}</p> : null}
                <a className="erp-btn erp-btn--secondary" href={editorPath(editor.slug)}>Mở {editor.name}</a>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
```

`src/components/landing/WhyUse.tsx`:

```tsx
import { Icon } from '@/components/Icon.tsx'
import { SITE } from '@/config/editors.ts'
import { WHY } from '@/content/landing.ts'

export function WhyUse() {
  return (
    <section className="erp-section erp-section--alt" aria-labelledby="vi-sao-title">
      <div className="erp-container">
        <h2 id="vi-sao-title">Vì sao dùng {SITE.name}</h2>
        <ul className="erp-why">
          {WHY.map((item) => (
            <li key={item.title}>
              <span className="erp-why__icon"><Icon name={item.icon} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

`src/components/landing/Notices.tsx`:

```tsx
import { Icon } from '@/components/Icon.tsx'
import { NOTICES } from '@/content/landing.ts'

export function Notices() {
  return (
    <section className="erp-section" aria-labelledby="luu-y-title">
      <div className="erp-container">
        <h2 id="luu-y-title">Lưu ý</h2>
        <ul className="erp-notices">
          {NOTICES.map((text) => (
            <li key={text}><Icon name="info-circle" /><span>{text}</span></li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

`src/components/landing/Faq.tsx`:

```tsx
import { FAQ } from '@/content/landing.ts'

export function Faq() {
  return (
    <section className="erp-section erp-section--alt" aria-labelledby="hoi-dap-title">
      <div className="erp-container">
        <h2 id="hoi-dap-title">Câu hỏi thường gặp</h2>
        <div className="erp-faq">
          {FAQ.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
```

`src/components/landing/SiteFooter.tsx`:

```tsx
import { SITE } from '@/config/editors.ts'
import { FORK_REPOS } from '@/content/landing.ts'

export function SiteFooter() {
  return (
    <footer className="erp-site-footer">
      <div className="erp-container">
        <p><strong>{SITE.name}</strong> · Một sản phẩm của <a href="https://erpcons.vn/">ERPCons</a></p>
        <p>Dựa trên WordCraft, GridCraft, DeckCraft và PdfCraft của nhóm ArtCraft, phát hành theo giấy phép MIT hoặc Apache-2.0.</p>
        <p>Mã nguồn: {FORK_REPOS.map((repo, i) => (
          <span key={repo.url}>{i > 0 ? ' · ' : ''}<a href={repo.url}>{repo.name}</a></span>
        ))}</p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 5: `src/styles/landing-sections.css`** và thêm `import '@/styles/landing-sections.css'` vào `app/layout.tsx` ngay sau `landing.css`

```css
.erp-site-header { background: var(--erp-surface); border-bottom: 1px solid var(--erp-border); }
.erp-site-header__inner { display: flex; align-items: center; justify-content: space-between; min-height: 64px; gap: var(--erp-space-4); }
.erp-site-header__brand { display: inline-flex; align-items: center; gap: var(--erp-space-2); color: var(--erp-text); font-weight: 700; text-decoration: none; }
.erp-hero { padding: var(--erp-space-9) 0 var(--erp-space-8); background: var(--erp-surface); }
.erp-hero h1 { margin: var(--erp-space-2) 0 var(--erp-space-4); font-size: clamp(32px, 5vw, 48px); line-height: 1.15; font-weight: 700; }
.erp-hero__eyebrow { margin: 0; color: var(--erp-text-2); font-size: 14px; font-weight: 600; }
.erp-hero__lead { max-width: 40ch; margin: 0 0 var(--erp-space-6); font-size: 20px; color: var(--erp-text-2); }
.erp-section--alt { background: var(--erp-surface); }
.erp-features { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--erp-space-4); }
.erp-feature { display: flex; flex-direction: column; gap: var(--erp-space-2); padding: var(--erp-space-5); background: var(--erp-surface); border: 1px solid var(--erp-border); border-radius: var(--erp-radius-lg); }
.erp-feature h3 { margin: 0; font-size: 20px; font-weight: 600; }
.erp-feature p { margin: 0; color: var(--erp-text-2); }
.erp-feature .erp-btn { margin-top: auto; align-self: flex-start; }
.erp-feature__icon { font-size: 32px; color: var(--erp-blue); }
.erp-feature__ext, .erp-feature__size { color: var(--erp-text-2); font-size: 14px; font-weight: 400; }
.erp-why { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--erp-space-6); }
.erp-why h3 { margin: var(--erp-space-2) 0; font-size: 16px; font-weight: 600; }
.erp-why p { margin: 0; color: var(--erp-text-2); }
.erp-why__icon { font-size: 24px; color: var(--erp-teal); }
.erp-notices { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--erp-space-3); }
.erp-notices li { display: flex; gap: var(--erp-space-3); align-items: flex-start; }
.erp-notices .erp-icon { margin-top: 4px; color: var(--erp-warning); }
.erp-faq { display: grid; gap: var(--erp-space-2); max-width: 760px; }
.erp-faq details { background: var(--erp-bg); border: 1px solid var(--erp-border); border-radius: var(--erp-radius-md); padding: var(--erp-space-3) var(--erp-space-4); }
.erp-faq summary { cursor: pointer; font-weight: 600; min-height: 32px; display: flex; align-items: center; }
.erp-faq p { margin: var(--erp-space-2) 0 0; color: var(--erp-text-2); }
.erp-site-footer { padding: var(--erp-space-7) 0; background: var(--erp-text); color: var(--erp-surface-2); font-size: 14px; }
.erp-site-footer a { color: var(--erp-surface); }
.erp-site-footer p { margin: 0 0 var(--erp-space-2); }
.erp-icon-wrap { display: inline-flex; }
```

- [ ] **Step 6: `app/page.tsx`**

```tsx
import { JsonLd } from '@/components/JsonLd.tsx'
import { Faq } from '@/components/landing/Faq.tsx'
import { FeatureGrid } from '@/components/landing/FeatureGrid.tsx'
import { Hero } from '@/components/landing/Hero.tsx'
import { Notices } from '@/components/landing/Notices.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { WhyUse } from '@/components/landing/WhyUse.tsx'
import { FAQ } from '@/content/landing.ts'
import { faqLd, softwareApplicationLd } from '@/lib/seo/structured-data.ts'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <FeatureGrid />
        <WhyUse />
        <Notices />
        <Faq />
      </main>
      <SiteFooter />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqLd(FAQ)} />
    </>
  )
}
```

- [ ] **Step 7: Kiểm**

Run: `npm test` → PASS toàn bộ. Run: `npm run typecheck` → PASS. Run: `npm run lint` → không lỗi (nếu rule `@next/next/no-img-element` báo ở `<img>` logo: giữ `<img>` vì xuất tĩnh không tối ưu ảnh, thêm `{/* eslint-disable-next-line @next/next/no-img-element */}` ngay trên dòng đó).
Run: `npm run build:site` → thành công. Run: `npm run preview`, mở `http://localhost:3011/` → thấy đủ 6 phần, 4 thẻ có link `/van-ban/`…, dung lượng hiện "khoảng … MB".

- [ ] **Step 8: Commit** (chỉ khi được phép)

```bash
git add src/content src/components app src/styles
git commit -m "feat: build the landing page sections"
```

---

### Task 10: Kiểm chứng đầu-cuối

Không viết code mới trừ khi phát hiện lỗi (khi đó: dừng, báo user, sửa theo plan được duyệt).

- [ ] **Step 1: Build đầy đủ từ fork**

Run: `npm run build` (trunk build cả 4 fork `main` chưa sửa) rồi `npm run preview`.
Expected: không lỗi; 4 dòng `installed`, `precompressed N files`.

- [ ] **Step 2: Header thật**

Với từng `/van-ban/ /bang-tinh/ /trinh-chieu/ /pdf/`: `curl -sI -H "Accept-Encoding: br" http://localhost:3011/<slug>/<tệp .wasm>` → `application/wasm`, `Content-Encoding: br`, `immutable`.

- [ ] **Step 3: Vòng mở → sửa → lưu → mở lại**

Tạo tệp mẫu: dùng `G:\workspace\doc- tools\frontend\scripts\doc-tools\make-office-fixtures.mjs` (đọc trước để biết nơi xuất) cho docx/xlsx/pptx; PDF dùng một tệp PDF có sẵn trên máy. Mở từng editor trên Chrome, mở tệp, gõ thêm "Thử tiếng Việt: ăn quả nhớ kẻ trồng cây", lưu, mở lại tệp vừa lưu. Ghi kết quả từng định dạng.

- [ ] **Step 4: Tài nguyên tải thêm lúc chạy**

Trong DevTools → Network khi mở từng editor: liệt kê mọi request ngoài `index.html`, `.js`, `_bg.wasm`. Nếu có request ra origin khác hoặc tệp nằm ngoài `/<slug>/` → dừng, báo user (ảnh hưởng luật SW và cam kết "không gọi origin khác").

- [ ] **Step 5: Offline**

Mở `/van-ban/` khi có mạng, đợi editor chạy. DevTools → Network → Offline, tải lại trang → editor vẫn mở. Lặp lại cho 3 editor còn lại và cho landing.

- [ ] **Step 6: Thanh điều hướng**

Bấm từng link trên thanh khi đang có thay đổi chưa lưu → trình duyệt hỏi xác nhận rời trang (cơ chế của engine). Thử Tab từ đầu trang: focus có đi vào link trên thanh không, hay egui giữ focus — ghi lại kết quả. Thu cửa sổ < 768px: menu "Chức năng" mở/đóng được.

- [ ] **Step 7: Kiểm giao diện**

Chạy skill `frontend-visual-qa` (profile responsive) cho `http://localhost:3011/` và `http://localhost:3011/van-ban/` ở 360/390/430/1440. Chạy Lighthouse (SEO + Accessibility) cho landing: SEO = 100, Accessibility ≥ 95; dưới ngưỡng → liệt kê mục trượt, báo user.

- [ ] **Step 8: Bộ kiểm tĩnh**

Run: `npm test && npm run typecheck && npm run lint` → tất cả PASS. Báo cáo trung thực từng bước, bước nào bỏ qua nói rõ lý do.
