# Đợt 0 — Kết quả kiểm chứng khi chạy (MASTER V2.0)

Ngày 22/10/2026 · Plan: `docs/plans/2026-10-master-v2.md` · Audit gốc: `docs/audit/2026-10-master-v2-g0.md`.
Desktop: engine chạy headless trên Linux (cùng mã với bản Windows/macOS). Web: Chromium trên Windows, production
`https://office.erpcons.ai`, chỉ GET/HEAD. Bằng chứng thô (log, fixture, ảnh) nằm ngoài repo: WSL
`~/erpcons-workspace/w0-out/` và `.playwright-mcp/w0web/out/`, `.playwright-mcp/t21/` ở thư mục workspace.

## Kết luận nhanh
- 5 lỗi P0 của audit đều **tái hiện được**: WORD-01, GRID-02, DECK-05, PDF-01, PDF-02. GRID-10 cũng tái hiện được.
- Tái hiện thêm: GRID-01, GRID-03, GRID-05, T19, WEB-01 (production), WEB-02, DECK-02.
- **Không tái hiện:** T02 (dán 1000 ô, Undo một lần khôi phục đủ); T21 (nút Undo/Redo mờ là đúng "chưa có gì để hoàn tác").
- `daicoc.xls` không có lỗi do hàm chưa hỗ trợ (2284 công thức, 0 lỗi đọc, 1 ô lỗi có sẵn trong tệp).
- Phát sinh 3 lỗi mới (mục 4).

## 1. Desktop / engine dùng chung
| ID | Kiểm tra | Kết quả | Bằng chứng chính |
|---|---|---|---|
| G-01 | Ô lỗi của `daicoc.xls` | Không có lỗi do hàm chưa hỗ trợ; 1 ô lỗi đã có trong cache của tệp | 2284 công thức, 0 parse failure |
| G-02 | GRID-10 sửa → Save / Save As | **Xác nhận lỗi**: cả hai bản lưu mất VBA, thông báo nói "lưu thành .xlsx" | không có `vbaProject.bin` |
| G-03 | GRID-02 công thức hỏng + cache | **Xác nhận lỗi**: A1=123, B1=246 sau Calculate Now; Error Checking rỗng | |
| G-04 | GRID-01 Calculate Sheet | **Xác nhận lỗi**: tính lại cả sheet khác | |
| G-05 | GRID-05 Manual + chèn hàng | **Xác nhận lỗi**: chèn hàng tính lại toàn workbook | |
| G-06 | T02 dán 1000 ô, Undo | Không tái hiện: khôi phục đủ 1000 ô | |
| G-07 | GRID-03 chữ ký VBA `.xlsm` | **Xác nhận lỗi**: mất `vbaProjectSignature.bin`, không cảnh báo | |
| P-01 | PDF-01 Apply → lưu → Undo → lưu | **Xác nhận lỗi**: bản thứ hai có lại `SECRET-123` | |
| P-02 | PDF-02 bí mật trong Title/XMP | **Xác nhận lỗi**: Apply không xoá metadata | |
| P-03 | WORD-01 `altChunk` | **Xác nhận lỗi**: B mất khi lưu, không cảnh báo | |
| P-04 | DECK-05 phục hồi hai lần trước timer | **Xác nhận lỗi**: lần khởi động thứ hai không còn gì để phục hồi | |
| P-05 | T19 sửa PDF đã ký rồi lưu | **Xác nhận lỗi**: lưu incremental không cảnh báo chữ ký mất hiệu lực (Save As có chặn) | |

## 2. Macro trong `daicoc.xls` (chỉ đọc, không chạy)
- 10 module, 15 thủ tục; 9 nút Form Control và 2 nút ActiveX; không có UDF dùng trong ô; không có macro tự chạy
  (`Workbook_Open`/`Auto_Open`), không có dấu hiệu tải mã từ ngoài hay làm rối mã.
- **Loại 1** (chỉ VBA + đối tượng Excel, chạy được bằng trình chạy b1): `tinhthepmax`, `tinhthepall`, `PrintToPDF`,
  `MDB` (`GetOpenFilename`).
- **Loại 3 — COM** (không chạy được trong b1):
  - nhập dữ liệu ETABS qua `DAO.OpenDatabase` (.mdb): `Input974`, `Inputetabs`, `Input2017`, `InputData`;
  - xuất AutoCAD qua `CreateObject("Autocad.Application")`: `XUATCHANCOT`, `XUATAUTOCAD`.
- **Loại 4 — ActiveX:** `CommandButton1_Click`, `CommandButton2_Click`.
- Lỗi sẵn có trong chính tệp: các nút ở tab 2017 gọi macro của bản 9.7.4; một nhánh `Exit Sub` bỏ qua bước khôi phục
  cài đặt ứng dụng; một vòng lặp không có giới hạn.
- Danh sách lệnh, hàm và đối tượng VBA thực sự được dùng (yêu cầu đầu vào của Đợt 3b) nằm trong
  `~/erpcons-workspace/w0-out/macro/analysis.md` §3. Mã nguồn VBA của tệp không đưa vào repo.

## 3. Web (production office.erpcons.ai, Chromium Windows 1280×844)
| ID | Kiểm tra | Kết quả |
|---|---|---|
| W-T21 | Undo/Redo mờ (T21) | Không phải lỗi: Word, Bảng tính, Trình chiếu đều mờ khi chưa có thao tác, sáng sau khi sửa, Redo sáng sau Undo (đo độ tối biểu tượng). PDF web **không có** nút Undo/Redo trên thanh công cụ (đã có trong Đợt 2). |
| W-DECK-02 | Ctrl+Shift+Z ở Trình chiếu | **Xác nhận lỗi**: không Redo; Ctrl+Y thì được |
| W-01 | WEB-01 ghi cache lỗi | **Xác nhận lỗi** trên production: fetch thất bại dù mạng trả 200 (bản sửa đã commit `8d3140a`, chờ deploy) |
| W-02 | WEB-02 IndexedDB mở lỗi | **Xác nhận lỗi** ở cả 4 editor: không có cảnh báo, badge nháp bị ẩn |
| W-03 | Nháp giữ qua reload | Đạt ở cả 4 editor (bytes giống hệt) |
| W-04 | Bộ nhớ sắp đầy (95%) | Đạt: badge "bộ nhớ trình duyệt sắp đầy" |
| W-05 | Ghi nháp bị QuotaExceeded | Đạt: badge "Bộ nhớ trình duyệt đầy: bản nháp mới nhất chưa được lưu" |
| W-06 | Mở `daicoc.xls` trên web | Mở được, khoảng 17 s đến khi hiển thị ổn định; thông báo "Tệp .xls cũ đã được mở. Khi lưu, tệp sẽ được lưu thành .xlsx" (sẽ đổi theo GRID-10) |
| W-07 | Thiết bị thật (iOS/Android/Safari, 7 ngày offline, share, ERP embed) | Thủ công, theo `docs/manual-qa-v2.md` |

## 4. Lỗi mới phát hiện
| ID | Mức | Mô tả | Đề xuất |
|---|---|---|---|
| GRID-11 | P1 | `daicoc.xls` dùng font .VnTime (mã TCVN3/ABC): chữ Việt hiện vỡ (vd. "b¶ng c­êng ®é"). Văn bản có sẵn chức năng chuyển mã cũ → Unicode, Bảng tính chưa có. | Phát hiện mã TCVN3/VNI theo font, đề nghị chuyển sang Unicode (dùng lại bảng chuyển của Văn bản) |
| GRID-12 | P2 | Thanh thông báo khi mở `.xls` có câu tiếng Anh "6 items in this file were handled differently…" | Dịch toàn bộ thông báo mất mát/chuyển đổi |
| PDF-06 | P2 | Màn hình chào của PDF web ghi "Chào mừng bạn đến với PdfCraft", không theo tên sản phẩm ERPCons như bản desktop | Dùng thương hiệu "PDF – ERPCons" cho cả web |

## 5. Câu hỏi chờ chủ dự án
1. Phần nhập ETABS (.mdb/DAO) và xuất AutoCAD của `daicoc.xls` là COM, b1 không chạy. Theo plan thì chúng báo
   "không hỗ trợ". Có muốn làm chức năng thay thế gốc trong app (nhập .mdb/CSV của ETABS, xuất DXF mở được bằng
   UbotCAD) không? Nếu có, xếp vào đợt nào?
2. Đưa GRID-11/12 và PDF-06 vào đợt nào? Lead đề xuất GRID-12 và PDF-06 vào Đợt 2, GRID-11 vào Đợt 4.
