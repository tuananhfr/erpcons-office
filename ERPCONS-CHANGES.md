# ERPCons changes

- S5-debt (web): Ngăn chọn chữ ở header trình soạn thảo bằng Ctrl+A hoặc nhấp ba lần, giữ liên kết có thể bấm và không ảnh hưởng canvas.
- S5-debt (web): Bỏ thông báo giao diện tiếng Anh đã lỗi thời trên landing vì trình soạn thảo mặc định dùng tiếng Việt.
- S5-debt (web): Thu gọn khoảng cách và ẩn liên kết phụ ERPCons ở 768–1023 px để điều hướng header nằm trên một dòng, giữ nguyên giao diện desktop và điện thoại.

- C-S-closed (web): Gửi `closed` cho ERP khi đóng tài liệu cuối cùng và xóa tên tệp gốc để lần lưu sau không bị ghi vào tệp cũ.

- L-S (web): Kiểm tra phiên bản và cấu trúc trước khi khôi phục bản nháp; nhận bản cũ thiếu `v` là v1 nếu hợp lệ, giữ lại bản không tương thích và hiển thị thông báo, đồng thời tiếp tục khôi phục các bản hợp lệ khác.
