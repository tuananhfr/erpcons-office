# GAP register — ERPCons Văn phòng so với spec FULL V4

Cập nhật: 19/10/2026 (sau Wave 3) · Spec: *ERPCons Office FULL V4 — Keyboard, i18n, Multifile* (15/10/2026).
Bằng chứng audit: đọc code nhánh `tuananhfr` của 4 fork, 19/10/2026.

Trạng thái: **Existing** có và đã kiểm · **Partial** có một phần · **Missing** chưa có ·
**Out** đã bỏ khỏi phạm vi. Cột *Wave* là đợt dự kiến trong lộ trình đã duyệt 19/10/2026.

## Đã xong trên production

| Spec | Nội dung | Trạng thái | Bằng chứng |
|---|---|---|---|
| §05 · OF-06, 07, 16, 18 | Nháp tự động, khôi phục, offline, cập nhật SW giữa phiên, quota đầy | Existing | Wave 2, e2e 10/10 |
| §05 | Hai tab cùng sửa: mỗi tab giữ nháp riêng, không ghi đè | Existing | Wave 2, journey two-tabs |
| V4.02 · KB-01 | Ctrl+S đúng editor; chặn phím mặc định trình duyệt | Existing | `editor-shell/keys.js` (Wave 1) |
| V4.06 · KB-07 | Telex/VNI không lỗi chữ (Văn bản, Trình chiếu) | Existing | Wave 1, `DeleteSurrounding`; kiểm lại trên production sau Wave 3 |
| V4.07 · KB-10, KB-14 | Giao diện tiếng Việt cả 4 editor, mặc định `vi` kể cả trình duyệt tiếng Anh, lựa chọn lưu chung `localStorage` `erpcons-ui-language` | Existing | Wave 3, release 20261019-171431 |
| §07 · OF-10 | PWA "Mở bằng" (`file_handlers`, `launchQueue`) | Partial | Kiểm bằng giả lập; chưa kiểm trên Windows thật (Wave 4) |
| OF-20 | Release theo thư mục, rollback bằng symlink | Partial | `~/deploy-office.sh`, giữ 3 bản; chưa diễn tập rollback (Wave 4) |

Việt hoá còn lại: lỗi chi tiết từ engine, tên kiểu ô/undo của engine Bảng tính vẫn tiếng Anh. Ở 320 px
cả 4 editor vỡ bố cục, ở 768 px thanh trạng thái Trình chiếu và tab PDF chồng chữ — bản tiếng Anh y hệt (Wave 9).

## Phím tắt (V4.01–V4.06) — Wave 5

| Editor | Thiếu / sai | Chỗ sửa |
|---|---|---|
| Văn bản | F1. Ctrl+Shift+S giữ là Áp dụng Kiểu (giống Word); Lưu Như F12 có sẵn nhưng trình duyệt mở DevTools | `ui-egui/src/keys.rs:110` |
| Bảng tính | F1; F4 chưa lặp thao tác trong lưới (chưa có "lặp lệnh cuối") | `ui-egui/src/keymap.rs:60`, `grid.rs:2695` |
| Trình chiếu | Ctrl+M, F1, F12; chưa có Tìm/Thay thế nên Ctrl+F mở bảng lệnh, Ctrl+H trống | `ui-egui/src/menus.rs:11` |
| PDF | Ctrl+Y, F1, F12, +/- trơn; `Shortcut` chỉ có dạng Ctrl/Ctrl+Shift | `engine/src/commands.rs:58` |

Chrome giữ Ctrl+N, Ctrl+Shift+N, Ctrl+T, Ctrl+W: trang không nhận được (trừ cửa sổ PWA). Hệ quả: Trang
chiếu Mới (Ctrl+Shift+N) của Trình chiếu và Đi tới trang của PDF không chạy trong tab trình duyệt.
`keys.js` chưa chặn Ctrl+M, Ctrl+Y, F12.

## Nhiều tài liệu (§04, §06, V4.08 · OF-01→05, KB-09, KB-15) — Wave 7

| Editor | Engine | UI | Ghi chú |
|---|---|---|---|
| Văn bản | 1 tài liệu / `Session` | Không | `document_id` bắt đầu từ 1 mỗi Session → trùng khóa nháp `doc-1`; bộ lưu nháp chỉ theo 1 tài liệu |
| Bảng tính | `Vec<DocState>` có sẵn | Không có tab | **Lỗi hiện tại:** mở file thứ hai tạo tài liệu ẩn, không chuyển tới được. `hidden_windows` lưu theo chỉ số (`extra.rs:790`); `host.rs:88` đánh dấu đã lưu theo tài liệu active |
| Trình chiếu | `Vec<DocState>` có sẵn | Không có tab | **Lỗi hiện tại:** như Bảng tính. Zoom, vị trí cuộn dùng chung mọi tài liệu |
| PDF | Có tab, cả web | Có | Web đánh dấu đã lưu ngay khi tải xuống (`editing.rs:636`) |
| Shell | — | — | `host-bridge.js` (nhúng ERP) nhận diện tài liệu theo tên, một `originalName`, một cờ `dirty`; `open-file.js` timer dùng chung |

Hướng đã chốt: tab trong từng editor, tối đa 10 tài liệu; Văn bản dùng cách "cất/hoán đổi" Session.

## Định dạng số và ngày Việt Nam (Bảng tính) — Wave 6

Chỉ có `FormulaLocale { En, Es }` (`formula/src/input.rs:8`), gắn cứng theo ngôn ngữ giao diện
(`ui-egui/src/i18n.rs:117`). Nhập liệu (`core/src/parse.rs:19`) và hiển thị (`numfmt/src/lib.rs:308`) cố
định en-US: chưa có thập phân phẩy, `dd/mm/yyyy`, `₫`. XLSX lưu chuẩn quốc tế — không cần đổi định dạng file.

## Bảo mật, fidelity, pháp lý — Wave 8

| Spec | Nội dung | Trạng thái |
|---|---|---|
| OF-14 | Cảnh báo trước khi lưu chỉnh sửa PDF đã ký | Partial: phát hiện chữ ký, lưu incremental, chặn ghi lại toàn bộ, đọc được DocMDP (`sign/src/pdf.rs:697`); chưa kiểm DocMDP trước khi lưu; FieldMDP không đọc |
| OF-11 | Chặn zip bomb, file độc | Partial: 3 fork Office có trần kích thước/số mục/độ sâu XML, PDF có trần giải nén và fuzz; thiếu kiểm tỉ lệ nén, trần 512 MB–2 GB quá lớn cho wasm |
| OF-13 | Golden corpus round-trip | Partial: test round-trip sinh file bằng code; chưa có file docx/xlsx/pptx thật |
| OF-19 | File lớn, nhiều tab | Missing |
| §10 | CSP, SBOM | Missing: Apache 2.4 (`/etc/apache2/office.erpcons.vn.inc`) chỉ đặt cache và nén, không có header bảo mật; `cargo-deny` chỉ có ở pdfcraft; chưa sinh SBOM |
| §11, V4.10 | Audit license fork, font, icon; không dùng nhận diện Microsoft | Partial: 4 fork có NOTICE/ATTRIBUTION/credits; icon landing và logo chính còn hình Word/Excel/PowerPoint/Acrobat — chủ sản phẩm đang làm bộ mới |

## Mobile và trợ năng (§07 · OF-09, OF-15, KB-12) — Wave 9

Mục tiêu đã chốt: xem + sửa nhẹ. Hiện có: viewport meta, pinch-zoom, cờ thu gọn ribbon, AccessKit bật
trong Cargo (trên web eframe không đưa xuống DOM). Thiếu: thu gọn tự động theo bề rộng, safe-area,
nhấn giữ = menu ngữ cảnh, Files picker iPhone, trình đọc màn hình, kiểm zoom 200%.

## Nợ kỹ thuật đã biết

| Chỗ | Vấn đề |
|---|---|
| Văn bản | Test `clicks_on_ribbon_and_status_bar_chrome_keep_typing_in_the_document` hỏng sẵn từ upstream |
| Văn bản, Bảng tính, PDF | `cargo clippy` bản web lỗi sẵn từ upstream (`wordcraft-fonts`, `backstage.rs` Modified, `pdfcraft-render`) |
| Wave 2 minor | Grid/Deck không thử ghi lại khi lưu nháp lỗi; `getAll` nạp hết bytes |

## Ngoài phạm vi

PI ID, PI Control Panel, Workspace/NAS, API §08, OF-08, OF-12, OF-17 (quyết định 16/10/2026).
