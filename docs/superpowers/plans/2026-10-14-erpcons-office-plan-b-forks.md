# ERPCons Văn phòng — Plan B: gỡ ArtCraft ở 4 fork, font tiếng Việt cho Bảng tính, Trình chiếu lưu .pptx

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa 4 fork (WordCraft, GridCraft, DeckCraft, PdfCraft) lên nhánh `erpcons` không còn nhận diện ArtCraft trong bản build web. Bảng tính hiện đúng tiếng Việt, Trình chiếu trên web lưu ra `.pptx`. `erpcons-office` từ chối build fork sai nhánh hoặc còn sót thương hiệu.

**Architecture:** Mỗi fork sửa trên nhánh `erpcons` tạo từ `main` upstream. Logo, link Discord/getartcraft và `docs/brand/` bị gỡ. Câu ghi nguồn "dựa trên <App> của nhóm ArtCraft" và dòng copyright được giữ. Link mã nguồn trỏ sang `github.com/tuananhfr/<fork>`. GridCraft nhúng Inter Regular/Bold từ craft-fonts qua `build.rs` (cách của DeckCraft) và gắn vào mọi chuỗi font. DeckCraft chọn định dạng lưu mặc định theo dịch vụ host: chỉ có download thì `.pptx`. `erpcons-office/scripts/build-editors.mts` gọi module thuần `fork-guard.ts`: kiểm nhánh trước khi chạy trunk, quét `dist/web` sau khi build.

**Tech Stack:** Rust ≥ 1.90 + egui/eframe + trunk (fork), `cargo xtask ci` (fmt, clippy `-D warnings`, test, assets…). Node 24 + TypeScript ~6.0.2 + Vitest ^5.0.2 (erpcons-office). Playwright Chrome cho kiểm thử đầu-cuối.

**Spec:** `docs/superpowers/specs/2026-10-14-erpcons-office-site-design.md` — mục 2 "Sửa trong 4 fork".

**Phạm vi plan này:** 4 fork + phần chặn ở `erpcons-office`. Không gồm: đóng gói native (wxs, metainfo, nfpm, menu macOS), `AGENTS.md`/`CLAUDE.md` của fork, glyph icon `discord` trong `icons.rs` (tên nội bộ, không hiển thị), đổi tên app, `index.html` của fork, ngôn ngữ editor. CLI/MCP chỉ sửa ở chỗ đụng tới hằng link bị xoá hoặc in link ArtCraft.

## Global Constraints

- Fork ở `G:\workspace\erpcons-workspace\{wordcraft,gridcraft,deckcraft,pdfcraft}`, nhánh làm việc **`erpcons`** tạo từ `main` hiện tại (HEAD lúc viết plan: wordcraft `04f6f53`, gridcraft `84acf62`, deckcraft `457406a`, pdfcraft `c1a41cc5`). Remote `upstream` đã tắt push; **không push** khi chưa được yêu cầu.
- Mọi lệnh cargo chạy trong Git Bash với `export PATH="$PATH:/c/Users/admin/.cargo/bin"`.
- Câu ghi nguồn trong About, đúng từng chữ (`<App>` = WordCraft | GridCraft | DeckCraft | PdfCraft): `ERPCons Văn phòng — dựa trên <App> của nhóm ArtCraft. MIT OR Apache-2.0.` Viết dạng literal thường, **không** bọc `tl!()` (không dịch câu ghi nguồn; test `*_covers_ui_literals` của PdfCraft đòi mọi literal `tl!` có bản dịch).
- Chuỗi chứa "ArtCraft" chỉ được phép còn trong bản build web ở hai dạng: `nhóm ArtCraft` và `ArtCraft Team and the` (dòng copyright). Cấm tuyệt đối: `discord.gg/artcraft`, `getartcraft`, `artcraft-logo`, `artcraft-mark`.
- Link mã nguồn: `https://github.com/tuananhfr/<fork>` (vd. `https://github.com/tuananhfr/pdfcraft`).
- Giữ nguyên `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, `ATTRIBUTION.md`/`.toml` (chỉ bỏ các dòng của `docs/brand/`). Mỗi fork thêm `ERPCONS-CHANGES.md` (Apache-2.0 §4b).
- craft-fonts ref cho GridCraft: `43913056ce82a3fdad0ef69f6b88d1dc922a8104` (có `fonts/latin-manifest.txt` chứa Inter Regular/Bold).
- Comment code tiếng Anh, 1–2 dòng, chỉ giải thích "why".
- **Chỉ commit khi user yêu cầu rõ.** Không thêm dòng ghi công AI (`Co-Authored-By`, "Generated with…") vào commit. Các bước "Commit" bên dưới chỉ chạy khi đã được phép.
- Kiểm chứng mỗi fork: `cargo xtask ci` xanh trên nhánh `erpcons`. Kiểm chứng giao diện: `frontend-visual-qa` (profile responsive) ở Task 8 — build xanh không phải bằng chứng giao diện đúng.

## Review Focus

1. **Thương hiệu lọt vào wasm qua đường không ai sửa**: bản dịch `.tsv` còn sót, SVG nhúng, từ điển chính tả, crate dùng chung `craft-libs` (không fork). Người dùng kỳ vọng không thấy ArtCraft ngoài câu ghi nguồn. Test ở Task 1 (quét chuỗi trong buffer nhị phân, tên tệp) + chạy thật ở Task 8. Nếu chỗ lọt nằm trong `craft-libs`, **DỪNG báo user**, không nới danh sách cho phép.
2. **Bảng tính trên web, ô in đậm/nghiêng có tiếng Việt**: không có tệp font hệ thống nào nạp được, mọi vai trò (`cell-bold`, `cell-italic`, `mono`, giao diện) vẫn phải vẽ đủ dấu. Test ở Task 4 dựng font với bộ nạp luôn trả `None` và kiểm cả 9 họ font.
3. **Trình chiếu bản desktop vẫn lưu `.deckcraft`**: đổi định dạng chỉ áp cho host không có hộp thoại lưu. Test ở Task 6 (host có `pick_save` → gợi ý `.deckcraft`).
4. **Trình duyệt tải tệp xong (hoặc bị huỷ) mà tab vẫn báo "chưa lưu" mãi**: web không biết kết quả tải. Ruling: coi như đã lưu sau khi giao byte. Test ở Task 6 kiểm cờ dirty về false.
5. **Build nhầm bản `main` hoặc `dist/web` cũ còn thương hiệu**: `build-editors.mts` dừng trước trunk khi nhánh sai. Với `--skip-rust`, quét `dist/web` vẫn chạy. Test ở Task 1.

---

## Bản đồ tệp

| Repo | Tệp | Trách nhiệm |
| --- | --- | --- |
| erpcons-office | `src/lib/build/fork-guard.ts` (mới) | `forkBranchProblem`, `findBrandLeaks`, `scanDistForBrand` — thuần, có test |
| erpcons-office | `src/lib/build/fork-guard.test.ts` (mới) | Vitest |
| erpcons-office | `scripts/build-editors.mts` | gọi guard trước trunk + quét sau build |
| mỗi fork | `ERPCONS-CHANGES.md` (mới), `README.md`, `ATTRIBUTION.*`, xoá `docs/brand/` | ghi nhận thay đổi, gỡ logo/badge/khối cộng đồng |
| wordcraft | `crates/ui-egui/src/{dialogs,chrome,backstage,ribbon,keytips,options,lib}.rs`, `src/i18n/*.tsv`, `crates/engine/src/sample.rs`, `crates/formats/src/latex.rs`, `crates/mcp/src/server.rs`, `assets/spelling/en-extra.txt` | gỡ Discord/getartcraft |
| gridcraft | `crates/ui-egui/src/dialogs.rs`, `src/i18n/pt.rs` | gỡ link |
| gridcraft | `crates/ui-egui/build.rs`, `src/craft_fonts.rs` (mới), `src/lib.rs`, `src/theme.rs`, `.cargo/config.toml`, `.github/workflows/release.yml` | nhúng Inter, gắn vào chuỗi font |
| deckcraft | `crates/engine/src/links.rs`, `crates/ui-egui/src/{dialogs,backstage,ribbon,lib}.rs`, `apps/deckcraft-cli/src/main.rs`, `crates/mcp/src/server.rs` | gỡ link |
| deckcraft | `crates/ui-egui/src/lib.rs` | `default_save_format` + đánh dấu đã lưu |
| pdfcraft | `crates/engine/src/{links,commands}.rs`, `crates/ui-egui/src/{home,chrome,dialogs,widgets,updates}.rs`, `src/i18n/*.tsv`, `apps/pdfcraft-cli/src/main.rs`, `crates/automation/src/mcp.rs`, `crates/ui-egui/tests/{ui.rs,ui_group/links.rs}`, `xtask/src/screenshots.rs`, `ATTRIBUTION.toml`, `docs/images/pdfcraft-tools.png` | gỡ thương hiệu, ẩn "Check for updates" trên web |

---

### Task 0: Nhánh `erpcons` ở 4 fork

Không có code.

- [ ] **Step 1: Kiểm 4 fork sạch và đang ở `main`**

Run:
```bash
cd /g/workspace/erpcons-workspace
for f in wordcraft gridcraft deckcraft pdfcraft; do echo "$f $(git -C $f branch --show-current) $(git -C $f status --porcelain | wc -l)"; done
```
Expected: 4 dòng dạng `<fork> main 0`. Nếu có thay đổi chưa commit: DỪNG, báo user.

- [ ] **Step 2: Tạo nhánh**

Run:
```bash
for f in wordcraft gridcraft deckcraft pdfcraft; do git -C $f switch -c erpcons; done
```
Expected: 4 lần `Switched to a new branch 'erpcons'`.

---

### Task 1: erpcons-office — chặn nhánh sai và thương hiệu sót

**Files:**
- Create: `src/lib/build/fork-guard.ts`
- Create: `src/lib/build/fork-guard.test.ts`
- Modify: `scripts/build-editors.mts`

**Interfaces:**
- Produces:
  - `forkBranchProblem(fork: string, branch: string): string | null`
  - `interface BrandLeak { file: string; term: string; context: string }`
  - `findBrandLeaks(file: string, content: string | Uint8Array): BrandLeak[]`
  - `scanDistForBrand(dir: string): BrandLeak[]` (đường dẫn `file` tương đối so với `dir`, dùng `/`)
  - Hằng `REQUIRED_FORK_BRANCH = 'erpcons'`

- [ ] **Step 1: Viết test (đỏ)**

`src/lib/build/fork-guard.test.ts`:
```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBrandLeaks, forkBranchProblem, scanDistForBrand } from './fork-guard.ts'

describe('forkBranchProblem', () => {
  it('accepts the erpcons branch', () => {
    expect(forkBranchProblem('gridcraft', 'erpcons')).toBeNull()
  })

  it('names the fork and the branch it needs otherwise', () => {
    expect(forkBranchProblem('gridcraft', 'main')).toMatch(/gridcraft.*main.*erpcons/)
    expect(forkBranchProblem('gridcraft', '')).toMatch(/gridcraft.*detached.*erpcons/)
  })
})

describe('findBrandLeaks', () => {
  it('reports every forbidden term with its file', () => {
    const leaks = findBrandLeaks('a.js', 'open("https://discord.gg/artcraft") ; https://getartcraft.com/apps')
    expect(leaks.map((l) => l.term)).toEqual(['discord.gg/artcraft', 'getartcraft'])
    expect(leaks[0].file).toBe('a.js')
  })

  it('keeps the attribution line and the copyright line', () => {
    const text = 'ERPCons Văn phòng — dựa trên GridCraft của nhóm ArtCraft. MIT OR Apache-2.0.\u0000© 2026 ArtCraft Team and the DeckCraft contributors'
    expect(findBrandLeaks('x.wasm', text)).toEqual([])
  })

  it('reports a bare ArtCraft in any case', () => {
    expect(findBrandLeaks('x.wasm', 'spreadsheet. Part of ArtCraft.').map((l) => l.term)).toEqual(['ArtCraft'])
    expect(findBrandLeaks('x.wasm', 'ARTCRAFT artcraft').map((l) => l.term)).toEqual(['ARTCRAFT', 'artcraft'])
  })

  it('reads UTF-8 out of binary data', () => {
    const bytes = new Uint8Array([0, 0xff, ...new TextEncoder().encode('của nhóm ArtCraft|Join the ArtCraft Discord'), 0])
    expect(findBrandLeaks('x.wasm', bytes).map((l) => l.term)).toEqual(['ArtCraft'])
  })

  it('shows printable context around a hit', () => {
    const [leak] = findBrandLeaks('x.wasm', '\u0000\u0001Part of ArtCraft.\u0002')
    expect(leak.context).toContain('Part of ArtCraft.')
    expect([...leak.context].every((c) => c.charCodeAt(0) >= 0x20)).toBe(true)
  })
})

describe('scanDistForBrand', () => {
  it('walks sub-directories and flags brand file names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-'))
    fs.mkdirSync(path.join(dir, 'assets'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<title>PdfCraft</title>')
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'x="https://getartcraft.com"')
    fs.writeFileSync(path.join(dir, 'artcraft-mark-1234.svg'), '<svg/>')
    const leaks = scanDistForBrand(dir)
    // One hit per position: the "artcraft" inside a forbidden term is not reported again.
    expect(leaks.map((l) => `${l.file}:${l.term}`).sort()).toEqual(['artcraft-mark-1234.svg:artcraft-mark', 'assets/app.js:getartcraft'])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Chạy test, phải đỏ**

Run: `npx vitest run src/lib/build/fork-guard.test.ts`
Expected: FAIL — `Failed to resolve import "./fork-guard.ts"`.

- [ ] **Step 3: Viết module**

`src/lib/build/fork-guard.ts`:
```ts
import fs from 'node:fs'
import path from 'node:path'

export const REQUIRED_FORK_BRANCH = 'erpcons'

// Only the erpcons branch has the ArtCraft marks removed (spec §2); main is upstream as-is.
export function forkBranchProblem(fork: string, branch: string): string | null {
  if (branch === REQUIRED_FORK_BRANCH) return null
  const current = branch === '' ? 'a detached HEAD' : `branch ${branch}`
  return `[${fork}] is on ${current}; build only from the ${REQUIRED_FORK_BRANCH} branch`
}

export interface BrandLeak {
  file: string
  term: string
  context: string
}

const FORBIDDEN = ['discord.gg/artcraft', 'getartcraft', 'artcraft-logo', 'artcraft-mark']
// The brand terms let a fork credit its source in plain words; these are the two credits we ship.
const ALLOWED = ['nhóm ArtCraft', 'ArtCraft Team and the']
const NAME = /artcraft/gi

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function contextAt(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 40), index + length + 40).replace(/[^\x20-\x7e\u00a0-\uffff]/g, '.')
}

export function findBrandLeaks(file: string, content: string | Uint8Array): BrandLeak[] {
  const text = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content)
  const hits: { index: number; leak: BrandLeak }[] = []
  for (const term of FORBIDDEN) {
    for (const m of text.matchAll(new RegExp(escape(term), 'gi'))) {
      hits.push({ index: m.index, leak: { file, term, context: contextAt(text, m.index, m[0].length) } })
    }
  }
  const allowed: [number, number][] = []
  for (const phrase of ALLOWED) {
    for (const m of text.matchAll(new RegExp(escape(phrase), 'g'))) allowed.push([m.index, m.index + m[0].length])
  }
  for (const m of text.matchAll(NAME)) {
    const covered = allowed.some(([from, to]) => m.index >= from && m.index < to)
    const insideForbidden = hits.some((h) => m.index >= h.index && m.index < h.index + h.leak.term.length)
    if (!covered && !insideForbidden) hits.push({ index: m.index, leak: { file, term: m[0], context: contextAt(text, m.index, m[0].length) } })
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.leak)
}

export function scanDistForBrand(dir: string): BrandLeak[] {
  const leaks: BrandLeak[] = []
  const walk = (sub: string) => {
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub === '' ? entry.name : `${sub}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
        continue
      }
      leaks.push(...findBrandLeaks(rel, rel))
      leaks.push(...findBrandLeaks(rel, fs.readFileSync(path.join(dir, rel))))
    }
  }
  walk('')
  return leaks
}
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `npx vitest run src/lib/build/fork-guard.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Nối vào `scripts/build-editors.mts`**

Thêm import (sau dòng import `craft-fonts.ts`):
```ts
import { forkBranchProblem, scanDistForBrand } from '../src/lib/build/fork-guard.ts'
```
Thêm hàm sau `fontsEnv`:
```ts
function currentBranch(fork: string): string {
  const run = spawnSync('git', ['-C', path.join(root, fork), 'branch', '--show-current'], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`[${fork}] git branch --show-current failed (exit ${run.status})`)
  return run.stdout.trim()
}
```
Trong vòng `for (const editor of EDITORS)`, ngay đầu khối `if (!skipRust) {`:
```ts
    const problem = forkBranchProblem(editor.fork, currentBranch(editor.fork))
    if (problem) throw new Error(problem)
```
Sau dòng `const files = …` (tức là khi `dist/index.html` đã có), chèn trước `sizes[editor.slug] = …`:
```ts
  const leaks = scanDistForBrand(dist)
  for (const leak of leaks) console.error(`[${editor.slug}] brand leak "${leak.term}" in ${leak.file}: …${leak.context}…`)
  // `dev` runs on whatever is built; a published build must carry no ArtCraft marks.
  if (leaks.length > 0 && !allowMissing) throw new Error(`[${editor.slug}] ${leaks.length} ArtCraft brand leak(s) in ${dist}`)
```

- [ ] **Step 6: Kiểm cả repo**

Run: `npm test && npm run typecheck && npm run lint`
Expected: test 84/84 (76 cũ + 8 mới), typecheck 0 lỗi, lint 0 lỗi.

Run (fork vẫn có `dist/web` của bản `main` từ Plan A): `node scripts/build-editors.mts --skip-rust`
Expected: in các dòng `[van-ban] brand leak …` rồi throw `[van-ban] N ArtCraft brand leak(s) in …`. Guard dừng ở editor đầu tiên, đây là bằng chứng nó bắt được bản build cũ. `src/generated/editor-sizes.json` không đổi vì throw xảy ra trước khi ghi (kiểm bằng `git diff --stat src/generated`).
Run: `node scripts/build-editors.mts --skip-rust --allow-missing`
Expected: in leak của cả 4 editor nhưng không throw (đường `dev`). Sau đó chạy `git checkout -- src/generated/editor-sizes.json` nếu tệp bị ghi lại khác đi.

- [ ] **Step 7: Commit** (chỉ khi được phép)

```bash
git add src/lib/build/fork-guard.ts src/lib/build/fork-guard.test.ts scripts/build-editors.mts
git commit -m "build: refuse fork builds off the erpcons branch or with ArtCraft marks"
```

---

### Task 2: WordCraft — gỡ thương hiệu

**Files:**
- Modify: `crates/ui-egui/src/dialogs.rs:2329-2343`, `chrome.rs:266-282`, `backstage.rs:113-128`, `ribbon.rs:1763`, `keytips.rs:338`, `options.rs:183`, `lib.rs:202,290,1174-1177,1911,2098,3314`
- Modify: `crates/ui-egui/src/i18n/*.tsv` (18 tệp)
- Modify: `crates/engine/src/sample.rs:115`, `crates/formats/src/latex.rs:55`, `crates/mcp/src/server.rs:136-138`, `assets/spelling/en-extra.txt:7`
- Modify: `README.md`, `ATTRIBUTION.md`; Delete: `docs/brand/`; Create: `ERPCONS-CHANGES.md`

**Interfaces:** không có gì cho task khác.

Thư mục làm việc: `/g/workspace/erpcons-workspace/wordcraft`.

- [ ] **Step 1: Sửa test trước (đỏ)**

`crates/ui-egui/src/lib.rs` dòng 2098, bỏ `"ui.discord"`:
```rust
        for id in ["file.new", "file.open", "ui.backstage", "ui.tab", "file.options", "ui.theme"] {
```
Dòng 3314, mốc nhận biết trang Options đổi sang một ô có sẵn:
```rust
            assert!(h.query_by_label("Dark page (white text on black)").is_some(), "hook {hook}: the Options page rendered");
```
Thêm test mới vào `mod tests` (ngay sau `fn the_default_app_button_shows_only_with_the_hosts_hook`):
```rust
    /// The ERPCons fork credits WordCraft's authors in words and links its own source (ArtCraft
    /// brand terms: forks drop the marks and the community links).
    #[test]
    fn about_credits_upstream_without_artcraft_links() {
        use egui_kittest::kittest::Queryable;
        let mut a = app();
        a.run("ui.dialog", json!({"name": "about"})).unwrap();
        let mut h = harness(a);
        h.run_steps(4);
        assert!(h.query_by_label("ERPCons Văn phòng — dựa trên WordCraft của nhóm ArtCraft. MIT OR Apache-2.0.").is_some());
        assert!(h.query_by_label("Source code: github.com/tuananhfr/wordcraft").is_some());
        assert!(h.query_by_label_contains("Discord").is_none());
        assert!(h.query_by_label_contains("getartcraft").is_none());
        assert!(h.state_mut().run("ui.discord", json!({})).is_err(), "the Discord command is gone");
    }
```

Run: `cargo test -p wordcraft-ui-egui --lib about_credits_upstream_without_artcraft_links`
Expected: FAIL — không tìm thấy nhãn `ERPCons Văn phòng — …`.

- [ ] **Step 2: About**

`crates/ui-egui/src/dialogs.rs`, thay khối từ `ui.label(tl!(` (mô tả) tới hết `ui.label(egui::RichText::new(tl!("MIT OR Apache-2.0. Copyright …")) … );` bằng:
```rust
                    ui.label("ERPCons Văn phòng — dựa trên WordCraft của nhóm ArtCraft. MIT OR Apache-2.0.");
                    ui.add_space(6.0);
                    ui.hyperlink_to("Source code: github.com/tuananhfr/wordcraft", "https://github.com/tuananhfr/wordcraft");
                    ui.add_space(6.0);
                    ui.label(egui::RichText::new("Copyright (c) 2026 ArtCraft Team and the WordCraft contributors.").small().weak());
```

- [ ] **Step 3: Nút Discord ở thanh tiêu đề, Backstage, Ribbon, KeyTips, Options**

`chrome.rs`: xoá cả khối `if app.ui.show_discord { … }` (dòng 266–282, từ `if app.ui.show_discord {` tới `}` đóng ngay trước comment `// Search ("Tell me").`).

`backstage.rs`: thay vòng `for (label, id) in [("About", "about"), ("Discord community", "discord")] { … }` bằng (clippy `single_element_loop` không cho giữ vòng một phần tử):
```rust
                let (r, resp) = ui.allocate_exact_size(vec2(200.0, 32.0), Sense::click());
                resp.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, ui.is_enabled(), tl!("About")));
                if resp.hovered() {
                    ui.painter().rect_filled(r, 0.0, egui::Color32::from_white_alpha(26));
                }
                ui.painter().text(pos2(r.min.x + 22.0, r.center().y), Align2::LEFT_CENTER, tl!("About"), regular(13.0), egui::Color32::WHITE);
                if resp.clicked() {
                    app.dialog = crate::dialogs::Dialog::open("about", app);
                }
```

`ribbon.rs`: xoá dòng `big(ui, app, "discord", "Community\nDiscord", "ui.discord", json!({}), false);`.

`keytips.rs:338`:
```rust
        "Help" => vec![d("Help", "about"), d("Commands", "commands")],
```

`options.rs`: xoá dòng `ui.checkbox(&mut app.ui.show_discord, tl!("Show the community button in the title bar"));`.

`lib.rs`: xoá field `pub show_discord: bool,` (dòng 202), dòng default `show_discord: true,` (290), arm `"ui.discord" => { … json!({}) }` (1174–1177), dòng `| "ui.discord"` (1911). `UiState` là `serde(default)` nên tệp `ui.json` cũ có khoá `show_discord` vẫn đọc được — nếu struct có `deny_unknown_fields` thì DỪNG báo user.

- [ ] **Step 4: Nội dung mẫu, LaTeX, MCP, từ điển**

`crates/engine/src/sample.rs:115`: `link: Some("https://office.erpcons.vn/".into())`.
`crates/formats/src/latex.rs:55`:
```rust
    o.push_str("% Written by WordCraft (https://github.com/tuananhfr/wordcraft).\n");
```
`crates/mcp/src/server.rs`: `"websiteUrl": "https://github.com/tuananhfr/wordcraft"`; dòng instructions:
```rust
                        "{INSTRUCTIONS} Backend: {}. Source: https://github.com/tuananhfr/wordcraft",
```
`assets/spelling/en-extra.txt`: xoá dòng `artcraft`.

- [ ] **Step 5: Bỏ khoá dịch**

Tạo `G:\workspace\erpcons-workspace\erpcons-office\.superpowers\sdd\2026-10-14-erpcons-office-plan-b-forks\strip-catalog-keys.mjs` (thư mục workspace của plan, đã gitignore):
```js
// Usage: node strip-catalog-keys.mjs <dir with *.tsv> <keys file>
// Drops catalog lines whose English source column (2nd, TAB-separated) is listed in the keys file,
// one key per line, written as in the TSV (a literal \n stays backslash-n). Keeps each file's EOL.
import fs from 'node:fs'
import path from 'node:path'
const [dir, keysFile] = process.argv.slice(2)
const keys = new Set(fs.readFileSync(keysFile, 'utf8').split(/\r?\n/).filter(Boolean))
let total = 0
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.tsv')).sort()) {
  const file = path.join(dir, name)
  const text = fs.readFileSync(file, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(eol)
  const kept = lines.filter((line) => { const cols = line.split('\t'); return !(cols.length >= 3 && keys.has(cols[1])) })
  const removed = lines.length - kept.length
  total += removed
  if (removed > 0) fs.writeFileSync(file, kept.join(eol))
  console.log(`${name}: -${removed}`)
}
console.log(`removed ${total}`)
```
Tạo `…/wordcraft-keys.txt` cùng thư mục, đúng 10 dòng:
```
A free, open-source word processor written from scratch in Rust.\nPart of the Crafting Apps from the ArtCraft team.
Community\nDiscord
Discord
Discord community
Join the ArtCraft community on Discord
Join us on Discord: discord.gg/artcraft
MIT OR Apache-2.0. Copyright (c) 2026 ArtCraft Team and the WordCraft contributors.
Show the community button in the title bar
Source code: github.com/storytold/wordcraft
getartcraft.com/apps/wordcraft
```
Run: `node <workspace>/strip-catalog-keys.mjs crates/ui-egui/src/i18n <workspace>/wordcraft-keys.txt`
Expected: 18 dòng `xx.tsv: -10`, `removed 180`.
Run: `grep -ciE "artcraft|discord" crates/ui-egui/src/i18n/*.tsv`
Expected: mọi tệp `:0`.

- [ ] **Step 6: Test xanh**

Run: `cargo test -p wordcraft-ui-egui --lib about_credits_upstream_without_artcraft_links`
Expected: PASS.

- [ ] **Step 7: README, docs/brand, ATTRIBUTION, ERPCONS-CHANGES**

`git rm -r docs/brand`.
`ATTRIBUTION.md`: xoá mọi dòng bảng có `docs/brand/` (dòng 57–65 lúc viết plan) và câu/đoạn chính sách nhắc tới ngoại lệ thương hiệu ArtCraft nếu có.
`README.md`:
- Xoá khối `<p align="center"><a href="https://getartcraft.com/">…</p>` ở đầu (logo).
- Thay `<i>By the ArtCraft team.</i>` bằng `<i>ERPCons fork, based on WordCraft by the ArtCraft team.</i>`.
- Xoá badge Discord, dòng link getartcraft/"All Crafting Apps", blockquote `> **ArtCraft is a community…**`, mục mục lục "The Crafting Apps", cả mục `## The Crafting Apps` cùng khối cộng đồng Discord bên dưới (tới trước heading `##` kế tiếp), đoạn nhãn hiệu "The ArtCraft name, wordmark and logos in docs/brand/…", và logo cuối trang.
- Ngay sau `<h1 align="center">WordCraft</h1>` thêm:
```markdown
> **ERPCons fork.** This is the ERPCons Văn phòng fork of WordCraft, based on WordCraft by the ArtCraft team (MIT OR Apache-2.0). It runs at https://office.erpcons.vn/van-ban/. ArtCraft names and logos are removed as their brand terms require; see [ERPCONS-CHANGES.md](ERPCONS-CHANGES.md).
```
Run: `grep -nEi "getartcraft|discord|docs/brand|crafting apps|artcraft" README.md ATTRIBUTION.md`
Expected: chỉ còn 2 dòng: dòng `<i>ERPCons fork, based on WordCraft by the ArtCraft team.</i>` và dòng `> **ERPCons fork.** …`.

`ERPCONS-CHANGES.md`:
```markdown
# ERPCons changes

This branch (`erpcons`) is the ERPCons Văn phòng fork of [WordCraft](https://github.com/storytold/wordcraft), based on WordCraft by the ArtCraft team, licensed MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`). Changes from upstream `main` (Apache-2.0 §4b):

- Removed the ArtCraft logos and marks (`docs/brand/`) and every link to the ArtCraft Discord and getartcraft.com, as the ArtCraft brand terms require for forks: About dialog, title-bar Discord button and its Options switch, Backstage and ribbon Discord entries, the `ui.discord` command, README.
- About now reads "ERPCons Văn phòng — dựa trên WordCraft của nhóm ArtCraft. MIT OR Apache-2.0." and links this fork's source.
- Sample document, LaTeX export header and MCP server info point at this fork or office.erpcons.vn instead of getartcraft.com.
- Dropped the translations of the removed strings and the word "artcraft" from the extra spelling list.
```

- [ ] **Step 8: CI của fork**

Run: `cargo xtask ci 2>&1 | tee /tmp/wordcraft-ci.log | tail -30`
Expected: kết thúc thành công, không lỗi clippy. Nếu compiler báo import không dùng (vd. `icons` trong `chrome.rs`) thì xoá đúng import đó rồi chạy lại.

- [ ] **Step 9: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "Remove ArtCraft marks and community links for the ERPCons fork"
```

---

### Task 3: GridCraft — gỡ thương hiệu

**Files:**
- Modify: `crates/ui-egui/src/dialogs.rs:1489-1491`, `crates/ui-egui/src/i18n/pt.rs:664`
- Modify: `README.md`, `ATTRIBUTION.md`; Delete: `docs/brand/`; Create: `ERPCONS-CHANGES.md`

**Interfaces:**
- Produces: `ERPCONS-CHANGES.md` có gạch đầu dòng mà Task 4 sẽ thêm một dòng về font.

Thư mục làm việc: `/g/workspace/erpcons-workspace/gridcraft`.

- [ ] **Step 1: Test About (đỏ)**

`crates/ui-egui/tests/interaction.rs`, thêm ngay sau `fn about_renders_every_tab` (tệp đã có `harness`, `blank`, `json!`, `Queryable as _`):
```rust
#[test]
fn about_credits_upstream_without_artcraft_links() {
    // The ERPCons fork credits GridCraft's authors in words and links its own source.
    let mut h = harness(blank());
    h.state_mut().open_dialog("about", json!({"tab": "About"}));
    h.run_steps(2);
    h.get_by_label("ERPCons Văn phòng — dựa trên GridCraft của nhóm ArtCraft. MIT OR Apache-2.0.");
    h.get_by_label("Source on GitHub");
    assert!(h.query_by_label_contains("Discord").is_none());
    assert!(h.query_by_label_contains("getartcraft").is_none());
}
```

Run: `cargo test -p gridcraft-ui-egui --test interaction about_credits_upstream_without_artcraft_links`
Expected: FAIL — không tìm thấy nhãn `ERPCons Văn phòng — …`.

- [ ] **Step 2: Sửa About + bản dịch**

`crates/ui-egui/src/dialogs.rs`, thay 3 dòng:
```rust
            ui.label("A clean-room, open-source, Rust-native spreadsheet. Part of ArtCraft.");
            ui.hyperlink_to("getartcraft.com/apps/gridcraft", "https://getartcraft.com/apps/gridcraft");
            ui.hyperlink_to("Join the ArtCraft Discord", "https://discord.gg/artcraft");
```
bằng:
```rust
            ui.label("A clean-room, open-source, Rust-native spreadsheet.");
            ui.label("ERPCons Văn phòng — dựa trên GridCraft của nhóm ArtCraft. MIT OR Apache-2.0.");
            ui.hyperlink_to("Source on GitHub", "https://github.com/tuananhfr/gridcraft");
```
`crates/ui-egui/src/i18n/pt.rs`: xoá dòng `"Join the ArtCraft Discord" => "Participe do Discord da ArtCraft",`.

- [ ] **Step 3: Test xanh**

Run: `cargo test -p gridcraft-ui-egui --test interaction about_credits_upstream_without_artcraft_links`
Expected: PASS.

- [ ] **Step 4: README, docs/brand, ATTRIBUTION, ERPCONS-CHANGES**

`git rm -r docs/brand`.
`ATTRIBUTION.md`: xoá 9 dòng bảng `docs/brand/…` (dòng 11–19 lúc viết plan) và câu `The one exception is the ArtCraft brand files in `docs/brand/`: ArtCraft trademarks, not open source, used under `docs/brand/LICENSE-brand.txt`.` trong đoạn Policy.
`README.md`: làm đúng các thao tác như WordCraft:
- Xoá khối logo đầu trang.
- Thay `<i>By the ArtCraft team.</i>` bằng `<i>ERPCons fork, based on GridCraft by the ArtCraft team.</i>`.
- Xoá badge Discord, link getartcraft/"All Crafting Apps", blockquote cộng đồng, mục lục "The Crafting Apps", mục `## The Crafting Apps` + khối Discord, đoạn nhãn hiệu, logo cuối.
- Sau `<h1 align="center">GridCraft</h1>` thêm:
```markdown
> **ERPCons fork.** This is the ERPCons Văn phòng fork of GridCraft, based on GridCraft by the ArtCraft team (MIT OR Apache-2.0). It runs at https://office.erpcons.vn/bang-tinh/. ArtCraft names and logos are removed as their brand terms require; see [ERPCONS-CHANGES.md](ERPCONS-CHANGES.md).
```
Run: `grep -nEi "getartcraft|discord|docs/brand|crafting apps|artcraft" README.md ATTRIBUTION.md`
Expected: chỉ 2 dòng ghi nguồn vừa thêm (`<i>ERPCons fork…` và `> **ERPCons fork.**…`).

`ERPCONS-CHANGES.md`:
```markdown
# ERPCons changes

This branch (`erpcons`) is the ERPCons Văn phòng fork of [GridCraft](https://github.com/storytold/gridcraft), based on GridCraft by the ArtCraft team, licensed MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`). Changes from upstream `main` (Apache-2.0 §4b):

- Removed the ArtCraft logos and marks (`docs/brand/`) and the links to the ArtCraft Discord and getartcraft.com from the About dialog and README, as the ArtCraft brand terms require for forks.
- About now reads "ERPCons Văn phòng — dựa trên GridCraft của nhóm ArtCraft. MIT OR Apache-2.0." and links this fork's source.
```

- [ ] **Step 5: CI của fork**

Run: `cargo xtask ci 2>&1 | tee /tmp/gridcraft-ci.log | tail -30`
Expected: thành công.

- [ ] **Step 6: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "Remove ArtCraft marks and community links for the ERPCons fork"
```

---

### Task 4: GridCraft — Inter từ craft-fonts để hiện tiếng Việt trên web

Nguyên nhân gốc: trên wasm, `try_load` và `load_fallback` trả rỗng nên mọi họ font rơi về font mặc định của egui, thiếu phần lớn chữ có dấu tiếng Việt.

**Files:**
- Modify: `crates/ui-egui/build.rs` (thêm `write_craft_fonts`)
- Create: `crates/ui-egui/src/craft_fonts.rs`
- Modify: `crates/ui-egui/src/lib.rs` (khai `mod craft_fonts;`)
- Modify: `crates/ui-egui/src/theme.rs:388-475` (bộ nạp tiêm vào + `bundled_faces`) và `mod tests`
- Modify: `.cargo/config.toml`, `.github/workflows/release.yml:27`, `ERPCONS-CHANGES.md`

**Interfaces:**
- Consumes: `ERPCONS-CHANGES.md` từ Task 3.
- Produces: `crate::craft_fonts::CRAFT_FONTS: &[CraftFont]` (`family`, `style`, `bytes`); `theme::definitions_from(language, used, load: &Loader) -> FontDefinitions` (private).

Thư mục làm việc: `/g/workspace/erpcons-workspace/gridcraft`.

- [ ] **Step 1: Đầu vào build: craft-fonts**

`.github/workflows/release.yml` dòng 27:
```yaml
      craft-fonts-ref: 43913056ce82a3fdad0ef69f6b88d1dc922a8104
```
`.cargo/config.toml` thêm lên đầu tệp:
```toml
# Local builds and tests embed the craft-fonts checkout next to this repo (build.rs warns and
# continues without it). erpcons-office and releases set CRAFT_FONTS_DIR explicitly.
[env]
CRAFT_FONTS_DIR = { value = "../craft-fonts", relative = true }
```
Kiểm: `git -C ../craft-fonts log -1 --format=%H` → `43913056ce82a3fdad0ef69f6b88d1dc922a8104` và `ls ../craft-fonts/fonts/latin-manifest.txt` có tệp.

- [ ] **Step 2: `build.rs` sinh `craft_fonts.rs`**

Trong `crates/ui-egui/build.rs`, cuối `fn main()` thêm dòng `write_craft_fonts();`. Cuối tệp thêm:
```rust
/// Inter Regular/Bold from a craft-fonts checkout (`CRAFT_FONTS_DIR`, its `fonts/latin-manifest.txt`),
/// embedded as `CRAFT_FONTS`: the web build loads no system font. Unset, `CRAFT_FONTS` is empty.
fn write_craft_fonts() {
    println!("cargo::rerun-if-env-changed=CRAFT_FONTS_DIR");
    println!("cargo::rerun-if-env-changed=CRAFT_FONTS_REQUIRED");
    let mut src = String::from("pub static CRAFT_FONTS: &[CraftFont] = &[\n");
    if let Some(dir) = std::env::var_os("CRAFT_FONTS_DIR").map(std::path::PathBuf::from) {
        match inter_faces(&dir) {
            Ok(entries) => src.push_str(&entries),
            Err(e) if std::env::var_os("CRAFT_FONTS_REQUIRED").is_some() => println!("cargo::error=CRAFT_FONTS_DIR={}: {e}", dir.display()),
            Err(e) => println!("cargo::warning=building without craft-fonts: CRAFT_FONTS_DIR={}: {e}", dir.display()),
        }
    }
    src.push_str("];\n");
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap_or_default()).join("craft_fonts.rs");
    if let Err(e) = std::fs::write(&out, src) {
        println!("cargo::error=writing {}: {e}", out.display());
    }
}

fn inter_faces(dir: &std::path::Path) -> Result<String, String> {
    let manifest = dir.join("fonts/latin-manifest.txt");
    println!("cargo::rerun-if-changed={}", manifest.display());
    let text = std::fs::read_to_string(&manifest).map_err(|e| format!("{}: {e}", manifest.display()))?;
    let mut out = String::new();
    for style in ["Regular", "Bold"] {
        let file = text
            .lines()
            .map(|l| l.split(" | ").map(str::trim).collect::<Vec<_>>())
            .find(|f| f.len() >= 3 && f[0] == "Inter" && f[1] == style)
            .map(|f| f[2].to_string())
            .ok_or_else(|| format!("{} lists no Inter {style}", manifest.display()))?;
        let path = dir.join(&file).canonicalize().map_err(|e| format!("{file}: {e}"))?;
        println!("cargo::rerun-if-changed={}", path.display());
        let _ = writeln!(out, "    CraftFont {{ family: \"Inter\", style: {style:?}, bytes: include_bytes!({:?}) }},", path.display().to_string());
    }
    Ok(out)
}
```
(`use std::fmt::Write as _;` đã có ở đầu `build.rs`.)

`crates/ui-egui/src/craft_fonts.rs`:
```rust
//! Fonts embedded from craft-fonts at build time (see `build.rs`).

pub struct CraftFont {
    pub family: &'static str,
    pub style: &'static str,
    pub bytes: &'static [u8],
}

include!(concat!(env!("OUT_DIR"), "/craft_fonts.rs"));
```
`crates/ui-egui/src/lib.rs`: thêm `mod craft_fonts;` vào danh sách module (theo thứ tự chữ cái, sau `mod cell_pictures;`).

Run: `cargo build -p gridcraft-ui-egui 2>&1 | tail -5`
Expected: build thành công (có thể có cảnh báo `CRAFT_FONTS` chưa dùng — hết ở Step 6).

- [ ] **Step 3: Tiêm bộ nạp tệp font (refactor, không đổi hành vi)**

`crates/ui-egui/src/theme.rs`:
- Thêm gần đầu tệp (sau các `use`):
```rust
/// Reads a font file from candidate paths; injectable so a test can stand in for the web host.
type Loader = dyn Fn(&[(&str, u32)]) -> Option<FontData>;
```
- Đổi `pub fn font_definitions_with(...)` thành:
```rust
pub fn font_definitions_with(language: crate::i18n::Language, used: &[String]) -> FontDefinitions {
    definitions_from(language, used, &try_load)
}

fn definitions_from(language: crate::i18n::Language, used: &[String], load: &Loader) -> FontDefinitions {
```
  rồi giữ nguyên thân hàm cũ, với hai thay đổi: `load_fallback(&mut fonts, HanOrder::of(language))` → `load_fallback(&mut fonts, HanOrder::of(language), load)`, và `if let Some(fd) = try_load(&refs)` → `if let Some(fd) = load(&refs)`. Doc comment cũ của `font_definitions_with` giữ trên `font_definitions_with`.
- `load_fallback` bản native: thêm tham số `load: &Loader` và đổi `try_load(&[(path.as_str(), *index)])` → `load(&[(path.as_str(), *index)])`. Bản wasm: `fn load_fallback(_fonts: &mut FontDefinitions, _han: HanOrder, _load: &Loader) -> Vec<String>`.

Run: `cargo test -p gridcraft-ui-egui --lib theme::tests`
Expected: PASS, số test như trước khi sửa.

- [ ] **Step 4: Test tiếng Việt khi không có font hệ thống (đỏ)**

Thêm vào `mod tests` của `theme.rs`:
```rust
    #[test]
    fn without_system_fonts_every_family_draws_vietnamese() {
        // The web build: no font file loads (try_load is a stub on wasm), and egui's own fonts lack
        // most Vietnamese letters, so the bundled Inter must cover every role.
        assert!(!crate::craft_fonts::CRAFT_FONTS.is_empty(), "built without CRAFT_FONTS_DIR (.cargo/config.toml points at ../craft-fonts)");
        let ctx = egui::Context::default();
        ctx.set_fonts(definitions_from(Language::En, &[], &|_: &[(&str, u32)]| None));
        let mut out = ctx.run_ui(egui::RawInput::default(), |_ui| {});
        out.textures_delta.clear(); // nothing consumes the atlas in a headless test
        let sample = "Tiếng Việt ăâđêôơư ạảãấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ ĂÂĐÊÔƠƯ ỆỮ";
        let mut families = vec![FontFamily::Proportional];
        families.extend([UI, UI_BOLD, CELL, CELL_BOLD, CELL_ITALIC, CELL_BOLD_ITALIC, SERIF, MONO].map(|r| FontFamily::Name(r.into())));
        for family in families {
            let font = FontId::new(14.0, family.clone());
            let glyphs = |text: &str| {
                let galley = ctx.fonts_mut(|f| f.layout_no_wrap(text.to_owned(), font.clone(), Color32::BLACK));
                galley.rows.iter().flat_map(|r| r.glyphs.iter().filter(|g| g.chr != ' ').map(|g| g.uv_rect)).collect::<Vec<_>>()
            };
            let tofu = glyphs("\u{25FB}");
            let drawn = glyphs(sample);
            assert!(!drawn.is_empty() && drawn.iter().all(|g| !tofu.contains(g)), "{family:?} draws Vietnamese as tofu");
        }
    }
```

Run: `cargo test -p gridcraft-ui-egui --lib without_system_fonts_every_family_draws_vietnamese`
Expected: FAIL với `Proportional draws Vietnamese as tofu` (Inter chưa nằm trong chuỗi nào).

- [ ] **Step 5: Gắn Inter vào mọi vai trò**

Trong `theme.rs` thêm hàm (cạnh `load_fallback`):
```rust
/// Registers the bundled Inter faces and returns their keys (regular, bold). Each role carries one
/// right after its system face, so a host with no usable font file still draws Vietnamese.
fn bundled_faces(fonts: &mut FontDefinitions) -> (Option<String>, Option<String>) {
    let mut register = |style: &str| {
        crate::craft_fonts::CRAFT_FONTS.iter().find(|f| f.family == "Inter" && f.style == style).map(|f| {
            let key = format!("craft-inter-{}", style.to_ascii_lowercase());
            fonts.font_data.insert(key.clone(), Arc::new(FontData::from_static(f.bytes)));
            key
        })
    };
    let regular = register("Regular");
    (regular, register("Bold"))
}
```
Trong `definitions_from`, ngay sau dòng `let fallback = load_fallback(...)`:
```rust
    let (inter, inter_bold) = bundled_faces(&mut fonts);
```
Và trong vòng `for role in [...]`, thay dòng:
```rust
        chain.extend(if role == MONO { base_mono.clone() } else { base_prop.clone() });
```
bằng:
```rust
        let bundled = if matches!(role, UI_BOLD | CELL_BOLD | CELL_BOLD_ITALIC) { inter_bold.clone() } else { inter.clone() };
        // Mono keeps its monospaced Latin first; Inter only fills the letters it lacks.
        if role == MONO {
            chain.extend(base_mono.clone());
            chain.extend(bundled);
        } else {
            chain.extend(bundled);
            chain.extend(base_prop.clone());
        }
```

- [ ] **Step 6: Test xanh + các test font cũ**

Run: `cargo test -p gridcraft-ui-egui --lib theme::tests`
Expected: PASS toàn bộ, kể cả `fallback_faces_are_appended_to_every_family`, `interface_families_fall_back_to_the_cell_font`, `fallback_covers_its_script` và test mới.

Run: `cargo check -p gridcraft-web --target wasm32-unknown-unknown 2>&1 | tail -3` (tên package lấy từ `apps/gridcraft-web/Cargo.toml` nếu khác)
Expected: `Finished`.

- [ ] **Step 7: Ghi nhận**

`ERPCONS-CHANGES.md` thêm gạch đầu dòng:
```markdown
- The web build embeds Inter Regular/Bold (OFL-1.1) from [craft-fonts](https://github.com/storytold/craft-fonts) at `43913056` (`crates/ui-egui/build.rs`) and puts it in every font family after the system face, so Vietnamese renders where no system font can be loaded. `craft-fonts-ref` in `release.yml` and `.cargo/config.toml` point at that checkout.
```

- [ ] **Step 8: CI của fork**

Run: `cargo xtask ci 2>&1 | tee /tmp/gridcraft-ci.log | tail -30`
Expected: thành công.

- [ ] **Step 9: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "Embed Inter from craft-fonts so the web build renders Vietnamese"
```

---

### Task 5: DeckCraft — gỡ thương hiệu

**Files:**
- Modify: `crates/engine/src/links.rs`, `crates/ui-egui/src/dialogs.rs:783-800`, `crates/ui-egui/src/backstage.rs:667-668,1237`, `crates/ui-egui/src/ribbon.rs:1773-1777`, `crates/ui-egui/src/lib.rs:171,548-551`, `apps/deckcraft-cli/src/main.rs:75-83`, `crates/mcp/src/server.rs:138-145`
- Modify: `README.md`, `ATTRIBUTION.md`; Delete: `docs/brand/`; Create: `ERPCONS-CHANGES.md`

**Interfaces:**
- Produces: `deckcraft_engine::links::{GITHUB, ISSUES}` (bỏ `DISCORD`, `WEBSITE`, `APPS`, `APP_PAGE`). Task 6 thêm một dòng vào `ERPCONS-CHANGES.md`.

Thư mục làm việc: `/g/workspace/erpcons-workspace/deckcraft`.

- [ ] **Step 1: Test (đỏ)**

Thêm vào `mod tests` ở `crates/ui-egui/src/lib.rs`:
```rust
    #[test]
    fn about_credits_upstream_without_artcraft_links() {
        use egui_kittest::kittest::Queryable;
        let mut harness = egui_kittest::Harness::builder().with_size(egui::vec2(1200.0, 800.0)).build_ui_state(
            |ui, app: &mut SlideApp| {
                app.logic(ui.ctx());
                app.ui(ui);
            },
            SlideApp::new(Session::with_new(), Services::default()),
        );
        harness.state_mut().run("app.about", json!({})).unwrap();
        harness.run_steps(4);
        assert!(harness.query_by_label("ERPCons Văn phòng — dựa trên DeckCraft của nhóm ArtCraft. MIT OR Apache-2.0.").is_some());
        assert!(harness.query_by_label_contains("Discord").is_none());
        assert!(harness.query_by_label_contains("getartcraft").is_none());
        let links = harness.state_mut().run("app.links", json!({})).unwrap();
        assert_eq!(links, json!({"github": "https://github.com/tuananhfr/deckcraft", "issues": "https://github.com/tuananhfr/deckcraft/issues"}));
    }
```
Run: `cargo test -p deckcraft-ui-egui --lib about_credits_upstream_without_artcraft_links`
Expected: FAIL — không tìm thấy nhãn `ERPCons Văn phòng — …`.

- [ ] **Step 2: `links.rs`**

Toàn bộ `crates/engine/src/links.rs`:
```rust
//! Project links (shown in Help, About, the CLI and MCP). The ERPCons fork links its own source,
//! not the ArtCraft pages (their brand terms).

pub const GITHUB: &str = "https://github.com/tuananhfr/deckcraft";
pub const ISSUES: &str = "https://github.com/tuananhfr/deckcraft/issues";
```

- [ ] **Step 3: About, Backstage, Ribbon, lệnh `app.links`**

`dialogs.rs`, trong `pub fn about`, thay các dòng từ `ui.hyperlink_to("Join our community on Discord", …)` tới hết dòng copyright bằng:
```rust
        ui.label("ERPCons Văn phòng — dựa trên DeckCraft của nhóm ArtCraft. MIT OR Apache-2.0.");
        ui.add_space(6.0);
        ui.hyperlink_to("Source on GitHub", deckcraft_engine::links::GITHUB);
        ui.add_space(6.0);
        ui.label(egui::RichText::new("© 2026 ArtCraft Team and the DeckCraft contributors").size(11.0).color(t.text_faint));
```
(`paint_logo` là logo riêng của DeckCraft, giữ nguyên.)

`backstage.rs`: xoá hai dòng cuối hàm trang Home:
```rust
    ui.add_space(30.0);
    ui.hyperlink_to("Join the ArtCraft community on Discord", deckcraft_engine::links::DISCORD);
```
và ở trang Account xoá dòng `ui.hyperlink_to("Join our community on Discord", deckcraft_engine::links::DISCORD);` (giữ dòng "Source on GitHub").

`ribbon.rs`: xoá cả nhóm:
```rust
    group(ui, |ui| {
        if big_button(ui, Icon::Help, "Learn\nMore", true).clicked() {
            app.open_url(deckcraft_engine::links::APP_PAGE);
        }
    });
```

`lib.rs:171`: `("app.links", "Project Links", None, "{}"),`
`lib.rs:548-551`:
```rust
            "app.links" => {
                use deckcraft_engine::links::*;
                return Ok(json!({"github": GITHUB, "issues": ISSUES}));
            }
```

- [ ] **Step 4: CLI, MCP**

`apps/deckcraft-cli/src/main.rs`:
```rust
        Some("links") => {
            use deckcraft_engine::links::*;
            outln!("GitHub    {GITHUB}\nIssues    {ISSUES}");
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("{USAGE}");
            eprintln!("\nSource: {}", deckcraft_engine::links::GITHUB);
            ExitCode::FAILURE
        }
```
`crates/mcp/src/server.rs`:
```rust
                    "serverInfo": {"name": "deckcraft", "title": "DeckCraft", "version": env!("CARGO_PKG_VERSION"), "websiteUrl": deckcraft_engine::links::GITHUB},
                    "instructions": format!(
                        "{INSTRUCTIONS} Backend: {}. Source: {}. The `app.links` command returns the project links.",
                        self.backend.describe(),
                        deckcraft_engine::links::GITHUB
                    ),
```
Run: `git grep -n "links::\(DISCORD\|WEBSITE\|APPS\|APP_PAGE\)"`
Expected: không có kết quả.

- [ ] **Step 5: Test xanh**

Run: `cargo test -p deckcraft-ui-egui --lib about_credits_upstream_without_artcraft_links`
Expected: PASS.

- [ ] **Step 6: README, docs/brand, ATTRIBUTION, ERPCONS-CHANGES**

`git rm -r docs/brand`. `ATTRIBUTION.md`: xoá mọi dòng bảng `docs/brand/…`.
`README.md`:
- Xoá khối logo đầu trang, badge Discord, dòng link getartcraft/"All Crafting Apps", blockquote cộng đồng, mục lục "The Crafting Apps", mục `## The Crafting Apps` cùng khối Discord và hàng link `discord.gg/artcraft · getartcraft.com · …` (tới trước `## License and credits`), đoạn nhãn hiệu, logo cuối.
- Sau `<h1 align="center">DeckCraft</h1>` thêm:
```markdown
> **ERPCons fork.** This is the ERPCons Văn phòng fork of DeckCraft, based on DeckCraft by the ArtCraft team (MIT OR Apache-2.0). It runs at https://office.erpcons.vn/trinh-chieu/. ArtCraft names and logos are removed as their brand terms require; see [ERPCONS-CHANGES.md](ERPCONS-CHANGES.md).
```
Run: `grep -nEi "getartcraft|discord|docs/brand|crafting apps|artcraft" README.md ATTRIBUTION.md`
Expected: chỉ dòng `> **ERPCons fork.** …`.

`ERPCONS-CHANGES.md`:
```markdown
# ERPCons changes

This branch (`erpcons`) is the ERPCons Văn phòng fork of [DeckCraft](https://github.com/storytold/deckcraft), based on DeckCraft by the ArtCraft team, licensed MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`). Changes from upstream `main` (Apache-2.0 §4b):

- Removed the ArtCraft logos and marks (`docs/brand/`) and every link to the ArtCraft Discord and getartcraft.com, as the ArtCraft brand terms require for forks: About dialog, Backstage Home and Account, the ribbon's "Learn More" group, `app.links`, the CLI and the MCP server info, README.
- About now reads "ERPCons Văn phòng — dựa trên DeckCraft của nhóm ArtCraft. MIT OR Apache-2.0."; source links point at this fork.
```

- [ ] **Step 7: CI của fork**

Run: `cargo xtask ci 2>&1 | tee /tmp/deckcraft-ci.log | tail -30`
Expected: thành công.

- [ ] **Step 8: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "Remove ArtCraft marks and community links for the ERPCons fork"
```

---

### Task 6: DeckCraft — web lưu `.pptx`

Nguyên nhân gốc: `save()`, `"app.saveAsDialog"` và `UiRequest::PickFile{saveAs}` đều gọi cứng `save_as_dialog("deckcraft")`. Trên web không có đường dẫn, nên mọi lần lưu đều tải về `.deckcraft`. Nhánh download cũng không đánh dấu tài liệu đã lưu.

**Files:**
- Modify: `crates/ui-egui/src/lib.rs:542,602-625,641-650,664-668` + `mod tests`
- Modify: `ERPCONS-CHANGES.md`

**Interfaces:**
- Consumes: `ERPCONS-CHANGES.md` từ Task 5.
- Produces: `SlideApp::default_save_format(&self) -> &'static str` (private).

Thư mục làm việc: `/g/workspace/erpcons-workspace/deckcraft`.

- [ ] **Step 1: Test (đỏ)**

Thêm vào `mod tests` ở `crates/ui-egui/src/lib.rs`:
```rust
    #[test]
    fn web_save_downloads_pptx_and_clears_the_unsaved_mark() {
        let saved: std::rc::Rc<std::cell::RefCell<Vec<(String, Vec<u8>)>>> = Default::default();
        let sink = saved.clone();
        let services = Services {
            download: Some(Box::new(move |name: &str, bytes: &[u8]| sink.borrow_mut().push((name.to_owned(), bytes.to_vec())))),
            ..Default::default()
        };
        let mut app = SlideApp::new(Session::with_new(), services);
        {
            let d = app.session.active_mut().unwrap();
            d.doc = std::sync::Arc::new((*d.doc).clone());
        }
        assert!(app.session.active().unwrap().is_dirty());
        app.save();
        let saved = saved.borrow();
        assert_eq!(saved.len(), 1, "one download");
        assert!(saved[0].0.ends_with(".pptx"), "downloaded as {}", saved[0].0);
        assert!(saved[0].1.starts_with(b"PK"), "a .pptx is a zip");
        assert!(!app.session.active().unwrap().is_dirty(), "the download counts as saved");
    }

    #[test]
    fn desktop_save_as_still_suggests_deckcraft() {
        let asked: std::rc::Rc<std::cell::RefCell<Vec<String>>> = Default::default();
        let seen = asked.clone();
        let services = Services {
            pick_save: Some(Box::new(move |suggested: &str| {
                seen.borrow_mut().push(suggested.to_owned());
                None
            })),
            ..Default::default()
        };
        let mut app = SlideApp::new(Session::with_new(), services);
        app.save();
        assert!(asked.borrow().first().is_some_and(|s| s.ends_with(".deckcraft")), "{:?}", asked.borrow());
    }
```
Run: `cargo test -p deckcraft-ui-egui --lib web_save_downloads_pptx_and_clears_the_unsaved_mark desktop_save_as_still_suggests_deckcraft`
(nếu cargo không nhận hai filter, chạy riêng từng tên)
Expected: `web_save_…` FAIL với `downloaded as Presentation 1.deckcraft` (tên có thể khác, đuôi `.deckcraft`); `desktop_save_…` PASS (đã đúng từ trước, giữ làm rào chắn).

- [ ] **Step 2: Cài đặt**

Trong `impl SlideApp` (cạnh `save_as_dialog`) thêm:
```rust
    /// Format Save writes when nothing names one. A host with only a download sink (the web) gets
    /// .pptx, which people can open again anywhere; ERPCons decision 2026-10-14.
    fn default_save_format(&self) -> &'static str {
        if self.services.pick_save.is_none() && self.services.download.is_some() { "pptx" } else { "deckcraft" }
    }
```
Thay 3 chỗ `self.save_as_dialog("deckcraft")` (trong `"app.saveAsDialog"`, `save()`, `UiRequest::PickFile` `saveAs`) bằng `self.save_as_dialog(self.default_save_format())`.

Trong `save_as_dialog`, thay nhánh download:
```rust
        } else if let Some(dl) = self.services.download.as_mut()
            && let Some(d) = self.session.active()
        {
            match deckcraft_engine::cmd::file::save_bytes(&d.doc, ext) {
                Ok(bytes) => dl(&suggested, &bytes),
                Err(e) => self.set_status(e.to_string()),
            }
        }
```
bằng:
```rust
        } else if let Some(dl) = self.services.download.as_mut()
            && let Some(d) = self.session.active_mut()
        {
            match deckcraft_engine::cmd::file::save_bytes(&d.doc, ext) {
                Ok(bytes) => {
                    dl(&suggested, &bytes);
                    // The browser never says whether the download finished; without this the tab
                    // would warn about unsaved changes the user just downloaded, forever.
                    d.saved_doc = d.doc.clone();
                }
                Err(e) => self.set_status(e.to_string()),
            }
        }
```

- [ ] **Step 3: Test xanh**

Run hai test ở Step 1.
Expected: cả hai PASS.

- [ ] **Step 4: Ghi nhận**

`ERPCONS-CHANGES.md` thêm:
```markdown
- On a host with no save dialog (the web build), Save and Save As download a `.pptx` for every presentation, including new ones and `.deckcraft` files, and the download marks the presentation saved. Desktop builds still default to `.deckcraft`.
```

- [ ] **Step 5: CI của fork**

Run: `cargo xtask ci 2>&1 | tee /tmp/deckcraft-ci.log | tail -30`
Expected: thành công.

- [ ] **Step 6: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "Save .pptx on the web, where only a download is possible"
```

---

### Task 7: PdfCraft — gỡ thương hiệu, ẩn "Check for updates" trên web

**Files:**
- Modify: `crates/engine/src/links.rs:1-35,523-531`, `crates/engine/src/commands.rs:160,365-369`
- Modify: `crates/ui-egui/src/{home.rs:32-51,chrome.rs:69-73,291-295,dialogs.rs:1097-1122,widgets.rs:502-536,updates.rs:15}`
- Modify: `crates/ui-egui/src/i18n/*.tsv` (21 tệp)
- Modify: `crates/ui-egui/tests/ui_group/links.rs` (viết lại), `crates/ui-egui/tests/ui.rs:333-366,379`
- Modify: `apps/pdfcraft-cli/src/main.rs:73,151-155`, `crates/automation/src/mcp.rs:134`, `xtask/src/screenshots.rs:109-115`
- Modify: `ATTRIBUTION.toml`, `ATTRIBUTION.md` (sinh lại), `docs/images/pdfcraft-tools.png` (sinh lại), `README.md`; Delete: `docs/brand/`; Create: `ERPCONS-CHANGES.md`

**Interfaces:**
- Produces: `pdfcraft_engine::links::{APP, GITHUB, LINKS, for_command}` — `LINKS` chỉ còn `help.github`. Bỏ `DISCORD`, `WEBSITE`, `APP_PAGE`.

Thư mục làm việc: `/g/workspace/erpcons-workspace/pdfcraft`.

- [ ] **Step 1: Test (đỏ)**

Viết lại toàn bộ `crates/ui-egui/tests/ui_group/links.rs`:
```rust
//! Project links: the Help menu and the About dialog open this fork's source. Nothing links to
//! ArtCraft or its Discord: the ERPCons fork drops the marks and community links (brand terms).

use egui_kittest::Harness;
use egui_kittest::kittest::Queryable;
use pdfcraft_engine::links;
use pdfcraft_ui_egui::{Dialog, PdfCraftApp};

fn harness(setup: impl FnOnce(&mut PdfCraftApp) + 'static) -> Harness<'static, PdfCraftApp> {
    let mut h = Harness::builder().with_size(egui::vec2(1400.0, 900.0)).build_eframe(move |_cc| {
        let mut app = PdfCraftApp::new();
        app.set_option("language", "en").unwrap();
        setup(&mut app);
        app
    });
    h.run_steps(4);
    h
}

#[test]
fn the_top_bar_has_no_community_button() {
    let h = harness(|_| {});
    h.get_by_label("Keyboard shortcuts");
    assert!(h.query_by_label("Discord").is_none());
}

#[test]
fn the_home_screen_has_no_community_card() {
    let h = harness(|_| {});
    h.get_by_label("Welcome to PdfCraft");
    assert!(h.query_by_label_contains("ArtCraft").is_none());
    assert!(h.query_by_label_contains("Discord").is_none());
}

#[test]
fn about_credits_upstream_and_links_the_fork() {
    let pdf = b"%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
    // With a document open, so only the dialog's own text is on screen.
    let mut h = harness(move |app| {
        app.open_bytes("one.pdf", None, pdf.to_vec()).unwrap();
        app.dialog = Some(Dialog::About);
    });
    assert_eq!(h.query_all_by_label("ArtCraft").count(), 0, "no ArtCraft mark or wordmark");
    h.get_by_label("ERPCons Văn phòng — dựa trên PdfCraft của nhóm ArtCraft. MIT OR Apache-2.0.");
    h.get_by_label("PdfCraft on GitHub").click();
    h.run_steps(2);
    assert_eq!(h.state().last_opened_url.as_deref(), Some("https://github.com/tuananhfr/pdfcraft"));
}

#[test]
fn help_commands_open_each_link() {
    for l in links::LINKS {
        let mut h = harness(|_| {});
        assert!(h.state_mut().execute(l.command), "{}", l.command);
        assert_eq!(h.state().last_opened_url.as_deref(), Some(l.url));
        assert_eq!(pdfcraft_engine::commands::command(l.command).unwrap().menu, Some("Help"));
    }
}
```
Trong `crates/engine/src/links.rs`, thay test `urls_follow_the_artcraft_scheme` bằng:
```rust
    #[test]
    fn links_point_at_the_erpcons_fork_only() {
        assert_eq!(super::GITHUB, format!("https://github.com/tuananhfr/{}", super::APP));
        for l in super::LINKS {
            assert!(l.url.starts_with("https://github.com/tuananhfr/"), "{}", l.url);
            let label = l.label.to_ascii_lowercase();
            assert!(!label.contains("artcraft") && !label.contains("discord"), "{}", l.label);
            assert!(crate::commands::command(l.command).is_some(), "{} is a registered command", l.command);
        }
    }
```
Run: `cargo test -p pdfcraft-ui-egui --test ui_group links:: 2>&1 | tail -15`
Expected: FAIL — `the_top_bar_has_no_community_button` (còn nút Discord), `the_home_screen_has_no_community_card`, `about_credits_upstream_and_links_the_fork`.
Run: `cargo test -p pdfcraft-engine --lib links_point_at_the_erpcons_fork_only`
Expected: FAIL — GITHUB vẫn là `storytold`.

- [ ] **Step 2: `links.rs` + `commands.rs`**

`crates/engine/src/links.rs`, thay phần đầu tệp (từ doc comment module tới hết `pub fn for_command`) bằng:
```rust
//! Where this fork lives on the web. One table, so the Help menu, the About dialog, the CLI and
//! the README agree. The ERPCons fork links its own source, not the ArtCraft pages (brand terms).

use icu_properties::props::Script;
use std::path::{Path, PathBuf};

/// The app's name in the fork's URL (`github.com/tuananhfr/{APP}`).
pub const APP: &str = "pdfcraft";

pub const GITHUB: &str = "https://github.com/tuananhfr/pdfcraft";

/// A link and the registry command that opens it.
#[derive(Clone, Copy, Debug)]
pub struct Link {
    pub command: &'static str,
    pub label: &'static str,
    pub url: &'static str,
    /// Lucide icon name.
    pub icon: &'static str,
}

pub const LINKS: &[Link] = &[Link { command: "help.github", label: "PdfCraft on GitHub", url: GITHUB, icon: "code-xml" }];

pub fn for_command(id: &str) -> Option<&'static Link> {
    LINKS.iter().find(|l| l.command == id)
}
```
(giữ nguyên các dòng `use` nếu phần sau tệp cần chúng — chúng đã có ở bản gốc.)

`crates/engine/src/commands.rs`: sau `const HELP: Option<&str> = Some("Help");` thêm:
```rust
// The web build cannot install an update, and a releases page is no use to someone using a website.
const HELP_NATIVE: Option<&str> = if cfg!(target_arch = "wasm32") { None } else { HELP };
```
Xoá 3 dòng `help.discord`, `help.app_page`, `help.website`; đổi dòng check updates thành:
```rust
    c("help.check_updates", "Check for updates…", HELP_NATIVE, None, Nothing, "cloud"),
```

`crates/ui-egui/src/updates.rs:15`:
```rust
pub const RELEASES_PAGE: &str = "https://github.com/tuananhfr/pdfcraft/releases";
```

- [ ] **Step 3: Home, thanh trên, About, widgets**

`home.rs`: xoá cả `egui::Frame::NONE … .show(ui, |ui| { … widgets::artcraft_mark … community_links … });` của thẻ cộng đồng và dòng `ui.add_space(22.0);` ngay sau nó (giữ `ui.add_space(14.0);` phía trước để cách thẻ kế tiếp).

`chrome.rs` (độ rộng vùng điều khiển phải):
```rust
                // Keep the two icon buttons and their gaps outside the scrolling tabs.
                let controls_width = 2.0 * button + 12.0 + window_controls::width(&controls.right);
```
và xoá khối nút Discord:
```rust
                    // One click to the community, from anywhere in the app.
                    if widgets::ghost_button_sized(ui, "messages-square", "Discord", tab_h).on_hover_text(pdfcraft_engine::links::DISCORD).clicked() {
                        app.execute("help.discord");
                    }
```
Nếu sau đó biến `t` (hoặc import nào) trong đoạn tính `controls_width` thành không dùng, compiler sẽ báo — xoá đúng chỗ đó.

`dialogs.rs`, nhánh `_ =>` của About thay bằng:
```rust
                    _ => {
                        ui.label(egui::RichText::new("PdfCraft").font(theme::semibold(20.0)));
                        ui.label(crate::i18n::fmt(tl!("Version {v}"), &[("v", &pdfcraft_engine::build_info::version())]));
                        ui.add_space(6.0);
                        ui.label(tl!("A clean-room, open-source PDF application written in Rust. MIT OR Apache-2.0."));
                        ui.label(
                            egui::RichText::new(
                                "Rendering: hayro (bootstrap) · UI: egui · Icons: Lucide (ISC) · Fonts: Inter, JetBrains Mono, Dancing Script (OFL)",
                            )
                            .color(t.text_muted)
                            .small(),
                        );
                        ui.add_space(12.0);
                        ui.label("ERPCons Văn phòng — dựa trên PdfCraft của nhóm ArtCraft. MIT OR Apache-2.0.");
                        ui.add_space(6.0);
                        if let Some(cmd) = widgets::community_links(ui) {
                            link_command = Some(cmd);
                        }
                    }
```

`widgets.rs`: xoá hẳn `artcraft_logo` và `artcraft_mark` (cả doc comment). `community_links` đổi thành:
```rust
/// A pill per project link (`pdfcraft_engine::links`). Returns the registry command of the one clicked.
pub fn community_links(ui: &mut egui::Ui) -> Option<&'static str> {
    let mut clicked = None;
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing = vec2(8.0, 8.0);
        for l in pdfcraft_engine::links::LINKS {
            if icon_pill(ui, l.icon, tl!(l.label), false).on_hover_text(l.url).clicked() {
                clicked = Some(l.command);
            }
        }
    });
    clicked
}
```
Nếu clippy báo `ghost_button_sized` không còn dùng thì xoá luôn hàm đó.

- [ ] **Step 4: Test bố cục tab trong `tests/ui.rs`**

Đổi mốc biên phải từ nút Discord sang nút "Keyboard shortcuts" (giờ là nút điều khiển ngoài cùng bên trái của cụm phải):
- Dòng 333–334: `let shortcuts = h.get_by_label("Keyboard shortcuts").rect();` và `assert!(open.right() <= shortcuts.left(), "Open {open:?} must not run under Keyboard shortcuts {shortcuts:?}");`
- Dòng 358: `… && open.right() <= h.get_by_label("Keyboard shortcuts").rect().left());`
- Dòng 359: `// Twenty: Open stays in sight left of Keyboard shortcuts.`
- Dòng 365–366: `let shortcuts = h.get_by_label("Keyboard shortcuts").rect();` và `assert!(open.left() > 0.0 && open.right() <= shortcuts.left(), "Open {open:?} stays in sight left of Keyboard shortcuts {shortcuts:?}");`
- Dòng 379 (test macOS): `for label in ["Home", "band.pdf", "Open", "Keyboard shortcuts"] {`

- [ ] **Step 5: CLI, MCP**

`apps/pdfcraft-cli/src/main.rs:73`: `help and feedback: https://github.com/tuananhfr/pdfcraft/issues"`.
`version()`:
```rust
fn version() -> Result<(), CliError> {
    stdout_line(format_args!("pdfcraft-cli {}", pdfcraft_engine::build_info::version()))?;
    stdout_line(format_args!("Source:  {}", pdfcraft_engine::links::GITHUB))?;
    Ok(())
}
```
`crates/automation/src/mcp.rs:134`: `"websiteUrl": pdfcraft_engine::links::GITHUB`.
Run: `git grep -n "links::\(DISCORD\|WEBSITE\|APP_PAGE\)\|artcraft_mark\|artcraft_logo\|help\.discord\|help\.website\|help\.app_page"`
Expected: không có kết quả.

- [ ] **Step 6: Bỏ khoá dịch**

Tạo `…/pdfcraft-keys.txt` trong thư mục workspace của plan (script `strip-catalog-keys.mjs` từ Task 2 Step 5 — nếu Task 2 chưa chạy thì tạo script đúng như nội dung ở đó):
```
Join our Discord
Join the ArtCraft community
Get help, share feedback and follow development on Discord.
Join the ArtCraft Discord
PdfCraft web page
ArtCraft website
Part of
```
Run: `node <workspace>/strip-catalog-keys.mjs crates/ui-egui/src/i18n <workspace>/pdfcraft-keys.txt`
Expected: mỗi `.tsv` bị bớt vài dòng (≤ 7), dòng cuối `removed N` với N > 0.
Run: `grep -ciE "artcraft|discord" crates/ui-egui/src/i18n/*.tsv`
Expected: mọi tệp `:0`.

- [ ] **Step 7: Test xanh**

Run: `cargo test -p pdfcraft-ui-egui --test ui_group links:: 2>&1 | tail -15`
Expected: 4 test PASS.
Run: `cargo test -p pdfcraft-engine --lib links_point_at_the_erpcons_fork_only`
Expected: PASS.
Run: `cargo test -p pdfcraft-ui-egui --test ui 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 8: Tài sản, ảnh chụp README**

`git rm -r docs/brand`. Trong `ATTRIBUTION.toml` xoá mọi khối `[[asset]]` có `path = "docs/brand/…"` (8 ảnh + `LICENSE-brand.txt` nếu có mục).
`xtask/src/screenshots.rs`: màn Home không còn mark, nên bỏ nhánh `shows_home` — thay khối từ comment `// The home screen shows the ArtCraft mark…` tới hết `let contents = if shows_home { … } else { … };` bằng:
```rust
        let contents = "Shows only PdfCraft UI, Lucide icons and the showcase PDF built from the [[fetched]] OFL fonts";
```
(nếu `args` trong tuple `scene` thành không dùng thì đổi pattern sang `_`.)
Run: `cargo xtask screenshots pdfcraft-tools`
Expected: ghi lại `docs/images/pdfcraft-tools.png` và cập nhật mục của nó trong `ATTRIBUTION.toml`. Mở ảnh (Read) xác nhận không còn mark ArtCraft. Nếu lệnh không chạy được trên máy này (thiếu GPU/headless): DỪNG, báo user kèm lỗi — đừng tự xoá ảnh khỏi README.
Run: `cargo xtask assets --write && cargo xtask assets`
Expected: ghi `ATTRIBUTION.md`, lượt kiểm sau báo không lỗi.

- [ ] **Step 9: README, ERPCONS-CHANGES**

`README.md`:
- Xoá khối logo đầu trang, badge Discord, dòng link getartcraft/"All Crafting Apps", blockquote cộng đồng, mục lục "Crafting Apps".
- Xoá cả mục `## Community` (dòng 67–75: "PdfCraft is part of ArtCraft…", Discord, web page, đoạn nhãn hiệu).
- Xoá câu `**New to PdfCraft?** Download it from the [PdfCraft page on getartcraft.com]…` ở mục Downloads, mục Crafting Apps cuối trang, đoạn nhãn hiệu và logo cuối.
- Sau `<h1 align="center">PdfCraft</h1>` thêm:
```markdown
> **ERPCons fork.** This is the ERPCons Văn phòng fork of PdfCraft, based on PdfCraft by the ArtCraft team (MIT OR Apache-2.0). It runs at https://office.erpcons.vn/pdf/. ArtCraft names and logos are removed as their brand terms require; see [ERPCONS-CHANGES.md](ERPCONS-CHANGES.md).
```
Run: `grep -nEi "getartcraft|discord|docs/brand|crafting apps|artcraft" README.md ATTRIBUTION.md ATTRIBUTION.toml`
Expected: chỉ dòng `> **ERPCons fork.** …`.

`ERPCONS-CHANGES.md`:
```markdown
# ERPCons changes

This branch (`erpcons`) is the ERPCons Văn phòng fork of [PdfCraft](https://github.com/storytold/pdfcraft), based on PdfCraft by the ArtCraft team, licensed MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`). Changes from upstream `main` (Apache-2.0 §4b):

- Removed the ArtCraft logos and marks (`docs/brand/` and their ATTRIBUTION entries) and every link to the ArtCraft Discord and getartcraft.com, as the ArtCraft brand terms require for forks: title-bar Discord button, home-screen community card, About dialog, Help menu entries, CLI and MCP server info, README. The README screenshot was regenerated without the mark.
- About now reads "ERPCons Văn phòng — dựa trên PdfCraft của nhóm ArtCraft. MIT OR Apache-2.0."; Help ▸ "PdfCraft on GitHub" and the releases page point at this fork.
- Help ▸ "Check for updates…" is not in the web build's menu.
- Dropped the translations of the removed strings.
```

- [ ] **Step 10: CI của fork**

Run: `cargo xtask ci 2>&1 | tee /tmp/pdfcraft-ci.log | tail -30`
Expected: thành công (gồm `assets`, clippy, test `*_covers_ui_literals`).

- [ ] **Step 11: Commit** (chỉ khi được phép)

```bash
git add -A
git commit -m "Remove ArtCraft marks and community links for the ERPCons fork"
```

---

### Task 8: Lắp ráp, quét thật, kiểm giao diện

**Files:** không sửa code (trừ `src/generated/editor-sizes.json` do build ghi lại). Script kiểm thử để trong thư mục workspace của plan (gitignored).

**Interfaces:**
- Consumes: guard của Task 1; 4 fork ở nhánh `erpcons` sau Task 2–7.

Thư mục làm việc: `/g/workspace/erpcons-workspace/erpcons-office`.

- [ ] **Step 1: Build đầy đủ**

Run: `npm run build 2>&1 | tee .superpowers/sdd/2026-10-14-erpcons-office-plan-b-forks/build.log | tail -40`
Expected: 4 lượt `trunk build --release` thành công, **không** có dòng `brand leak`, có 4 dòng `first download ≈ … MB` (Bảng tính tăng khoảng 0,5–0,8 MB so với 7,1 MB vì có Inter), `next build` và `assemble` xong.
Nếu có `brand leak`: đọc `file` + `context`. Nếu chỗ lọt nằm trong mã của fork, sửa ở task tương ứng (ghi Ruling). Nếu nằm trong crate dùng chung (`craft-libs`, `craft-ui`): **DỪNG, báo user**.

- [ ] **Step 2: Chạy lại preview**

Dừng server preview đang chạy ở cổng 3011 (nếu có), rồi chạy nền `npm run preview`.
Expected: `http://localhost:3011/` trả 200.

- [ ] **Step 3: Kiểm đầu-cuối Bảng tính (tiếng Việt) và Trình chiếu (.pptx)**

Tạo `.superpowers/sdd/2026-10-14-erpcons-office-plan-b-forks/check-plan-b.mjs`:
```js
// Usage: node check-plan-b.mjs <shotsDir>
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL('G:/workspace/doc- tools/frontend/scripts/doc-tools/lib/qa.mjs').href)
const BASE = 'http://localhost:3011'
const [shots] = process.argv.slice(2)
fs.mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
const ready = () => page.waitForFunction(() => Boolean(window.wasmBindings) && !document.querySelector('[id$="_loading"]'), null, { timeout: 60000 })
try {
  await page.goto(BASE + '/bang-tinh/')
  await ready()
  await page.waitForTimeout(1500)
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  await page.mouse.click(box.x + 160, box.y + 260)
  await page.keyboard.type('Tiếng Việt: ạ ả ã ấ ầ ẩ ẫ ậ ơ ư đ Ộ Ữ', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(shots, 'bang-tinh-vietnamese.png') })
  console.log(JSON.stringify({ gridcraft: 'typed', shot: 'bang-tinh-vietnamese.png' }))

  await page.goto(BASE + '/trinh-chieu/')
  await ready()
  await page.waitForTimeout(1500)
  const deck = await page.locator('canvas').first().boundingBox()
  await page.mouse.click(deck.x + deck.width / 2, deck.y + deck.height - 20)
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('Control+s')])
  const file = path.join(shots, download.suggestedFilename())
  await download.saveAs(file)
  const head = fs.readFileSync(file).subarray(0, 2).toString('latin1')
  console.log(JSON.stringify({ deckcraft: download.suggestedFilename(), zip: head === 'PK' }))
} finally {
  await browser.close()
}
```
Run: `node .superpowers/sdd/2026-10-14-erpcons-office-plan-b-forks/check-plan-b.mjs .superpowers/sdd/2026-10-14-erpcons-office-plan-b-forks/shots`
Expected: `{"gridcraft":"typed",…}` và `{"deckcraft":"<tên>.pptx","zip":true}`. Mở `bang-tinh-vietnamese.png` (Read): chữ tiếng Việt trong ô và thanh công thức hiện đủ dấu, không có ô vuông. Nếu cú click không trúng ô (văn bản không hiện), chỉnh toạ độ theo ảnh và chạy lại — ghi lại toạ độ dùng được.

- [ ] **Step 4: Kiểm giao diện bằng frontend-visual-qa (profile responsive)**

Dùng skill `frontend-visual-qa`, profile responsive, chế độ audit-only. Mục tiêu:
- `/bang-tinh/`: ở 1440×900 và 390×844. Thanh ERPCons 40px còn nguyên, canvas không tràn, tiếng Việt hiện đủ dấu (lặp lại thao tác gõ ở Step 3).
- About của 4 editor ở 1440×900, mở bằng menu Help/File của từng app. Thấy câu ghi nguồn đúng chữ, không có logo/link ArtCraft hay Discord. PdfCraft: menu Help không có "Check for updates…".
Ghi lại ảnh đã mở xem, phát hiện, phần chưa kiểm được.

- [ ] **Step 5: Kiểm lại repo site**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 84/84, 0, 0.
Run: `git -C ../wordcraft branch --show-current; git -C ../gridcraft branch --show-current; git -C ../deckcraft branch --show-current; git -C ../pdfcraft branch --show-current`
Expected: 4 lần `erpcons`.

- [ ] **Step 6: Commit** (chỉ khi được phép)

```bash
git add src/generated/editor-sizes.json
git commit -m "Update editor download sizes for the erpcons fork builds"
```
