# Nhúng editor vào ERP (Protocol v1)

ERPCons (`lpc.vn`) mở tệp của Drive dự án trong một editor của office.erpcons.ai bằng iframe khác origin.
Khi lưu, ERP nhận bytes về và ghi thành phiên bản mới. Mã editor chỉ sống ở repo này. Phía ERP chỉ là lớp
mỏng `src/features/core/office/` trong `erpcons_frontend`.

Cầu nối: `editor-shell/host-bridge.js`, được tiêm vào trang của cả 4 editor cùng các script shell khác
(`src/lib/editor-shell/assets.ts`). Không sửa mã Rust nào.

## Kích hoạt

URL iframe: `https://office.erpcons.ai/<editor>/?embed=erpcons&parent=<origin ERP, encodeURIComponent>`

Bridge chỉ bật khi đủ hai điều kiện:

- `embed=erpcons`;
- `parent` khớp đúng một origin trong `window.erpEmbedHosts`.

`window.erpEmbedHosts` được ghi vào trang lúc build từ biến môi trường `ERPCONS_EMBED_HOSTS`. Biến này là danh
sách origin cách nhau bởi dấu phẩy; mục nào không phải origin `http(s)` trần thì bị bỏ. Khi không đặt biến, giá
trị mặc định là `https://lpc.vn` và các cổng dev `3000`, `3001` của `localhost` / `127.0.0.1` (`src/config/embed.ts`).

Khi bridge bật:

- thanh shell 40px bị ẩn (`html.erp-embedded`), vì điều hướng do trang ERP lo;
- kho bản nháp (`drafts.js`) không cài, vì ERP mới là nơi giữ phiên bản.

## Thông điệp

Mọi thông điệp có dạng `{ ns: 'erp-office', v: 1, type, ... }`. Cả hai phía đều bỏ qua thông điệp sai `ns`,
sai `v`, khác origin, hoặc không đến từ đúng cửa sổ (`parent` / `contentWindow`).

### Office → ERP

| type | payload | khi nào |
|---|---|---|
| `ready` | `editor` (slug: `van-ban`, `bang-tinh`, `trinh-chieu`, `pdf`) | bridge đã sẵn sàng nhận tệp |
| `opened` | `name` | editor đã nhận tệp |
| `closed` | (không có) | người dùng đã đóng tài liệu cuối cùng trong editor; ERP có thể đóng iframe/panel hoặc hiển thị trạng thái bắt đầu của mình |
| `open-failed` | `reason` (tiếng Việt, hiển thị được) | editor từ chối tệp |
| `save` | `id`, `name`, `bytes` (ArrayBuffer, transfer), `ack` (boolean) | người dùng lưu đúng tên tệp đang mở |
| `dirty` | `dirty` (boolean) | trạng thái chưa lưu thay đổi |
| `crashed` | (không có) | editor đã dừng (Rust panic, wasm trap, hết bộ nhớ); iframe hiện hộp "Công cụ gặp sự cố và đã dừng" với nút "Tải lại trang". ERP có thể bỏ qua |

`closed` không thay thế `dirty`: ERP vẫn phải xử lý `dirty` để theo dõi thay đổi chưa lưu.

`crashed` do `editor-shell/crash-guard.js` gửi, tối đa một lần cho mỗi lần tải trang. Thay đổi chưa lưu kể từ lần
`save` gần nhất coi như mất. Khi người dùng bấm "Tải lại trang", iframe tải lại cùng URL và gửi lại `ready`;
ERP trả lời bằng `open` như mọi lần nhận `ready`.

### ERP → Office

| type | payload | khi nào |
|---|---|---|
| `open` | `name`, `bytes` (ArrayBuffer) | gửi tệp vào mỗi lần nhận `ready`: bản đã lưu thành công gần nhất, không phải bản tải lúc đầu |
| `saved` | `id` | đã ghi xong phiên bản mới |
| `save-failed` | `id`, `message` | ghi thất bại; editor báo lỗi bằng `message` |

## Bắt thao tác lưu

Mỗi editor lưu theo một cách, nên bridge bắt ở hai chỗ:

- **Cả bốn editor** lưu qua `window.showSaveFilePicker` (tra lúc bấm lưu; PdfCraft từ Wave 7d). Bridge thay
  hàm này bằng một handle giả `createWritable → write → close`. Lời gọi `close()` chỉ resolve khi ERP trả
  `saved`, và reject khi ERP trả `save-failed` hoặc quá 120 giây. Vì vậy editor hiện đúng "đã lưu" hoặc "lỗi".
- **Thẻ `<a download>`** trỏ tới `blob:` rồi thu hồi URL ngay: PdfCraft vẫn dùng cho bản in và khi
  `showSaveFilePicker` lỗi trước khi mở. Bridge giữ blob theo URL tới lúc bị thu hồi, chặn cú bấm và gửi
  `save` với `ack: false`.

Chỉ lần lưu **trùng tên** tệp đang mở (không phân biệt hoa thường) mới thành phiên bản mới. Mọi thứ khác đều
tải về máy, kể cả lưu cùng định dạng dưới tên khác, xuất sang định dạng khác (`.docx → .pdf`) hay bản in của
PdfCraft (`… (print).pdf`). Với Word/Excel/PowerPoint, bridge tự tải bytes về bằng thẻ `<a download>` thay vì
gọi hộp thoại lưu thật: `showSaveFilePicker` bị chặn trong iframe khác origin.

Khi một lần lưu thất bại, GridCraft tự tải tệp về bằng thẻ `<a download>` làm phương án dự phòng. Bridge để
cú tải đó đi qua (trong 5 giây, cùng tên) thay vì bắt lại thành một lần lưu nữa.

## Phía ERP

- Các lần lưu chạy nối tiếp; lần sau dựa trên phiên bản lần trước vừa tạo (`baseVersion`). Phiên bản đã đổi
  trên server → 409, ERP báo xung đột và cho tải bản đang sửa về hoặc mở bản mới nhất.
- Lưu xong, ERP giữ bytes vừa lưu làm tài liệu hiện tại. Editor tải lại trong iframe sẽ nhận bản này, nên lần
  lưu kế tiếp không đè ngược các lần lưu trước.
- Danh sách Drive tải lại sau mỗi lần lưu. Nếu lần tải lại đó lỗi, iframe vẫn giữ nguyên (không mất phần đang sửa).
- ERP hỏi xác nhận khi rời trang nếu: còn lần lưu đang chạy/chờ; hoặc editor báo còn thay đổi chưa lưu; hoặc
  chưa có lần lưu thành công nào. Riêng PDF, khi editor chưa từng gửi `dirty` thì luôn hỏi.

## Giới hạn đã biết

- **Lưu qua `<a download>` không có ack.** Editor không chờ ERP ở đường này, nên lỗi lưu chỉ hiện ở phía ERP.
- **Tín hiệu `dirty` chậm.** Tín hiệu này đi theo nhịp tự lưu nháp của editor (gọi `erpDrafts.put/remove`),
  không theo từng phím gõ. PdfCraft chỉ có cầu nối nháp từ commit `d61177f0` của fork; bản build cũ hơn không
  bao giờ báo `dirty`.
- **Nhận diện theo tên tệp, không theo tài liệu.** Editor mở được nhiều tài liệu cùng lúc (tab), nhưng bridge
  chỉ biết tên tệp ERP gửi vào, không biết tab nào đang lưu. Nếu người dùng mở thêm một tệp trên máy **trùng
  tên** (ví dụ bản sao `HopDong.docx`) hoặc lưu một tài liệu khác dưới đúng tên đó, Ctrl+S ở tab ấy cũng thành
  phiên bản mới của tệp ERP. ERP giữ lịch sử phiên bản nên lấy lại được bản trước. Muốn chặn hẳn thì editor phải
  báo cho bridge tài liệu nào đang lưu (đổi giao tiếp ở cả 4 fork) — chưa làm.
- Bản desktop (Electron) không dùng cơ chế này.

## Việc ngoài repo

Apache của `office.erpcons.ai` phải cho phép ERP nhúng trang. Header cần trả về:

```
Content-Security-Policy: frame-ancestors 'self' https://lpc.vn
```

Đồng thời header **không** được có `X-Frame-Options: DENY` hoặc `X-Frame-Options: SAMEORIGIN`. Kiểm tra bằng
lệnh `curl -sI https://office.erpcons.ai/bang-tinh/`.

Phía ERP cũng phải cho phép origin này trong `frame-src` (`erpcons_frontend/docs/security/nginx-headers.md`).
