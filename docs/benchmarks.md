# Đo hiệu năng — V2-6 (21/10/2026)

Production `https://office.erpcons.vn`, bản `20261021-054112`. Chrome headless (Playwright) trên máy dev, mạng nội bộ,
cache ấm (cùng một context, tải lại iframe mỗi lượt). **20 lượt mỗi editor**, đơn vị ms.

Cách đo: trang giả `http://localhost:3000` (nằm trong `erpEmbedHosts` mặc định) nhúng editor qua iframe và dùng
giao thức embed v1 (`docs/erp-embed.md`).

- **ready**: tải iframe → bridge gửi `ready`. Đây là lúc shell sẵn sàng, **không** gồm tải wasm.
- **open**: gửi `open` (bytes) → editor trả `opened`.
- **save**: Ctrl+S → editor gửi `save` kèm bytes (tới khi serialize xong; ack `saved` gửi ngay sau đó).

| Editor | Tệp thử | ready P50 / P95 | open P50 / P95 / max | save P50 / P95 / max |
|---|---|---|---|---|
| Văn bản | `long-30p.docx` (4,7 KB) | 253 / 510 | 336 / 1802 / 6005 | 8 / 10 / 21 |
| Bảng tính | `rows500.xlsx` (18 KB) | 247 / 460 | 319 / 916 / 1803 | 10 / 11 / 27 |
| Trình chiếu | `saved-rich.pptx` (6 KB) | 248 / 459 | 332 / 673 / 1590 | 19 / 24 / 25 |
| PDF | `text_vi.pdf` (577 KB) | 234 / 239 | 321 / 370 / 1893 | 8 / 11 / 14 |

Đọc kết quả:
- Đạt mục tiêu chung "mở và lưu tệp nhỏ dưới 2 giây ở P95". Điểm xa nhất là lượt đầu của Văn bản (6,0 s, mở lạnh
  lúc wasm chưa được biên dịch xong); các lượt sau 0,3–0,6 s.
- Đây là tệp nhỏ. Tệp lớn đã đo ở Wave 8 (xem `docs/gap-register.md`, OF-19): Bảng tính lưu nháp chặn giao diện
  2,8–7,4 s, Văn bản gõ 112 ms/phím ở 509 trang, PDF scan 200 MB thêm 204 MB heap. Các số đó **chưa** được cải thiện ở V2.1.
- "open" tính tới lúc engine nhận tệp, chưa gồm khung hình đầu tiên vẽ xong.
- Lưu bằng `showSaveFilePicker` thật (ghi ra đĩa) chưa đo: bridge thay bằng handle giả, nên "save" chỉ là thời gian
  serialize.

## Không đo (SKIPPED)

- **Dán (paste)**: Chrome headless không cho cấp quyền `clipboard.read()` ổn định cho iframe khác origin, và thời
  gian dán phụ thuộc kích thước nguồn (Word/Excel thật). Hành vi dán đã có test và golden test CLIP-10 (V2-1);
  đo thời gian dán với tài liệu lớn đưa vào mục kiểm tay (`docs/manual-qa-v2.md`).
- **Mở lạnh có xoá cache** (tải 4 gói wasm qua mạng): phụ thuộc đường truyền người dùng, không đo ở đây.

Lượt thử đầu bị loại: Trình chiếu với `rich.pptx` (có đối tượng OLE) bật hộp "Lưu sẽ mất một số nội dung", nên Ctrl+S
không gửi `save` trong 60 s; đây là hành vi đúng của V2-2, không phải lỗi. Dùng tệp không có OLE cho số liệu trên.

Tập lệnh đo: `v2-audit/v26/bench.mjs` (trong thư mục QA, ngoài repo).
