# ERPCons Văn phòng — site office.erpcons.vn

Ngày: 14/10/2026 · Trạng thái: chờ duyệt spec

## Mục tiêu

Site công khai, không đăng nhập, ở `office.erpcons.vn`: người dùng mở, sửa và lưu
tệp DOCX, XLSX, PPTX, PDF ngay trên trình duyệt; tệp không rời máy. Có landing page
giới thiệu sản phẩm, làm tốt SEO.

Xong khi: chạy local, vào landing, chọn một chức năng, mở được tệp mẫu đúng định
dạng, sửa, lưu về máy, mở lại được — cho cả bốn chức năng.

## Quyết định đã chốt

| Mục | Quyết định |
| --- | --- |
| Tên sản phẩm | ERPCons Văn phòng (tiếng Anh dự kiến ERPCons Workspace — chưa tra nhãn hiệu, chưa dùng ở đâu) |
| Chức năng | Văn bản (.docx) · Bảng tính (.xlsx) · Trình chiếu (.pptx) · PDF. Không có Biểu mẫu |
| Người dùng | Công khai, không tài khoản, không backend |
| Engine | 4 fork GitHub `tuananhfr/{wordcraft,gridcraft,deckcraft,pdfcraft}` (MIT OR Apache-2.0) |
| Cách hiển thị editor | Chạy thẳng trên trang, **không iframe**; thanh điều hướng HTML 40px phía trên canvas |
| Thứ tự ra mắt | Một lần: chỉ lên mạng khi cả 4 fork đã gỡ nhận diện ArtCraft và tự build |
| Ngôn ngữ | Landing tiếng Việt; giao diện editor tạm tiếng Anh (thêm locale vi ở bản sau) |
| Giao diện | ERPCons Crimson Ice v1.1 (`erpcons_frontend/ERPcons_Design_System.md`) |
| Công nghệ landing | Next.js + TypeScript, `output: 'export'` (tĩnh, không chạy Node trên server) |
| Server đích | VPS Linux + Apache2 — **ngoài phạm vi lần này**; làm và kiểm ở local trước |

> **Cập nhật 19/10/2026.** "Không iframe" vẫn đúng với site công khai. Ngoại lệ duy nhất là ERPCons
> nhúng editor bằng iframe khác origin để sửa tệp Drive dự án (`?embed=erpcons`). Ở chế độ này shell
> bị ẩn, không dùng bản nháp và tệp đi qua postMessage. Chi tiết xem `docs/erp-embed.md`.

## 1. Kiến trúc

```
G:\workspace\erpcons-workspace\
├─ wordcraft\  gridcraft\  deckcraft\  pdfcraft\   fork Rust, nhánh `tuananhfr`; trunk build → <fork>\dist\web\
└─ erpcons-office\                                 repo mới (GitHub tuananhfr/erpcons-office)
   ├─ app\                     landing (App Router), sitemap.ts, robots.ts
   ├─ src\components\landing\  từng phần của landing
   ├─ src\styles\              token Crimson Ice → biến CSS --erp-*
   ├─ src\config\editors.ts    nơi DUY NHẤT khai 4 editor
   ├─ editor-shell\            HTML + CSS + script nhỏ chèn vào trang editor
   ├─ public\sw.js             service worker (mục 3)
   └─ scripts\assemble.mts     lắp ráp
```

URL: `/` · `/van-ban/` · `/bang-tinh/` · `/trinh-chieu/` · `/pdf/` (`trailingSlash: true`).

### `editors.ts`

Mỗi mục: `slug`, `name` (Văn bản…), `extension`, `fork` (thư mục fork), `webApp`
(`apps/<x>-web`), `canvasId`, `loadingId?`, `seoTitle`, `seoDescription`, `icon`.
Thẻ chức năng trên landing, sitemap, lắp ráp và test đều đọc từ đây.

Giá trị đã đối chiếu với fork:

| slug | fork | canvasId | loadingId |
| --- | --- | --- | --- |
| `van-ban` | wordcraft | `wordcraft_canvas` | `wordcraft_loading` |
| `bang-tinh` | gridcraft | `gridcraft_canvas` | `gridcraft_loading` |
| `trinh-chieu` | deckcraft | `deckcraft_canvas` | `deckcraft_loading` |
| `pdf` | pdfcraft | `pdfcraft` | — |

Mọi fork có `Trunk.toml` với `dist = "../../dist/web"`, `public_url = "./"`,
`filehash = true` — bản build dùng URL tương đối nên đặt dưới thư mục con được.

### Luồng build (`npm run build`)

1. `next build` → landing vào `out/`.
2. `assemble.mts`, với từng editor trong `editors.ts`:
   - `trunk build --release` trong `<fork>/<webApp>` (cờ `--skip-rust` dùng lại `dist/web` có sẵn);
   - chép `<fork>/dist/web/` → `out/<slug>/`;
   - chèn thanh ERPCons + meta SEO + đăng ký service worker vào `out/<slug>/index.html` (mục 2);
   - thiếu bản build, thiếu `index.html` hay `trunk` lỗi → **dừng, in rõ app và bước hỏng**.
3. Nén sẵn `.gz` và `.br` cho `.wasm .js .css .html .svg .json`.

`out/` là toàn bộ site.

### Chạy local

- `npm run dev` — dev server Next, chỉ landing.
- `npm run preview` — server tĩnh nhỏ (script Node trong repo) phục vụ `out/` như Apache sẽ
  làm: `application/wasm`, trả sẵn `.br`/`.gz` kèm `Content-Encoding` đúng khi trình duyệt
  nhận, `Cache-Control: public, max-age=31536000, immutable` cho tệp có hash,
  `no-cache` cho HTML và `sw.js`.

## 2. Trang editor

### Chèn vào `index.html` (hàm thuần, có test)

- `<html lang="vi">`.
- `<head>`: thay `<title>` bằng "<Tên chức năng> – ERPCons Văn phòng"; thêm meta description,
  canonical `https://office.erpcons.vn/<slug>/`, Open Graph, favicon ERPCons (thay favicon
  upstream); CSS của thanh.
- Ngay sau `<body>`: thanh ERPCons cao 40px —
  - trái: logo + "ERPCons Văn phòng", link `/`;
  - phải: link sang 3 chức năng còn lại; chức năng hiện tại `aria-current="page"`;
  - < 768px: logo + tên chức năng + menu "Chức năng" bằng `<details>` (không JS).
- CSS dời canvas xuống dưới thanh, chạy được cho cả hai kiểu upstream (canvas `absolute`
  của Word/Grid/Deck và canvas theo luồng của PdfCraft):
  `#<canvasId> { position: absolute; top: 40px; left: 0; right: 0; bottom: 0; width: 100%; height: calc(100% - 40px); }`
  và tương tự cho `#<loadingId>` nếu có.
- Script nhỏ chạy trước engine: không có WebGPU lẫn WebGL2 → hiện câu báo tiếng Việt
  thay canvas trắng. `<noscript>` báo cần bật JavaScript.
- Dòng đăng ký `sw.js`.
- Kiểm chặt: phải thấy đúng một `</head>`, một `<body>`, đúng `id` canvas; thiếu → lỗi.
  Có dấu đã chèn → không chèn lần hai.

Cảnh báo rời trang dùng sẵn `beforeunload` của engine (chỉ bật khi tài liệu có thay
đổi chưa lưu), không viết thêm.

### Sửa trong 4 fork (nhánh `tuananhfr`, tạo từ `main` mới nhất của upstream)

Chỉ phần bắt buộc để ra mắt, theo `docs/brand/LICENSE-brand.txt` của upstream:

1. Gỡ nhận diện ArtCraft khỏi bản build: logo/mark dùng trong giao diện (PdfCraft nhúng ở
   `crates/ui-egui/src/widgets.rs`), chữ "ArtCraft" trong About, nút "Join the ArtCraft
   community on Discord"; gỡ `docs/brand/` và logo trong README.
2. About ghi chữ thường: "ERPCons Văn phòng — dựa trên WordCraft của nhóm ArtCraft.
   MIT OR Apache-2.0." (tên app tương ứng cho từng fork).
3. Giữ `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, `ATTRIBUTION.md`; thêm
   `ERPCONS-CHANGES.md` liệt kê tệp đã sửa (Apache-2.0 §4b).
4. Không đổi: tên app "WordCraft…" bên trong editor (giấy phép cho giữ), `index.html` của
   fork (lắp ráp lo), ngôn ngữ editor.

Danh sách chỗ phải gỡ được rà đầy đủ (gồm `include_bytes!`/`include_image!` ảnh, icon) khi
lên plan; số đếm hiện tại là thô (3–30 dòng Rust mỗi app nhắc ArtCraft).

`main` của fork giữ nguyên theo upstream, `upstream` chặn push (đã cấu hình).

## 3. Landing, SEO, offline

### Landing (`/`)

Thứ tự: Hero → 4 thẻ chức năng → Vì sao dùng → Lưu ý → Câu hỏi thường gặp → Footer.

- Hero: "ERPCons Văn phòng", câu giới thiệu (soạn văn bản, bảng tính, trình chiếu và PDF
  ngay trên trình duyệt — miễn phí, không cần cài đặt), nút bắt đầu (cuộn tới thẻ).
- Thẻ chức năng sinh từ `editors.ts`: icon, tên, đuôi tệp, một dòng mô tả, nút "Mở".
- Vì sao dùng: tệp không rời máy · không cần tài khoản · dùng được khi mất mạng sau lần mở đầu.
- Lưu ý: bản beta · giao diện editor bằng tiếng Anh · dùng tốt nhất trên máy tính · cần
  WebGPU hoặc WebGL2 · tệp phức tạp có thể hiển thị khác bản gốc · dung lượng tải lần đầu
  từng chức năng (lấy từ bản build thực tế lúc lắp ráp, không viết tay).
- Câu hỏi thường gặp: tệp có bị tải lên không, lưu tệp thế nào, sao lần đầu chậm, dùng
  trên điện thoại được không, có mất phí không.
- Footer: liên kết ERPCons; giấy phép mã nguồn mở; "Dựa trên WordCraft, GridCraft,
  DeckCraft và PdfCraft của nhóm ArtCraft (MIT OR Apache-2.0)"; liên kết 4 repo fork.

Mỗi phần một component trong `src/components/landing/`; `app/page.tsx` chỉ ghép.
Giao diện: token Crimson Ice → `--erp-*`, crimson chỉ cho logo và CTA chính, Inter
Variable tự host qua `next/font`, Bootstrap Icons dạng SVG nội tuyến, theme Light. Chữ tiếng Việt
viết thẳng (chưa có hệ đa ngôn ngữ). Không ảnh chụp màn hình/video; một ảnh OG tĩnh.

### SEO

`metadata` của Next (title, description, canonical, OG, `lang="vi"`), `sitemap.xml` (5
URL), `robots.txt`, JSON-LD `SoftwareApplication` (miễn phí, chạy trên trình duyệt) và
`FAQPage`. Trang editor có title/description/canonical riêng (mục 2).

### Offline — `public/sw.js` viết tay, scope `/`

- HTML (navigation): mạng trước, mất mạng thì bản đã cache.
- Tệp có hash (`.wasm .js .css` và tài nguyên trong `/<slug>/`): cache trước. Chỉ cache khi
  đã dùng — không precache editor.
- Tên cache gắn mã build; bản mới kích hoạt thì xoá cache cũ.
- Engine có tải thêm tài nguyên lúc chạy (font, từ điển, gạch nối) → kiểm khi build thử và
  đưa vào cùng luật.
- Cả 4 editor trong cache tốn khoảng 100–120 MB bộ nhớ trình duyệt.

## 4. Xử lý lỗi

| Tình huống | Hành vi |
| --- | --- |
| Không WebGPU/WebGL2 | Câu báo tiếng Việt trên trang editor, không mở engine |
| Tắt JavaScript | `<noscript>` |
| Mất mạng, chưa mở editor lần nào | Trình duyệt báo lỗi tải; landing (đã cache) ghi rõ cần mở một lần khi có mạng |
| Build: thiếu bản build / điểm chèn / `trunk` lỗi | `assemble.mts` dừng, in app + bước hỏng |

## 5. Kiểm chứng

- Vitest (logic thuần): hàm chèn HTML (đúng chỗ, không chèn hai lần, lỗi khi thiếu điểm
  chèn, cả hai kiểu canvas); `editors.ts` (slug, `canvasId` không trùng); sitemap.
- `tsc`, `eslint`, `next build`, lắp ráp đầy đủ.
- Fork: `cargo xtask ci` qua trên nhánh `tuananhfr` sau khi gỡ ArtCraft.
- Trên `npm run preview`:
  - header: `application/wasm`, `Content-Encoding` khớp tệp nén thật;
  - mở → sửa → lưu → mở lại tệp mẫu `.docx` `.xlsx` `.pptx` `.pdf`;
  - tắt mạng, mở lại editor đã dùng;
  - không request ra origin khác (kể cả từ engine).
- `frontend-visual-qa` (profile responsive) 360/390/430/1440 cho landing và thanh editor;
  Lighthouse SEO + a11y cho landing.
- Kiểm thanh điều hướng với bàn phím: egui có giữ focus phím không; nếu có, ghi lại và xử lý.

## Cần cài trước

Rust ≥ 1.90 (`rustup`), target `wasm32-unknown-unknown`, `trunk`, Visual Studio C++ Build
Tools (test native của `cargo xtask ci`). Node đã có.

## Ngoài phạm vi

Cấu hình Apache + deploy VPS · CI GitHub Actions · tiếng Việt trong editor · đổi tên
"WordCraft…" trong editor · các bản sửa lỗi Rust (mỗi lỗi một việc riêng) · Biểu mẫu.

## Rủi ro

- GridCraft/DeckCraft vẽ thiếu glyph tiếng Việt trên canvas (dữ liệu tệp vẫn đúng).
- Ribbon editor vỡ trên điện thoại.
- Gõ Telex/VNI thật chưa ai thử — cần người thử tay.
- egui có thể giữ focus phím, ảnh hưởng trợ năng của thanh điều hướng.
- `main` upstream có thể mang lỗi mới chưa phát hiện.
- Tên "ERPCons Workspace" chưa tra nhãn hiệu.

Không chặn việc dựng site, nên xử lý trước khi công bố rộng.
