# Bảng thuật ngữ Việt hoá — 4 editor ERPCons Văn phòng

Trạng thái: **đã duyệt hướng** (19/10/2026): tên thẻ, nhóm và lệnh theo Microsoft Office tiếng Việt.

Nguồn chung cho `vi.tsv` (Văn bản, PDF, Trình chiếu) và `vi.rs` (Bảng tính). Thuật ngữ chưa có ở đây
thì dịch theo quy tắc mục 1, ưu tiên cách gọi của Office tiếng Việt, rồi bổ sung vào bảng.

## 1. Quy tắc chung

| Quy tắc | Áp dụng |
|---|---|
| Nguồn thuật ngữ | Tên thẻ, nhóm, lệnh, tính năng: theo Office tiếng Việt để người dùng quen. Câu mô tả, tooltip, nội dung hộp thoại: tự viết, không chép nguyên văn của Microsoft (clean-room, AGENTS.md §2 của các fork) |
| Viết hoa | Tên lệnh và nút theo kiểu Office tiếng Việt: viết hoa chữ đầu mỗi cụm chính ("Lưu Như", "Dán Đặc biệt", "Trang chiếu Mới"). Câu thông báo, mô tả: chỉ viết hoa chữ đầu câu |
| Dấu thanh | Kiểu Office: *hủy, hòa, thủy, khỏe* |
| Xưng hô | "bạn" khi cần; câu ngắn, không "Vui lòng" thừa |
| Dấu "…" | Giữ đúng như bản tiếng Anh (catalog kiểm tra); nghĩa là lệnh mở hộp thoại |
| Placeholder | Giữ nguyên `{name}`, `{n}`…, đặt đúng ngữ pháp tiếng Việt |
| Giữ tiếng Anh | PDF, DOCX, XLSX, PPTX, OCR, JavaScript, HTML, ZIP, Bates, PivotTable, SmartArt; tên phím Ctrl, Shift, Alt, Tab, Enter, Esc |
| Tên sản phẩm | Không dịch WordCraft, GridCraft, DeckCraft, PdfCraft trong câu ghi nguồn |
| Độ dài | Nhãn ribbon và nút ưu tiên ngắn; tooltip giữ đủ nghĩa |
| Không dịch | Id lệnh, dữ liệu trong tài liệu, tên hàm công thức (SUM, IF…) |

## 2. Thẻ ribbon và menu chính

| English | Tiếng Việt | Dùng ở |
|---|---|---|
| File | Tệp | cả 4 |
| Home | Trang đầu | Văn bản, Bảng tính, Trình chiếu |
| Insert | Chèn | 3 editor |
| Draw | Vẽ | 3 editor |
| Design | Thiết kế | Văn bản, Trình chiếu |
| Layout | Bố trí | Văn bản |
| Page Layout | Bố trí Trang | Bảng tính |
| References | Tham chiếu | Văn bản |
| Mailings | Gửi thư | Văn bản |
| Review | Xem lại | 3 editor, PDF |
| View | Xem | cả 4 |
| Developer | Nhà phát triển | Văn bản |
| Help | Trợ giúp | cả 4 |
| Formulas | Công thức | Bảng tính |
| Data | Dữ liệu | Bảng tính |
| Automate | Tự động hóa | Bảng tính |
| Transitions | Chuyển tiếp | Trình chiếu |
| Animations | Hoạt hình | Trình chiếu |
| Slide Show | Trình chiếu | Trình chiếu |
| Record | Ghi | Trình chiếu |
| Table Design | Thiết kế Bảng | Văn bản |
| Picture Format | Định dạng Ảnh | Văn bản |
| Edit | Chỉnh sửa | PDF |
| Pages | Trang | PDF |
| Options / Preferences | Tùy chọn | cả 4 |

## 3. Nhóm lệnh

| English | Tiếng Việt |
|---|---|
| Clipboard | Bảng tạm |
| Font | Phông |
| Paragraph | Đoạn văn |
| Styles | Kiểu |
| Editing | Chỉnh sửa |
| Page Setup | Thiết lập Trang |
| Header & Footer | Đầu trang & Chân trang |
| Illustrations | Hình minh họa |
| Links | Nối kết |
| Symbols | Ký hiệu |
| Tables | Bảng |
| Pages | Trang |
| Text | Văn bản |
| Proofing | Soát lỗi |
| Comments | Chú thích |
| Tracking | Theo dõi |
| Changes | Thay đổi |
| Compare | So sánh |
| Protect | Bảo vệ |
| Accessibility | Trợ năng |
| Language | Ngôn ngữ |
| Views | Dạng xem |
| Show | Hiện |
| Zoom | Thu phóng |
| Window | Cửa sổ |
| Arrange | Sắp xếp |
| Captions | Chú thích Ảnh |
| Footnotes | Cước chú |
| Table of Contents | Mục lục |
| Citations & Bibliography | Trích dẫn & Thư mục |
| Index | Chỉ mục |

## 4. Lệnh và hành động chung

| English | Tiếng Việt |
|---|---|
| New | Mới |
| Open | Mở |
| Recent | Gần đây |
| Save | Lưu |
| Save As | Lưu Như |
| Save a Copy | Lưu Bản sao |
| Close | Đóng |
| Close All | Đóng Tất cả |
| Revert | Hoàn nguyên |
| Print | In |
| Export | Xuất |
| Import | Nhập |
| Share | Chia sẻ |
| Info | Thông tin |
| Undo | Hoàn tác |
| Redo | Làm lại |
| Cut | Cắt |
| Copy | Sao chép |
| Paste | Dán |
| Paste Special | Dán Đặc biệt |
| Select All | Chọn Tất cả |
| Delete | Xóa |
| Duplicate | Nhân đôi |
| Find | Tìm |
| Replace | Thay thế |
| Go To | Đi tới |
| Rotate | Xoay |
| Crop | Cắt xén |
| Group / Ungroup | Nhóm / Bỏ nhóm |
| Bring Forward / Send Backward | Đưa Lên trên / Đưa Xuống dưới |
| Align | Căn chỉnh |
| Apply | Áp dụng |
| OK | OK |
| Cancel | Hủy |
| Done | Xong |
| Clear | Xóa |
| Reset | Đặt lại |
| Apply to All | Áp dụng cho Tất cả |
| More | Thêm |
| Settings | Thiết đặt |
| Properties | Thuộc tính |
| Search | Tìm kiếm |
| About | Giới thiệu |
| Keyboard Shortcuts | Phím tắt |
| Interface language | Ngôn ngữ giao diện |
| Don't Save | Không Lưu |

## 5. Định dạng và văn bản

| English | Tiếng Việt |
|---|---|
| Bold / Italic / Underline | Đậm / Nghiêng / Gạch dưới |
| Strikethrough | Gạch ngang chữ |
| Subscript / Superscript | Chỉ số dưới / Chỉ số trên |
| Font Size / Font Color | Cỡ Phông / Màu Phông |
| Text Highlight Color | Màu Tô sáng Văn bản |
| Align Left / Center / Align Right / Justify | Căn trái / Căn giữa / Căn phải / Căn đều |
| Line and Paragraph Spacing | Giãn cách Dòng và Đoạn |
| Bullets / Numbering | Dấu đầu dòng / Đánh số |
| Increase / Decrease Indent | Tăng / Giảm Thụt lề |
| Margins / Orientation / Size / Columns | Lề / Hướng / Kích thước / Cột |
| Portrait / Landscape | Hướng dọc / Hướng ngang |
| Breaks / Page Break / Section Break | Ngắt / Ngắt Trang / Ngắt Phần |
| Heading / Title / Normal | Đầu đề / Tiêu đề / Thường |
| Format Painter | Sao Định dạng |
| Clear All Formatting | Xóa Tất cả Định dạng |
| Link | Nối kết |
| Footnote / Endnote | Cước chú / Chú thích cuối |
| Track Changes | Theo dõi Thay đổi |
| Spelling & Grammar | Chính tả & Ngữ pháp |
| Word Count | Đếm Từ |
| Change Case | Thay đổi Chữ hoa/thường |

## 6. Đối tượng tài liệu

| English | Tiếng Việt |
|---|---|
| Document | Tài liệu |
| Page | Trang |
| Table | Bảng |
| Picture / Image | Ảnh |
| Shapes | Hình |
| Text Box | Hộp Văn bản |
| Chart | Biểu đồ |
| Theme | Chủ đề |
| Template | Mẫu |
| Comment | Chú thích |
| Bookmark | Dấu trang |
| Attachment | Tệp đính kèm |
| Watermark | Hình mờ |
| Page Color | Màu Trang |

## 7. Bảng tính

| English | Tiếng Việt |
|---|---|
| Workbook | Sổ làm việc |
| Worksheet / Sheet | Trang tính |
| Cell / Row / Column / Range | Ô / Hàng / Cột / Phạm vi |
| Formula / Formula Bar / Function | Công thức / Thanh Công thức / Hàm |
| AutoSum | Tự Tính tổng |
| Fill / Fill Down / Fill Right | Điền / Điền Xuống / Điền Sang phải |
| Sort & Filter / Sort / Filter | Sắp xếp & Lọc / Sắp xếp / Lọc |
| Merge & Center | Phối & Căn giữa |
| Wrap Text | Ngắt Dòng Văn bản |
| Number Format / Format Cells | Định dạng Số / Định dạng Ô |
| Freeze Panes | Cố định Ngăn |
| Conditional Formatting | Định dạng có Điều kiện |
| PivotTable | PivotTable |
| Defined Name | Tên đã Xác định |
| Sum / Count / Average | Tổng / Đếm / Trung bình |
| Ready | Sẵn sàng |

## 8. Trình chiếu

| English | Tiếng Việt |
|---|---|
| Presentation | Bản trình bày |
| Slide | Trang chiếu |
| New Slide | Trang chiếu Mới |
| Layout (slide) | Bố trí |
| Slide Master | Trang chiếu Cái |
| Notes | Ghi chú |
| From Beginning | Từ Đầu |
| From Current Slide | Từ Trang chiếu Hiện tại |
| Presenter View | Dạng xem Diễn giả |
| Click to add title | Bấm để thêm tiêu đề |
| Click to add text | Bấm để thêm văn bản |

## 9. PDF

Acrobat không có giao diện tiếng Việt; dùng cách gọi phổ thông, nhất quán với Office.

| English | Tiếng Việt |
|---|---|
| Organize Pages | Sắp xếp Trang |
| Insert / Extract Pages | Chèn / Trích xuất Trang |
| Split / Combine Files | Tách / Kết hợp Tệp |
| Fill & Sign | Điền & Ký |
| Digitally Sign | Ký số |
| Signature / Initials | Chữ ký / Chữ ký tắt |
| Certificate | Chứng thư số |
| Validate Signatures | Xác thực Chữ ký |
| Form Field / Text Field / Checkbox / Radio Button | Trường Biểu mẫu / Trường Văn bản / Hộp kiểm / Nút Tùy chọn |
| Redact | Che thông tin |
| Protect with Password / Password | Bảo vệ bằng Mật khẩu / Mật khẩu |
| Recognize Text (OCR) | Nhận dạng Văn bản (OCR) |
| Reduce File Size / Optimize | Giảm Kích thước Tệp / Tối ưu |
| Stamp / Sticky Note / Markup | Con dấu / Ghi chú Dán / Đánh dấu |
| Thumbnails | Hình thu nhỏ |
| Fit Width / Actual Size | Vừa Chiều rộng / Kích thước Thực |
| Full Screen / Read Mode | Toàn màn hình / Chế độ Đọc |

## 10. Trạng thái của ERPCons shell (đã dùng, giữ thống nhất)

| Ngữ cảnh | Câu đang dùng |
|---|---|
| Đang tải editor | Đang khởi tạo... |
| Nháp đã lưu | Đã lưu bản nháp trên thiết bị · {giờ} |
| Bảng khôi phục | Có bản nháp chưa lưu từ lần trước · Khôi phục · Bỏ · Để sau |
| Lưu ra tệp | Đã lưu vào tệp / Đã tải bản sao |
