# ERPCons changes

- Office Online GĐ2 (web, M1+M2): tab "Được chia sẻ với tôi", hộp Chia sẻ kiểu Google Docs (email, vai trò, hạn, đường liên kết chỉ xem, cài đặt), Lịch sử phiên bản (xem, tải về, khôi phục, chủ sở hữu xoá phiên bản cũ), trang mở đường liên kết không cần đăng nhập (mã nằm sau `#link=`, gửi qua header `X-Link-Token`, không vào URL hay log), nút Chia sẻ/Lịch sử trên thanh trình soạn thảo, `erpHost` v2 (chế độ xem/nhận xét, `setMode`, `setUser`, lưu bản sao khi mất quyền). Chỉ có khi bật online; bản Free không đổi.
- PI ID (web): Đăng nhập PI ID tùy chọn cho landing và bốn trình soạn thảo (cửa sổ bật lên, PKCE S256, xoay vòng refresh token, đồng bộ giữa các tab, chọn tổ chức, quyền theo gói qua `window.erpAccount`). Tắt bằng `PI_ACCOUNT_ENABLED` nên bản triển khai chưa đổi; service worker không lưu trang `/dang-nhap/`.
- WEB-06/WEB-07: Ghi và kiểm tra nguồn gốc bản build của bốn trình soạn thảo (`/build-info.json`), xuất SBOM CycloneDX cho site và bộ cài, thêm cổng bắt buộc ký mã `ERPCONS_REQUIRE_SIGNING` (mặc định tắt).
- WEB-02/WEB-04/T22/T23 (web): Nhãn bản nháp luôn hiện đúng trạng thái kể cả khi trình duyệt chặn lưu; giao thức `state` v2 cho nhãn theo từng tài liệu và phiên bản; cảnh báo khi bộ nhớ trình duyệt đầy mà vẫn giữ bản nháp cũ; chỉ cập nhật service worker khi người dùng bấm và bản nháp đã lưu xong.
- Desktop suite: Thêm bộ ERPCons Văn phòng gồm bốn ứng dụng cho Windows, macOS, Linux; kiểm tra SHA-256, thử cài đặt trong CI và ưu tiên tải trọn bộ trên landing.
- GĐ4 (web): Thêm mục "Tải bản cài trên máy tính" cho cả bốn trình soạn thảo (Windows, macOS, Linux), làm nổi bản cài hợp với hệ điều hành, kèm ghi chú phát hành và hướng dẫn khi máy cảnh báo bộ cài chưa ký mã.
- S5-debt (web): Ngăn chọn chữ ở header trình soạn thảo bằng Ctrl+A hoặc nhấp ba lần, giữ liên kết có thể bấm và không ảnh hưởng canvas.
- S5-debt (web): Bỏ thông báo giao diện tiếng Anh đã lỗi thời trên landing vì trình soạn thảo mặc định dùng tiếng Việt.
- S5-debt (web): Thu gọn khoảng cách và ẩn liên kết phụ ERPCons ở 768–1023 px để điều hướng header nằm trên một dòng, giữ nguyên giao diện desktop và điện thoại.

- C-S-closed (web): Gửi `closed` cho ERP khi đóng tài liệu cuối cùng và xóa tên tệp gốc để lần lưu sau không bị ghi vào tệp cũ.

- L-S (web): Kiểm tra phiên bản và cấu trúc trước khi khôi phục bản nháp; nhận bản cũ thiếu `v` là v1 nếu hợp lệ, giữ lại bản không tương thích và hiển thị thông báo, đồng thời tiếp tục khôi phục các bản hợp lệ khác.
