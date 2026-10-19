# ERP nhúng Văn phòng để sửa tệp dự án — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng ERPCons bấm "Sửa trực tiếp" trên một tệp .docx/.xlsx/.pptx/.pdf trong Workspace dự án, sửa trong editor của `office.erpcons.vn` (iframe), bấm Save là thành phiên bản mới của chính tệp đó trên NAS.

**Architecture:** Editor chỉ sống ở `erpcons-office` (không copy vào ERP). Một script shell mới `editor-shell/host-bridge.js` (chạy cùng origin với editor) nói chuyện với ERP qua `postMessage` khác origin: nhận bytes → thả vào editor bằng `deliver()` có sẵn; bắt bytes lúc Save bằng shim `window.showSaveFilePicker` (Word/Excel/PowerPoint) và chặn anchor-download (PDF). ERP là lớp mỏng: tải bytes bằng phiên của người dùng, nhận bytes khi Save rồi gọi API phiên bản của Drive có sẵn (`POST /projects/{id}/drive/items/{item}/versions`, 409 khi lệch `baseVersion`). Không sửa Rust, không sửa backend.

**Tech Stack:** office — plain ES5 IIFE trong `editor-shell/`, test vitest + `node:vm` + fake; Next.js tĩnh. ERP — React 19 + TS, TanStack Query, react-router `useBlocker`, i18next namespace JSON, vitest (`*.test.ts`, môi trường node).

**Spec:** Không có spec riêng; quyết định chốt với người dùng ngày 19/10/2026 nằm ở mục **Decisions** dưới đây. Spec cũ `docs/superpowers/specs/2026-10-14-erpcons-office-site-design.md` ghi "không iframe" — Task 4 ghi lại quyết định mới.

## Decisions (đã chốt với người dùng, 19/10/2026)

- Nhúng **cross-origin** `office.erpcons.vn` — mã editor chỉ sửa một chỗ (`erpcons-office`). Không vendor editor vào ERP.
- Làm cả **4 editor** ngay đợt này.
- Đích lưu đợt này: **Workspace dự án (Drive, `erp_storage`)**. CDE, khoá "đang có người sửa", nhãn nguồn `editor` trong audit: để sau.
- Bật `erp_storage` trên local để thử (người dùng đã đồng ý).
- Không sửa Rust ở 4 fork; không dùng cầu `?host=parent` sẵn có của gridcraft/pdfcraft (chỉ nghe cùng origin).

## Global Constraints

- Không commit / push ở bất kỳ repo nào — người dùng tự yêu cầu commit. Bỏ qua mọi bước "Commit" mặc định của skill.
- `erpcons-office` đang có thay đổi chưa commit của người dùng (`src/components/landing/FeatureGrid.tsx`, `src/lib/pwa/web-manifest*.ts`, `CLAUDE.md`, `docs/gap-register.md`, `docs/glossary-vi.md`, `public/brand/office/`) — **không đụng** các tệp này.
- office: script shell là plain-ES5 IIFE, không bundler, không TS; comment tiếng Anh; UI copy tiếng Việt.
- ERP: comment tiếng Việt (convention repo); chữ hiển thị mới đi qua i18n namespace `office` (vi + en), `npm run build` phải qua `i18n:check` + `i18n:guard`; không `enum`; `import type`; chỉ `config/app.config.ts` đọc `import.meta.env`; component trang `export default`; route lazy bằng `lazyRoute()`.
- Giao thức: namespace `erp-office`, version `1`. Bytes luôn là `ArrayBuffer` được **transfer**. Không bao giờ `postMessage(…, '*')`.
- Tệp được mời sửa (v1): đuôi `docx`, `xlsx`, `pptx`, `pdf` (không phân biệt hoa thường). `.doc/.xls/.ppt/.xlsm` không mời — editor lưu ra đuôi khác, Drive `replace()` từ chối khác đuôi (422).
- Origin ERP được phép (mặc định): `https://lpc.vn`, `http://localhost:3000`, `http://127.0.0.1:3000`; ghi đè bằng env `ERPCONS_EMBED_HOSTS` (phân cách dấu phẩy) lúc build office.
- Map đuôi → editor slug: `docx`→`van-ban`, `xlsx`→`bang-tinh`, `pptx`→`trinh-chieu`, `pdf`→`pdf`.

## Protocol v1 (hợp đồng chung — office JS và ERP TS phải khớp)

Mọi tin: `{ ns: 'erp-office', v: 1, type, ...payload }`.

| Chiều | `type` | payload | Khi nào |
|---|---|---|---|
| office → ERP | `ready` | `{ editor: EditorSlug }` | bridge đã lắng nghe (editor có thể chưa boot xong) |
| ERP → office | `open` | `{ name: string, bytes: ArrayBuffer }` | ERP tải xong bytes |
| office → ERP | `opened` | `{ name }` | editor đã nhận tệp (`deliver` gọi `done`) |
| office → ERP | `open-failed` | `{ reason: string }` | `deliver` thất bại / quá 120 s |
| office → ERP | `save` | `{ id: string, name, bytes: ArrayBuffer, ack: boolean }` | người dùng Save đúng định dạng gốc; `ack:false` = PDF (editor không chờ trả lời) |
| ERP → office | `saved` | `{ id }` | Drive nhận phiên bản mới |
| ERP → office | `save-failed` | `{ id, message }` | lỗi lưu (409/422/507/mạng…) |
| office → ERP | `dirty` | `{ dirty: boolean }` | editor gọi `erpDrafts.put` (true) / `remove` (false) |

Kích hoạt phía office: URL editor có `?embed=erpcons&parent=<origin ERP đã encode>`, và `parent` thuộc danh sách cho phép. Không đủ điều kiện → bridge không làm gì, trang chạy như bản đứng riêng.

## Review Focus

1. **Sửa xong đóng ngay khi editor chưa kịp `erpDrafts.put`** (planner autosave trễ vài giây; PDF có thể không báo dirty) → người dùng mong được hỏi trước khi mất. Pin: ERP luôn hỏi khi đóng/rời trang **trừ khi** trạng thái hiện tại là "vừa lưu thành công, chưa có dirty mới" (Task 6, test `shouldConfirmLeave`).
2. **Lưu PDF thất bại phía server nhưng pdfcraft đã coi là đã lưu** (không có ack) → người dùng mong không mất bản vừa sửa. Pin: ERP giữ bytes của lượt lưu lỗi gần nhất, hiện lỗi cố định với "Thử lưu lại" + "Tải bản này xuống" (Task 6, test reducer `save-failed` giữ `pendingBytes`).
3. **Người khác vừa lưu bản mới (409 `VERSION_CONFLICT`)** → mong không ghi đè và không mất bản của mình. Pin: không thử lại tự động; trả `save-failed`, giữ bytes, đưa lựa chọn "Tải bản của tôi xuống" / "Mở bản mới nhất" (Task 6, test reducer conflict).
4. **Export sang định dạng khác (Word → PDF, Excel → CSV, Save As đổi đuôi)** → mong vẫn tải xuống máy như bình thường, không bị ghi thành phiên bản. Pin: chỉ bắt khi đuôi `suggestedName`/`download` = đuôi tệp gốc (Task 3, test `classifySave`).
5. **Tin nhắn giả từ origin/khung khác** (tab khác, iframe con, extension) → phải bị lờ. Pin: cả hai phía kiểm `event.origin` **và** `event.source` (Task 2 test office, Task 5 test `acceptOfficeEvent`).

---

### Task 1: Bật `erp_storage` trên local và xác nhận API Drive

Không viết code. Repo: `C:\wamp64\www\erpcons` (chạy từ gốc repo).

**Files:** không sửa tệp nào trong git. Bản dump DB lưu ở scratchpad của phiên.

**Interfaces:**
- Produces: route `GET /api/v1/projects/{node}/drive`, `GET …/drive/items/{item}/download`, `POST …/drive/items/{item}/versions` trả JSON thật (không còn 501) cho các task ERP.

- [ ] **Step 1: Dump DB làm điểm quay lại**
Run: `vendor/bin/drush sql:dump --result-file=<scratchpad>/erpcons-before-storage.sql`
Expected: tệp `.sql` > 0 byte.

- [ ] **Step 2: Bật module và khai node lưu "Máy chủ"**
Run: `vendor/bin/drush en erp_storage -y && vendor/bin/drush updb -y && vendor/bin/drush php:script web/modules/custom/erp_storage/scripts/setup.php`
Expected: không lỗi; `SHOW TABLES LIKE 'erp_drive%'` có `erp_drive`, `erp_drive_item`, `erp_drive_event`, `erp_drive_share`.

- [ ] **Step 3: Dọn hai bản cache container**
Run: `vendor/bin/drush cr && vendor/bin/drush sql:query "TRUNCATE TABLE cache_container"`

- [ ] **Step 4: Kiểm chứng**
Run: `vendor/bin/drush php:script web/modules/custom/erp_storage/scripts/check-drive.php` và `vendor/bin/drush php:script web/modules/custom/erp_storage/scripts/doctor.php`
Expected: check-drive không FAIL; `/user/login` 200, `/api/v1/me` 200; `drush watchdog:show --severity-min=3 --count=5` không có lỗi mới. Nếu `file_temp_path='/tmp/'` gây lỗi upload trên Windows: DỪNG, báo người dùng (không tự sửa `settings.php`).

- [ ] **Step 5: Đường lùi (chỉ khi hỏng)** — `drush pmu erp_storage -y` rồi nạp lại dump; báo người dùng.

---

### Task 2: office — `host-bridge.js`: kích hoạt, kiểm origin, handshake, mở tệp

**Files:**
- Create: `editor-shell/host-bridge.js`
- Create: `editor-shell/host-bridge.test.ts`
- Modify: `editor-shell/open-file.js` (thêm một dòng expose `deliver`)

**Interfaces:**
- Consumes: `deliver(files: File[], name: string, done?: () => void, cleanup?: () => void)` trong `open-file.js` — `cleanup` được gọi khi thất bại.
- Produces:
  - `window.erpShellDeliver = deliver` (open-file.js).
  - `window.erpEmbed` (chỉ có khi đã kích hoạt): `{ origin: string, editor: string, post(type: string, payload: object, transfer?: Transferable[]): void, originalName(): string | null }` — Task 3 dùng.
  - `<html>` có class `erp-embedded` khi đã kích hoạt.
  - `window.erpEmbedHosts: string[]` do Task 4 chèn **trước** mọi script shell; vắng mặt ⇒ danh sách rỗng ⇒ không kích hoạt.

- [ ] **Step 1: Viết test thất bại** (`host-bridge.test.ts`, chạy `open-file.js` + `host-bridge.js` trong `vm.runInNewContext` với fake `window`/`location`/`document`/`parent`, theo khuôn `open-file.test.ts`):
  - `it('stays inert without embed=erpcons')` — `location.search = ''` ⇒ `window.erpEmbed` undefined, không `parent.postMessage`.
  - `it('stays inert when parent origin is not allowed')` — `?embed=erpcons&parent=https%3A%2F%2Fevil.test`, hosts `['https://lpc.vn']` ⇒ inert.
  - `it('announces ready to the allowed parent only')` — hosts `['https://lpc.vn']`, `parent=https%3A%2F%2Flpc.vn`, path `/bang-tinh/` ⇒ `parent.postMessage({ns:'erp-office',v:1,type:'ready',editor:'bang-tinh'}, 'https://lpc.vn')` đúng một lần; `document.documentElement.classList` chứa `erp-embedded`.
  - `it('ignores messages from another origin or another window')` — gửi `open` với `origin:'https://evil.test'` và lần khác `source: {}` (không phải `parent`) ⇒ `erpShellDeliver` không được gọi.
  - `it('delivers an open message to the editor and reports opened')` — `open {name:'Dự toán.xlsx', bytes: new ArrayBuffer(3)}` từ đúng origin/source ⇒ `erpShellDeliver` nhận `[File]` tên `Dự toán.xlsx`; gọi `done` ⇒ post `{type:'opened', name:'Dự toán.xlsx'}`; `erpEmbed.originalName()` = `'Dự toán.xlsx'`.
  - `it('reports open-failed when delivery gives up')` — gọi `cleanup` ⇒ post `{type:'open-failed'}` có `reason` không rỗng.
  - `it('rejects messages with another ns or version')` — `{ns:'cn-embed'}` / `{v:2}` ⇒ bỏ qua.

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run editor-shell/host-bridge.test.ts` → FAIL (thiếu tệp).

- [ ] **Step 3: Implement** — `open-file.js`: ngay sau định nghĩa `deliver` thêm `window.erpShellDeliver = deliver` (trước nhánh `launchQueue`). `host-bridge.js`: IIFE; đọc `embed`, `parent` từ `location.search`; `editor` = segment đầu `location.pathname`; kích hoạt khi `embed==='erpcons'` và `parent` ∈ `window.erpEmbedHosts`; nghe `message` với guard `event.origin === parent && event.source === window.parent && data.ns === 'erp-office' && data.v === 1`; `open` → `new File([bytes], name)` → `erpShellDeliver(...)`. Giữ `originalName` trong closure.

- [ ] **Step 4: Chạy lại** — `npx vitest run editor-shell/host-bridge.test.ts editor-shell/open-file.test.ts` → PASS.

---

### Task 3: office — bắt Save (picker shim + PDF anchor), ack, dirty

**Files:**
- Modify: `editor-shell/host-bridge.js`
- Modify: `editor-shell/drafts.js:6` (return sớm cả khi `embed=erpcons`)
- Test: `editor-shell/host-bridge.test.ts` (thêm `describe('saving')`, `describe('dirty')`), `editor-shell/drafts.test.ts` (thêm 1 case)

**Interfaces:**
- Consumes: `window.erpEmbed` (Task 2).
- Produces (trong `host-bridge.js`, expose để test qua `window.erpEmbed`):
  - `classifySave(originalName: string | null, targetName: string): 'capture' | 'passthrough'` — `capture` khi có `originalName` và đuôi (sau dấu chấm cuối, lowercase) trùng.
  - `window.showSaveFilePicker(options)` (shim, chỉ khi kích hoạt) → `Promise<handle>`; `handle = { kind: 'file', name, createWritable(): Promise<writable> }`; `writable = { write(data: BufferSource | Blob): Promise<void>, close(): Promise<void>, abort(): Promise<void> }`. `close()` gom bytes → post `save {id, name, bytes, ack:true}` (transfer) → resolve khi nhận `saved {id}`, reject `new Error(message)` khi `save-failed {id}`, reject `new Error('Hết thời gian chờ lưu')` sau 120 000 ms. `classifySave` = `passthrough` ⇒ gọi `showSaveFilePicker` gốc nếu có; không có thì trả handle mà `close()` tải xuống bằng anchor (như hành vi cũ).
  - `window.erpDrafts` stub (chỉ khi kích hoạt): `put()` → post `dirty {dirty:true}` (chỉ khi đổi trạng thái), `remove()` → `dirty {dirty:false}`, `ready()` → không làm gì.
  - Chặn anchor: bọc `URL.createObjectURL` để nhớ `url → Blob`; vá `HTMLAnchorElement.prototype.click`: nếu kích hoạt, `this.download` có giá trị, `href` có trong bản nhớ và `classifySave` = `capture` ⇒ post `save {…, ack:false}`, không tải xuống; ngược lại gọi `click` gốc.

- [ ] **Step 1: Viết test thất bại**
  - `it('classifies saves by the original extension')` — `classifySave('Báo cáo.DOCX','Báo cáo.docx')==='capture'`; `classifySave('Báo cáo.docx','Báo cáo.pdf')==='passthrough'`; `classifySave(null,'x.docx')==='passthrough'`.
  - `it('captures a picker save and resolves close() only after saved')` — sau `open 'a.docx'`: `showSaveFilePicker({suggestedName:'a.docx'})` → `createWritable()` → `write(new Uint8Array([1,2]))` → `close()`; kiểm post `save` có `ack:true`, `bytes.byteLength===2`, `name:'a.docx'`; promise `close()` chưa settle; gửi `saved {id}` ⇒ resolve.
  - `it('rejects close() when the host reports save-failed')` — gửi `save-failed {id, message:'VERSION_CONFLICT'}` ⇒ reject, `error.message==='VERSION_CONFLICT'`, `error.name!=='AbortError'`.
  - `it('passes exports through to the native picker')` — sau `open 'a.docx'`, `showSaveFilePicker({suggestedName:'a.pdf'})` gọi đúng hàm gốc; không post `save`.
  - `it('captures the PDF anchor download without downloading')` — sau `open 'b.pdf'`: `URL.createObjectURL(blob)` → anchor `download='b.pdf'`, `href=url` → `click()` ⇒ post `save {ack:false}`, `click` gốc không được gọi; anchor `download='b.docx'` ⇒ `click` gốc được gọi.
  - `it('reports dirty transitions once each')` — `erpDrafts.put` ×2 ⇒ một `dirty:true`; `remove` ⇒ một `dirty:false`.
  - `drafts.test.ts`: `it('does not install the draft store when embedded for ERP')` — `?embed=erpcons` ⇒ `window.erpDrafts` / `window.erpDraftStore` undefined.

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run editor-shell/` → các case mới FAIL.

- [ ] **Step 3: Implement** theo Interfaces. Id lượt lưu: `Date.now().toString(36) + '-' + counter`. Gom bytes trong `write` bằng mảng `Uint8Array` (Blob → `arrayBuffer()`), nối lúc `close`. `drafts.js:6`: điều kiện return thêm `|| params.get('embed') === 'erpcons'`.

- [ ] **Step 4: Chạy lại** — `npx vitest run editor-shell/` → PASS.

---

### Task 4: office — ghép vào trang, danh sách origin, ẩn thanh shell, tài liệu

**Files:**
- Create: `src/config/embed.ts`
- Modify: `src/lib/editor-shell/assets.ts` (thứ tự script + chèn `window.erpEmbedHosts`)
- Modify: `editor-shell/shell.css` (chế độ nhúng)
- Test: `src/lib/editor-shell/assets.test.ts`, `src/config/embed.test.ts`
- Create: `docs/erp-embed.md`
- Modify: `docs/superpowers/specs/2026-10-14-erpcons-office-site-design.md` (một mục "Cập nhật 19/10/2026" ngay dưới dòng "không iframe": ERP được nhúng qua `host-bridge.js`, trỏ `docs/erp-embed.md`)

**Interfaces:**
- Consumes: `host-bridge.js` (Task 2–3).
- Produces:
  - `embedHosts(env: string | undefined): string[]` trong `src/config/embed.ts` — `undefined`/rỗng ⇒ `['https://lpc.vn','http://localhost:3000','http://127.0.0.1:3000']`; ngược lại tách dấu phẩy, trim, chỉ giữ chuỗi khớp `^https?://[^/]+$`.
  - `loadShellAssets(directory: string, hosts?: string[]): ShellAssets` — `script` bắt đầu bằng `window.erpEmbedHosts=<JSON>;` rồi `shell.js, open-file.js, keys.js, drafts.js, drafts-ui.js, host-bridge.js`. Người gọi hiện có (`scripts/assemble.mts`) truyền `embedHosts(process.env.ERPCONS_EMBED_HOSTS)`.

- [ ] **Step 1: Viết test thất bại**
  - `embed.test.ts`: mặc định 3 origin; `'https://a.vn, http://b.local:8080 ,javascript:x'` ⇒ `['https://a.vn','http://b.local:8080']`.
  - `assets.test.ts`: `it('declares embed hosts before any shell script')` — `script.startsWith('window.erpEmbedHosts=["https://lpc.vn"];')` khi truyền `['https://lpc.vn']`; `it('runs the host bridge after open-file and drafts')` — index `host-bridge.js` > index `open-file.js` và > `drafts.js`.

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run src/config/embed.test.ts src/lib/editor-shell/assets.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `embed.ts`, `assets.ts`, truyền hosts ở `scripts/assemble.mts`. `shell.css`: `html.erp-embedded{--erp-shell-h:0px}` và `html.erp-embedded .erp-shell{display:none}`. `docs/erp-embed.md`: bảng Protocol v1 (chép từ plan), tham số URL, cách bắt Save và giới hạn (PDF không ack; dirty trễ), `ERPCONS_EMBED_HOSTS`, và **việc ngoài repo**: Apache của `office.erpcons.vn` phải trả `Content-Security-Policy: frame-ancestors 'self' https://lpc.vn` (và không có `X-Frame-Options`) cho `/van-ban/ /bang-tinh/ /trinh-chieu/ /pdf/`.

- [ ] **Step 4: Kiểm chứng office**
Run: `npm test && npm run typecheck && npm run lint && npm run build:site`
Expected: tất cả xanh; `out/bang-tinh/index.html` chứa `window.erpEmbedHosts=` và `erp-office`.
Run thêm: `curl -sI https://office.erpcons.vn/bang-tinh/` — ghi lại có/không `X-Frame-Options` / `frame-ancestors` vào báo cáo (không sửa server).

---

### Task 5: ERP — giao thức, cấu hình, chọn editor theo đuôi

Repo: `G:\workspace\erpcons_frontend`.

**Files:**
- Create: `src/features/core/office/services/office-protocol.ts`
- Create: `src/features/core/office/services/office-protocol.test.ts`
- Create: `src/features/core/office/utils/office-editor.ts`
- Create: `src/features/core/office/utils/office-editor.test.ts`
- Create: `src/features/core/office/index.ts`
- Modify: `src/config/app.config.ts` (thêm `officeEmbedUrl`), `.env.example` (thêm `VITE_OFFICE_EMBED_URL=http://localhost:3011` có comment)

**Interfaces:**
- Produces:
  - `OFFICE_NS = 'erp-office'`, `OFFICE_VERSION = 1`.
  - `type OfficeEditorSlug = 'van-ban' | 'bang-tinh' | 'trinh-chieu' | 'pdf'`.
  - `type OfficeGuestMessage` = union các tin office → ERP (bảng Protocol); `type OfficeHostMessage` = union ERP → office.
  - `readOfficeGuestMessage(data: unknown): OfficeGuestMessage | null` — kiểm `ns`, `v`, `type`, kiểu từng trường (`bytes instanceof ArrayBuffer`, `ack` boolean…).
  - `acceptOfficeEvent(event: { origin: string; source: unknown; data: unknown }, origin: string, frame: unknown): OfficeGuestMessage | null`.
  - `wrapOffice(message: OfficeHostMessage): object` (gắn `ns`, `v`).
  - `officeEditorFor(extension: string | null): OfficeEditorSlug | null` — map ở Global Constraints, lowercase, null cho đuôi khác.
  - `officeEmbedSrc(baseUrl: string, editor: OfficeEditorSlug, parentOrigin: string): string` → `${baseUrl}/${editor}/?embed=erpcons&parent=${encodeURIComponent(parentOrigin)}`.
  - `appConfig.officeEmbedUrl: string` ← `VITE_OFFICE_EMBED_URL ?? 'https://office.erpcons.vn'`, bỏ `/` cuối (cùng kiểu `chuyenNhoEmbedUrl`).

- [ ] **Step 1: Viết test thất bại**
  - `officeEditorFor('DOCX')==='van-ban'`, `'xlsx'→'bang-tinh'`, `'pptx'→'trinh-chieu'`, `'pdf'→'pdf'`, `'doc'`/`'xlsm'`/`null` → `null`.
  - `officeEmbedSrc('https://office.erpcons.vn','pdf','https://lpc.vn')==='https://office.erpcons.vn/pdf/?embed=erpcons&parent=https%3A%2F%2Flpc.vn'`.
  - `acceptOfficeEvent` trả null khi sai origin, khi `source !== frame`, khi `ns`/`v` sai, khi `save` thiếu `bytes` ArrayBuffer; trả đúng message cho `ready`/`opened`/`open-failed`/`save`/`dirty` hợp lệ.

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run src/features/core/office` → FAIL.

- [ ] **Step 3: Implement** theo Interfaces; `index.ts` export `officeEditorFor` và (Task 6) trang/route helper.

- [ ] **Step 4: Chạy lại** — `npx vitest run src/features/core/office` → PASS.

---

### Task 6: ERP — trang sửa tệp (iframe + cầu + lưu phiên bản)

**Files:**
- Create: `src/features/core/office/utils/office-session.ts` (reducer thuần + `shouldConfirmLeave`)
- Create: `src/features/core/office/utils/office-session.test.ts`
- Create: `src/features/core/office/hooks/useOfficeBridge.ts`
- Create: `src/features/core/office/pages/OfficeEditPage.tsx` (`export default`)
- Create: `src/i18n/resources/vi/office.json`, `src/i18n/resources/en/office.json`
- Modify: `src/i18n/i18next.d.ts` (khai namespace `office`)
- Modify: `src/routes/projects.routes.tsx` (thêm route vào `projectWorkspaceRoutes`), `src/constants/routes.ts` (`ROUTES.projects.driveEdit`)
- Create: `styles/features/office.css` + một dòng `@import` cuối `src/styles/index.css` (chỉ nếu cần layout toàn màn hình; không hex, dùng `var(--erp-*)`)

**Interfaces:**
- Consumes: Task 5 (`acceptOfficeEvent`, `wrapOffice`, `officeEmbedSrc`, `officeEditorFor`, `appConfig.officeEmbedUrl`); `useDriveVersions(projectId, itemId)`; `driveService.addVersion(projectId, itemId, file, onProgress?, baseVersion?)` → `DriveItem & { outcome?: string }`; `driveService.downloadUrl(projectId, itemId, { version })`; `client` axios của `@/api` để tải blob (`baseURL: ''`, `responseType: 'arraybuffer'`); `ApiError` (`status`, `code`).
- Produces:
  - Route `projects/list/:id/drive/:itemId/edit` (ngoài `AppLayout`, cạnh `projects/list/:id`, cùng `RequirePermission` `PERMISSIONS.projects.project.view`), lazy bằng `lazyRoute`.
  - `ROUTES.projects.driveEdit(projectId: string, itemId: number): string`.
  - `type OfficeSessionState = { phase: 'loading' | 'connecting' | 'opening' | 'editing' | 'saving' | 'stalled' | 'error'; dirty: boolean; version: number | null; lastSaveOk: boolean; failure: { kind: 'conflict' | 'readonly' | 'quota' | 'other'; message: string } | null; pendingBytes: ArrayBuffer | null; pendingName: string | null }`.
  - `officeSessionReducer(state, action)`; actions: `{type:'loaded'}`, `{type:'ready'}`, `{type:'opened'}`, `{type:'open-failed', reason}`, `{type:'dirty', dirty}`, `{type:'save-start', name, bytes}`, `{type:'save-ok', version}`, `{type:'save-failed', kind, message}`, `{type:'stalled'}`.
  - `shouldConfirmLeave(state): boolean` — `true` trừ khi `state.lastSaveOk && !state.dirty`, hoặc `phase ∈ {'loading','connecting','stalled','error'}` (chưa mở được gì).
  - `saveFailureKind(error: unknown): OfficeSessionState['failure']['kind']` — 409 + `VERSION_CONFLICT` → `conflict`; 409 `READ_ONLY` → `readonly`; 422 `QUOTA` / 507 → `quota`; còn lại `other`.

- [ ] **Step 1: Viết test thất bại** (`office-session.test.ts`)
  - `shouldConfirmLeave` = `true` ngay sau `opened` (chưa lưu lần nào); = `false` sau `save-ok` khi chưa có `dirty:true` mới; = `true` lại sau `dirty:true`.
  - `save-failed` giữ `pendingBytes`/`pendingName` của `save-start`; `save-ok` xoá chúng và cập nhật `version`.
  - `saveFailureKind`: ApiError 409 `VERSION_CONFLICT` → `'conflict'`; 409 `READ_ONLY` → `'readonly'`; 507 → `'quota'`; `new Error('x')` → `'other'`.

- [ ] **Step 2: Chạy để thấy fail** — `npx vitest run src/features/core/office/utils/office-session.test.ts` → FAIL.

- [ ] **Step 3: Implement reducer + `saveFailureKind`**, chạy lại → PASS.

- [ ] **Step 4: Implement `useOfficeBridge(frame, origin, handlers)` + `OfficeEditPage`** theo khuôn `features/chuyen-nho/pages/ToolsEmbedPage.tsx` + `hooks/useToolsBridge.ts`:
  - Lấy item: `useDriveVersions(projectId, itemId)` (`features/core/drive/hooks/useDrive.ts`, trả `DriveVersionListing { item, versions }`) — dùng `item.name`, `item.extension`, `item.version`; `officeEditorFor(extension)` null ⇒ trang báo "không sửa trực tiếp được loại tệp này". "Mở bản mới nhất" = `refetch()` rồi nạp lại iframe.
  - Tải bytes `downloadUrl(..., { version })` → khi nhận `ready` gửi `open` (transfer `bytes`); `READY_TIMEOUT_MS = 15000` ⇒ `stalled` (Tải lại / Mở trong tab mới — tab mới chỉ là editor trống, ghi rõ).
  - Nhận `save` ⇒ `save-start` → `addVersion(projectId, itemId, new File([bytes], name), undefined, state.version)` → `save-ok` + post `saved {id}` (khi `ack`) + invalidate query Drive; lỗi ⇒ `save-failed` + post `save-failed {id, message}`. `outcome === 'unchanged'` vẫn là `save-ok`.
  - Thanh trên cùng: tên tệp · "Phiên bản N" · trạng thái (Đang lưu… / Đã lưu / Có thay đổi chưa lưu) · nút Đóng (về `ROUTES.projects.workspace(projectId)`).
  - Lỗi lưu: hộp cố định theo `failure.kind` — `conflict`: "Có người vừa lưu bản mới" + [Tải bản của tôi xuống] [Mở bản mới nhất]; còn lại: thông điệp + [Thử lưu lại] (gửi lại `pendingBytes`) + [Tải bản này xuống].
  - Chặn rời trang: `useBlocker` với `shouldConfirmLeave`; thêm `beforeunload` khi `shouldConfirmLeave`.
  - iframe: `title` i18n, `allow="fullscreen; clipboard-read; clipboard-write"`, không `sandbox`, chiếm toàn bộ phần còn lại.
  - Mọi chữ qua `useTranslation('office')`; khoá trong `vi/office.json` + `en/office.json`, rồi `npm run i18n:sync`.

- [ ] **Step 5: Kiểm chứng tĩnh** — `npx vitest run src/features/core/office && npm run lint && npm run build` → xanh (gồm `i18n:check`, `i18n:guard`, `tsc`).

---

### Task 7: ERP — nút "Sửa trực tiếp" trong Workspace dự án + CSP + chạy thử đầu-cuối

**Files:**
- Modify: `src/features/core/drive/components/DriveItemMenu.tsx` (handler mới `edit` trong `DriveItemHandlers`, mục menu ngay sau "Xem trước")
- Modify: `src/features/core/drive/components/DriveFilesView.tsx:662` (thêm `edit` vào `handlers`, `navigate(ROUTES.projects.driveEdit(projectId, item.id))`)
- Modify: `docs/security/nginx-headers.md` (thêm `https://office.erpcons.vn` vào `frame-src` của CSP Report-Only + một gạch đầu dòng giải thích, cạnh mục Chuyện Nhỏ)
- Modify: `docs/storage/README.md` §13 (một đoạn ngắn "Sửa trực tiếp" trỏ `erpcons-office/docs/erp-embed.md`)

**Interfaces:**
- Consumes: `officeEditorFor` (Task 5), `ROUTES.projects.driveEdit` (Task 6).
- Produces: `DriveItemHandlers.edit: (item: DriveItem) => void`.

- [ ] **Step 1: Thêm mục menu** — hiện khi `isFile && writable && officeEditorFor(item.extension) !== null`; icon `pencil-square`; nhãn `office:edit.menu` = "Sửa trực tiếp". Lưới: không đổi `activate()` (bấm thẻ vẫn như cũ).

- [ ] **Step 2: Kiểm chứng tĩnh** — `npm run lint && npm run build` → xanh.

- [ ] **Step 3: Chạy thử đầu-cuối trên local** (bắt buộc trước khi báo xong)
  - office: `npm run build:site && npm run preview` (cổng 3011); ERP: `.env` đặt `VITE_USE_MOCK=0`, `VITE_OFFICE_EMBED_URL=http://localhost:3011`; `npm run dev` (3000); Drupal local đã bật `erp_storage` (Task 1).
  - Đăng nhập, vào một dự án → Workspace → tải lên 4 tệp mẫu (.docx, .xlsx, .pptx, .pdf).
  - Với từng tệp: "Sửa trực tiếp" → tệp mở trong editor → sửa → Save → thanh báo "Đã lưu" → đóng → `DriveVersionsModal` có phiên bản +1, tải bản mới mở đúng nội dung đã sửa.
  - Xung đột: mở trình sửa .xlsx, ở tab khác tải phiên bản mới qua `DriveVersionsModal`, quay lại Save ⇒ hộp `conflict`, không sinh phiên bản.
  - Export: trong Word chọn xuất PDF ⇒ tải xuống máy, Drive không thêm phiên bản.
  - Đóng khi chưa lưu ⇒ có hỏi xác nhận.
  - Chụp màn hình bằng `frontend-visual-qa` (profile responsive) cho trang sửa ở 1440 và 390 px.
  - Ghi kết quả từng mục (đạt / không đạt + lý do) vào báo cáo cho người dùng.
