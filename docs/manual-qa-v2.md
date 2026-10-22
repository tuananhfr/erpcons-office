# Kiểm tay V2.1 — những việc máy không tự kiểm được

Danh sách cho người kiểm trước khi nghiệm thu V2.1. Mỗi dòng: làm gì, kết quả mong đợi, ô để ghi.
Mọi mục dưới đây đã có test tự động hoặc kiểm bằng Chrome headless ở mức giả lập; mục này kiểm bằng thiết bị
và phần mềm thật. Kết quả ghi vào cột cuối (Đạt / Lỗi + ghi chú).

## 1. Sao chép / dán với phần mềm thật (V2-1)

Nguồn và đích đều là Chrome trên Windows, trừ khi ghi khác.

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| 1.1 | Word thật: chọn đoạn có đậm/nghiêng, danh sách số, bảng có ô gộp, liên kết → Ctrl+C → dán vào Văn bản | Giữ kiểu, font, danh sách thật, bảng, viền, nền, liên kết; một Ctrl+V = một bước Hoàn tác | |
| 1.2 | Google Docs: như 1.1 | Như trên; không có chữ thừa/ký tự lạ | |
| 1.3 | LibreOffice Writer: như 1.1 | Như trên | |
| 1.4 | Văn bản → Word thật (Ctrl+C trong Văn bản, Ctrl+V trong Word) | Chữ và kiểu cơ bản sang đúng | |
| 1.5 | Excel thật: vùng có ô gộp, màu nền, số, ngày, công thức → dán vào Bảng tính | Giữ gộp ô, định dạng, số vẫn là số; công thức vi-VN dùng `;` | |
| 1.6 | Google Sheets, LibreOffice Calc: như 1.5 | Như trên | |
| 1.7 | Bảng tính → Excel thật | Giá trị và định dạng cơ bản sang đúng | |
| 1.8 | PowerPoint thật: chọn bảng và hình trên slide → dán vào Trình chiếu | Bảng thành bảng thật vừa slide; hình giữ nguyên | |
| 1.9 | Trình chiếu → PowerPoint thật | Bảng/hình sang đúng | |
| 1.10 | Dán ảnh chụp màn hình (Win+Shift+S) vào Văn bản, Trình chiếu | Ảnh vào tài liệu, một bước Hoàn tác | |
| 1.11 | Văn bản/Trình chiếu: Ctrl+V một lần | Chỉ dán **một** lần (không dán đôi) | |
| 1.12 | Quyền clipboard: lần đầu bấm nút "Dán" hoặc menu Dán, trình duyệt hỏi quyền; chọn Chặn rồi thử lại | Có thông báo tiếng Việt hướng dẫn Ctrl+V, không treo | |
| 1.13 | PDF có cấm sao chép (`nocopy.pdf`): chọn chữ, bấm Copy | Không sao chép được, có thông báo | |

## 2. Trình duyệt và thiết bị khác

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| 2.1 | Firefox (Windows): mở từng editor, gõ, lưu, Ctrl+V từ Word | `clipboard.read()` bị hạn chế nên nút Dán có thể báo dùng Ctrl+V; Ctrl+V vẫn chạy | |
| 2.2 | Safari (macOS): như 2.1; thêm Trình chiếu toàn màn hình | Không crash; toàn màn hình vào/ra được | |
| 2.3 | iPhone Safari: mở từng editor, gõ, chạm chọn, giữ mở menu, bàn phím ảo không che vùng gõ | Canvas co lại theo bàn phím; hộp chọn tệp mở được tệp docx/xlsx/pptx/pdf | |
| 2.4 | iPhone: thêm vào Màn hình chính, mở như PWA | Mở được, không lệch safe-area | |
| 2.5 | Android Chrome: như 2.3; chia sẻ một tệp vào ứng dụng (share target) | Tệp mở trong đúng editor | |
| 2.6 | Windows: chuột phải tệp .docx/.xlsx/.pptx/.pdf → Mở bằng → ERPCons (PWA đã cài) | Mở đúng editor (OF-10) | |

## 3. Mất dữ liệu và khôi phục (V2-2, V2-3, T05)

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| 3.1 | Sửa, **thoát hẳn Chrome** (không chỉ đóng tab), mở lại | Có đề nghị khôi phục và khôi phục đúng nội dung (máy đã kiểm đóng tab; thoát trình duyệt hẳn chưa) | |
| 3.2 | Chế độ ẩn danh: sửa, đóng cửa sổ ẩn danh | Mất bản nháp là đúng; cảnh báo ở thanh trạng thái nếu có | |
| 3.3 | Bật "Chặn mọi cookie và dữ liệu trang" cho office.erpcons.ai, mở editor | Vẫn dùng được; không có lỗi treo | |
| 3.4 | Mở `.doc`, `.xls`, `.ppt` (định dạng cũ) | Hộp thoại giải thích chưa hỗ trợ, đề nghị lưu lại thành định dạng mới | |
| 3.5 | Văn bản/Trình chiếu/PDF: có thay đổi chưa lưu → Đóng tài liệu | Hộp cảnh báo mất dữ liệu có Lưu / Không lưu / Hủy; Hủy giữ nguyên | |
| 3.6 | Bảng tính: lưu CSV với ô bắt đầu bằng `=`, `+`, `-`, `@` | Excel không chạy công thức (có dấu `'` đứng trước) | |
| 3.7 | PDF: lưu tệp lớn trên đĩa chậm/USB | Quá 60 giây thì có thông báo và tải bản dự phòng | |
| 3.8 | Nhúng trong ERP (lpc.vn): đóng tài liệu cuối | ERP nhận `closed`, đóng/đổi trạng thái iframe | |

## 4. Tiếng Việt và font

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| 4.1 | PDF: gõ chữ có dấu vào ô biểu mẫu, hộp văn bản, "Thêm chữ"; mở bằng Acrobat, Chrome, Foxit | Dấu hiển thị đúng ở cả ba | |
| 4.2 | PDF → Word (.docx) với chữ Việt nhiều dòng; mở trong Word thật | Xuống dòng đúng, font hiển thị đúng | |
| 4.3 | Văn bản: tài liệu TCVN3 (`.VnTime`…) và VNI → lệnh chuyển mã (Xem lại ▸ Ngôn ngữ) | Chữ thành Unicode đúng; kiểm với vài đoạn thật của người dùng | |
| 4.4 | Máy **không** có font Aptos/Calibri: mở tài liệu dùng font đó | Hiện thanh báo "font được thay thế" ở Văn bản, Bảng tính, Trình chiếu | |
| 4.5 | Văn bản/Bảng tính: chữ Nhật, Hàn, Trung, Ả Rập, Do Thái | **Biết lỗi** (xem gap-register): máy chủ không có font; kiểm lại khi có font | |

## 5. Trợ năng và chất lượng

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| 5.1 | Trình đọc màn hình (NVDA/VoiceOver) | **Hoãn**: eframe web chưa có lớp AccessKit; cần lớp DOM riêng. Ghi nhận chưa đạt | Hoãn |
| 5.2 | Zoom trình duyệt 200% ở 1280 px | Không mất nút chính | |
| 5.3 | Chế độ tối/sáng của Windows | Cả 4 editor đọc rõ, ô nhập và hộp kiểm thấy được ở theme sáng | |
| 5.4 | Bàn phím: Ctrl+Tab/Ctrl+Shift+Tab đổi tab tài liệu; F1 mở Phím tắt | Đúng; không bị Chrome chiếm | |

## 6. Nghiệm thu

Người nghiệm thu: ____________ · Ngày: ____________ · Bản production: `20261021-054112` hoặc mới hơn.

- [ ] Mục 1 đạt (hoặc lỗi đã ghi vào gap-register)
- [ ] Mục 2 đạt trên ít nhất Firefox + một điện thoại thật
- [ ] Mục 3 đạt
- [ ] Mục 4 đạt (4.5 ghi nhận lỗi đã biết)
- [ ] Mục 5 đạt (5.1 hoãn)

Chữ ký: ____________
