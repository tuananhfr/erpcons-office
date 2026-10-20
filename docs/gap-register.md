# GAP register — ERPCons Văn phòng so với spec FULL V4

Cập nhật: 20/10/2026 (Wave 5–9 lên production, release `20261020-091402`) · Spec: *ERPCons Office FULL V4 — Keyboard, i18n, Multifile* (15/10/2026).
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
| OF-20 | Release theo thư mục, rollback bằng symlink | Existing | `~/deploy-office.sh` giữ 3 bản; `~/rollback-office.sh` đã diễn tập (Wave 4) |

Việt hoá còn lại: lỗi chi tiết từ engine, tên kiểu ô/undo của engine Bảng tính vẫn tiếng Anh. Ở 320 px
cả 4 editor vỡ bố cục (đã sửa ở Wave 9); ở 768 px thanh trạng thái Trình chiếu và thanh chế độ PDF vẫn chồng chữ.

## Phím tắt (V4.01–V4.06) — Wave 5: trên production 20/10

| Editor | Đã làm | Commit |
|---|---|---|
| Cả 4 | F1 mở "Phím tắt" có ô tìm (nhãn Việt/Anh hoặc phím), danh sách sinh từ chính bảng dispatch và có test bấm thử từng dòng; F12 Lưu Như | — |
| Văn bản | Giữ Ctrl+Shift+S = Áp dụng Kiểu (giống Word); danh sách gồm cả phím người dùng tự gán | wordcraft `38fd9f3` |
| Bảng tính | F4 lặp thao tác cuối trên vùng chọn (allowlist định dạng, viền, tô, định dạng số, chèn/xoá, xoá nội dung); Ctrl+Y = Làm lại, hết thì Lặp lại | gridcraft `540f60c` |
| Trình chiếu | Tìm/Thay thế mới (Ctrl+F/H: hình, ô bảng, ghi chú; khớp hoa/thường, toàn bộ từ); Ctrl+M Trang chiếu Mới; bảng lệnh chuyển sang Alt+Q | deckcraft `7cf0a27` |
| PDF | Ctrl+Y = Làm lại, `+`/`-` trơn để zoom khi không gõ chữ | pdfcraft `8ce8d098` |
| Shell | `keys.js` chặn mặc định trình duyệt cho Ctrl+M, Ctrl+Y, F12 khi đang ở vùng soạn thảo | erpcons-office `d54854f` |

Kiểm trên Chrome (build cục bộ): Ctrl+M, Ctrl+F/H, Alt+Q, F4, F1 + tìm tiếng Việt, F12 gọi hộp lưu ở Văn
bản/Bảng tính/Trình chiếu. F12 và `+`/`-` của PDF mới kiểm bằng test (cần mở tệp).

Còn lại: Chrome giữ Ctrl+N, Ctrl+Shift+N, Ctrl+T, Ctrl+W nên Đi tới trang của PDF không chạy trong tab
trình duyệt (trừ cửa sổ PWA). Kết quả tìm nằm trong ghi chú Trình chiếu chỉ mở khung ghi chú kèm thông báo,
không bôi chọn. Danh sách Phím tắt Văn bản chưa có phím theo ngữ cảnh (F10/Alt keytips, Shift+F10).

## Nhiều tài liệu (§04, §06, V4.08 · OF-01→05, KB-09, KB-15) — Wave 7: trên production 20/10

| Editor | Engine | UI | Ghi chú |
|---|---|---|---|
| Văn bản | 1 tài liệu / `Session`, cất/hoán đổi, tối đa 10 | Thanh tab khi ≥2 tài liệu (7e) | `document_id` duy nhất toàn trang, mỗi tài liệu một bản nháp, "Khôi phục tất cả" mở mỗi bản một tab. Còn: Ctrl+Tab; trộn thư vẫn thay tài liệu đang xem; AutoSave chỉ ghi tài liệu đang xem |
| Bảng tính | `Vec<DocState>`, tối đa 10 | Thanh tab khi ≥2 sổ (7a, gridcraft `f01be07`) | Cửa sổ ẩn theo uid. Chế độ `?host=parent` đánh dấu đúng sổ vừa lưu (7c, `0cfd10e`). Còn dùng chung: thanh notice, pane, tab ribbon |
| Trình chiếu | `Vec<DocState>`, tối đa 10 | Thanh tab khi ≥2 bản (7a, deckcraft `a6a71ff`) | Zoom, cuộn, Slide Sorter riêng từng tài liệu. Còn dùng chung: chế độ xem, task pane, Selection pane |
| PDF | Có tab, cả web | Có | 7d (pdfcraft `ec74f0d3`): web chỉ đánh dấu đã lưu khi trình duyệt ghi xong; Lưu thành đổi tên qua hộp thoại lưu, trình duyệt không có hộp thoại thì hỏi tên trong app |
| Shell | — | — | `host-bridge.js` (nhúng ERP) nhận diện tài liệu theo tên, một `originalName`, một cờ `dirty`; `open-file.js` timer dùng chung |

Hướng đã chốt: tab trong từng editor, tối đa 10 tài liệu; Văn bản dùng cách "cất/hoán đổi" Session.

## Định dạng số và ngày Việt Nam (Bảng tính) — Wave 6: trên production 20/10

"Định dạng vùng" (Tùy chọn ▸ Chung) tách khỏi ngôn ngữ giao diện, mặc định theo ngôn ngữ. Ở vi-VN:
- công thức dùng `;` và thập phân phẩy;
- nhập `1.234,5`, `19/10/2026`, `1.000.000 ₫`;
- ô, thanh trạng thái, biểu đồ, in/PDF, mẫu Định dạng Ô, sao chép/dán và Tìm hiển thị `1.234,50`,
  `19/10/2026`, "tháng 10", "Thứ Hai".

XLSX, CSV, `cell.get` và `TEXT()` giữ chuẩn quốc tế. Commit gridcraft `936a900` (nhập, công thức, ₫) và
`9b82237` (hiển thị); hai commit phải deploy cùng nhau. Còn:
- nhãn nhóm ngày trong pivot ("Qtr1", "Jan");
- phương trình trendline;
- AM/PM chưa thành SA/CH;
- mã tiền tệ dựng sẵn 5–8 và 41–44;
- `TEXT()`/`VALUE()` theo vùng;
- tooltip độ rộng cột ("Độ rộng: 35.39") còn dấu chấm.

## Bảo mật, fidelity, pháp lý — Wave 8: trên production 20/10

| Spec | Nội dung | Trạng thái |
|---|---|---|
| OF-14 | Cảnh báo trước khi lưu chỉnh sửa PDF đã ký | Existing (8a, pdfcraft `ff91b239`): lưu vi phạm DocMDP/FieldMDP bị giữ lại, chỉ cho "Lưu Bản sao…" hoặc Hủy; P=1 hiện thanh khóa và từ chối chỉnh sửa. Còn: FieldMDP chưa khóa trường chỉ-đọc, P=2 chưa làm xám công cụ bình luận |
| OF-11 | Chặn zip bomb, file độc | Existing (8b): 3 fork Office giải nén mọi entry qua một helper đếm byte thật, chặn theo trần entry/tổng/số mục và tỉ lệ >200:1 (entry >4 MiB), trần web nhỏ hơn desktop; PDF có trần giải nén và fuzz. Còn: câu báo tệp hỏng của Bảng tính chưa dịch ("We can't open … not a valid spreadsheet") |
| OF-13 | Golden corpus round-trip | Partial: test round-trip sinh file bằng code; chưa có file docx/xlsx/pptx thật |
| OF-19 | File lớn, nhiều tab | Partial (8f, site `99c3c17`): shell bắt wasm trap / hết bộ nhớ / panic, hiện hộp "Công cụ gặp sự cố và đã dừng" kèm giờ bản nháp gần nhất, nút Tải lại; embed gửi `crashed`. Đo 20/10: 10 tệp xlsx 45 MB làm tab hết bộ nhớ (hộp hiện đúng). Còn trong fork: Bảng tính lưu nháp chặn giao diện 2,8–7,4 s và mở tệp chậm dần theo số sổ đang mở; Văn bản gõ 112 ms/phím ở 509 trang; mẫu Trình chiếu chiếm 1 trong 10 chỗ; PDF scan 200 MB thêm 204 MB heap JS; `crc32` của shell 140–220 ms |
| §10 | CSP, SBOM | Missing: Apache 2.4 (`/etc/apache2/office.erpcons.vn.inc`) chỉ đặt cache và nén, không có header bảo mật; `cargo-deny` có ở cả 4 fork (8d), Trình chiếu còn trượt licenses vì symphonia MPL-2.0 chờ quyết; SBOM CycloneDX qua `npm run sbom` (không public) |
| §11, V4.10 | Audit license fork, font, icon; không dùng nhận diện Microsoft | Partial: 4 fork có NOTICE/ATTRIBUTION/credits; icon landing và logo chính còn hình Word/Excel/PowerPoint/Acrobat — chủ sản phẩm đang làm bộ mới |

## Mobile và trợ năng (§07 · OF-09, OF-15, KB-12) — Wave 9: trên production 20/10

Mục tiêu đã chốt: xem + sửa nhẹ. Dưới 600pt (điện thoại) mỗi editor gọn lại một lần khi qua ngưỡng, người
dùng mở lại được; máy tính bảng dọc và desktop giữ nguyên.

| Chỗ | Đã làm | Commit |
|---|---|---|
| Shell | `viewport-fit=cover`, `interactive-widget=resizes-content`; thanh, canvas, hộp thoại né safe-area; canvas co trên bàn phím iOS (`viewport.js`); hộp chọn tệp có thêm MIME cho iPhone (`file-picker.js`); canvas `role="application"` + nhãn | erpcons-office `5b8e69e` |
| Văn bản | Ribbon tự thu, chạm tab mở ribbon nổi, "⋯" cho Chia sẻ/Xem lại/Chú thích, pane nổi, zoom vừa trang + ẩn thước; chạm: kéo cuộn, chạm đặt con trỏ, giữ chọn từ + menu, vuốt trang ở chế độ Đọc | wordcraft `41dd34c`, `9ad518d` |
| Bảng tính | Ribbon tự thu, pane nổi, thanh tiêu đề/trạng thái bỏ bớt mục thay vì chồng, pivot pane có nút đóng; chạm: lia + quán tính, chạm chọn, chạm đúp sửa, giữ mở menu, núm kéo mở rộng vùng chọn | gridcraft `ff7b7e7` |
| Trình chiếu | Ribbon và tab cuộn, hình thu nhỏ/pane nổi, tab tài liệu cuộn; chạm: lia vùng trống, chạm chọn, kéo hình đã chọn, giữ mở menu; trình chiếu vuốt đổi trang, giữ mở menu | deckcraft `e68d012` |
| PDF | Panel bên tự đóng, thanh chế độ gộp thành nút chọn, nút rail cuộn khi thấp; chạm: kéo cuộn, giữ chọn từ rồi kéo mở rộng, vuốt lật trang | pdfcraft `82fe97ee` |

Kiểm: test kittest từng fork; Chrome 390×844 cảm ứng (CDP) trên bản release và production: kéo cuộn/lia
không bôi chọn, nhấn giữ mở menu ở cả 4 editor. Chưa kiểm trên iPhone/Android thật (inset, bàn phím ảo,
hộp chọn tệp, VoiceOver). Còn: trình đọc màn hình thật (eframe web không có AccessKit — cần lớp DOM riêng);
PDF chưa tự vừa bề rộng trang; Văn bản/Trình chiếu/PDF kéo cuộn chưa có quán tính; canvas chưa có
`touch-action: none` (eframe gắn `touchmove` vào `document` nên Chrome cảnh báo passive; trình duyệt vẫn
không tự cuộn vì `touchstart` trên canvas đã chặn); kiểm zoom 200%. Lưu ý QA: giả lập `deviceScaleFactor`
của Playwright làm canvas eframe vẽ sai tỉ lệ — dùng DSF 1 hoặc `--force-device-scale-factor`.

## Nợ kỹ thuật đã biết

| Chỗ | Vấn đề |
|---|---|
| Văn bản | Test `clicks_on_ribbon_and_status_bar_chrome_keep_typing_in_the_document` hỏng sẵn từ upstream |
| Văn bản, Bảng tính, PDF | `cargo clippy` bản web lỗi sẵn từ upstream (`wordcraft-fonts`, `backstage.rs` Modified, `pdfcraft-render`) |
| Wave 2 minor | Grid/Deck không thử ghi lại khi lưu nháp lỗi; `getAll` nạp hết bytes |
| Trình chiếu | Theme sáng vẽ ô nhập không viền và hộp kiểm không có ô (cả hộp Tùy chọn, Tìm/Thay thế); chữ giữ chỗ "Click to add title" chưa dịch |
| Văn bản, PDF | Chạy test native trên Windows hỏng sẵn (WSL xanh): Văn bản `commands_do_not_touch_the_file_system_themselves`, PDF `a_gotor_link_to_a_directory_or_device_is_refused_without_reading_it` (chập chờn) |

## Ngoài phạm vi

PI ID, PI Control Panel, Workspace/NAS, API §08, OF-08, OF-12, OF-17 (quyết định 16/10/2026).
