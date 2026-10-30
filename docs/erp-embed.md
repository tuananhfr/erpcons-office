# Nhúng editor vào ERP (Protocol v1 và v2)

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

Phần này là protocol v1; v2 ở mục [Protocol v2](#protocol-v2-autosave-qua-erphost).

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

## Protocol v2: AutoSave qua `erpHost`

Protocol v2 nối giao tiếp `window.erpHost` của editor (`docs/erp-host.md`, có trong 4 fork từ nhánh `feat/online-v2`)
với trang ERP. Nhờ vậy editor nhúng có AutoSave (3 s / 30 s), báo xung đột, mất mạng và chế độ chỉ xem.

### Kích hoạt và chọn giao thức

URL iframe: `https://office.erpcons.ai/<editor>/?embed=erpcons&v=2&parent=<origin ERP, encodeURIComponent>`.
Origin được kiểm như v1. Không có `v=2` thì bridge chạy v1 y như trước: `ready` v1 gửi ngay, không có `erpHost`.

Với `v=2`, bridge tạo `window.erpHost` (`version: 2`) trước khi wasm chạy. Bridge chưa gửi `ready` ngay mà chờ editor:

- Editor có `erpHost` gọi `erpHost.ready(...)` ở khung hình đầu. Khi đó bridge gửi `ready` với `v: 2, host: true`.
- Editor build cũ không gọi `erpHost.ready`. Bridge chờ thêm 1,5 s sau khi editor báo khung hình đầu
  (`erpDrafts.ready`), hoặc tối đa 120 s nếu editor không khởi động được. Hết thời gian đó, bridge gửi `ready` v1
  và từ đó chạy đúng v1 (Lưu tay).
- Trong lúc chờ, bridge bỏ qua mọi thông điệp của ERP. ERP chỉ gửi `open` sau khi nhận `ready`.

Office prod cũ (chưa có v2) bỏ qua `v=2` và gửi `ready` v1 ngay. ERP nhận biết giao thức bằng `ready.v`: gặp `1`
thì lùi về luồng v1 ở trên. Đây là đường dự phòng.

### Thông điệp v2

Mọi thông điệp có dạng `{ ns: 'erp-office', v: 2, type, ... }`. Kiểm origin và cửa sổ như v1. Sau khi đã chọn v2,
bridge bỏ qua thông điệp `v: 1`.

| Hướng | type | payload |
|---|---|---|
| Office → ERP | `ready` | `editor`, `host: true` |
| ERP → Office | `open` | `doc: { docId, name, format, bytes (ArrayBuffer), revision, mode, canDownload }`. Gửi lại ở mỗi lần nhận `ready` |
| Office → ERP | `opened` / `open-failed` / `crashed` / `closed` | như v1 (`opened`: `name`; `open-failed`: `reason` tiếng Việt) |
| Office → ERP | `save` | `id`, `docId`, `revision`, `reason` (`auto` / `manual` / `flush`), `bytes` (ArrayBuffer, transfer) |
| ERP → Office | `save-result` | `id`, `result` = `{status:'saved',version}` / `{status:'conflict',latestVersion}` / `{status:'offline'}` / `{status:'failed',retryable,message}` |
| ERP → Office | `set-mode` | `docId`, `mode` (`edit` / `comment` / `view`), `canDownload` |
| ERP → Office | `flush` | `id`. Office trả `flushed { id }` khi mọi `save` đã được gửi |

Cách bridge chuyển sang `erpHost`:

- **`open`** thành `open({ docId, version: revision, title: name, format, bytes: Uint8Array, mode, canDownload })`.
  `revision` là số phiên bản trên server (thiếu thì `0`). Thiếu `format` thì lấy đuôi của `name`. Thiếu `mode` thì
  editor coi là `edit`, thiếu `canDownload` thì coi là `true`. Một `mode` lạ thì editor mở chỉ xem. Thông điệp thiếu
  `docId`, `name` (chuỗi) hoặc `bytes` (ArrayBuffer) bị bỏ qua.
- **`opened`** gửi khi editor báo `erpHost.opened(docId, true)` cho tài liệu ERP đã mở. **`open-failed`** gửi khi
  editor từ chối tài liệu đó. **`closed`** gửi khi người dùng đóng tab của tài liệu đó; `erpEditorClosed` không gửi
  thêm lần nữa. **`crashed`** giống v1, chỉ đổi sang `v: 2`.
- **`save`**: `revision` và `reason` lấy nguyên từ `erpHost.save(docId, bytes, { revision, reason })`. `revision` là
  bộ đếm chỉnh sửa của editor, không phải số phiên bản server. Bytes được chép ra rồi transfer.
- **`save-result`**: `result` được chuyển cho editor đúng các dạng ở bảng trên. Dạng khác thành
  `{ status: 'failed', retryable: false, message: 'Lưu thất bại' }`. `id` không khớp lần lưu nào thì bị bỏ qua.
- **Hết 60 s mà ERP chưa trả `save-result`**, bridge trả `{ status: 'offline' }` cho editor. Editor vẫn giữ tài
  liệu ở trạng thái chưa lưu và AutoSave tiếp. Lần lưu đó vẫn được nhớ, cùng với các lần ERP trả `offline` hoặc
  `failed` có `retryable: true`. Nếu sau đó ERP gửi `save-result` với `saved` cho cùng `id` (trả muộn, hoặc ERP tự
  thử lại và đã lưu được), bridge gọi `acknowledged(docId, revision, version)` để editor đánh dấu đã lưu. Kết quả
  muộn khác `saved` không được báo cho editor.
- **`set-mode`** thành `setMode(docId, mode, canDownload)`. Editor không bao giờ tự bỏ phần đang sửa, xem
  `docs/erp-host.md`. Muốn chắc phần đang gõ đã được gửi trước khi hạ quyền, ERP gửi `flush`, rồi `set-mode`, rồi
  `flush` lần nữa.
- **`flush`** gọi `flush()` của editor. Editor trả lời khi mọi tài liệu có sửa đổi đã được giao cho `erpHost.save`,
  nên các `save` đó luôn đến ERP trước `flushed`. Câu trả lời không chờ `save-result`. Nếu editor không trả lời
  trong 10 s, bridge vẫn gửi `flushed`.

### Phía ERP (v2)

Ánh xạ kết quả API sang `save-result`: 200 → `saved`; 412 → `conflict`; mất mạng / 5xx → `offline`; 423 →
`failed` (không retry) kèm `set-mode` view; 403 / 404 → `failed` kèm `set-mode` view; 409 LOCKED → `failed`. Bản
RELEASED / SUPERSEDED luôn mở với `mode: 'view'`.

### Không có trong v2

- `dirty`: ERP tự theo dõi các `save` đang chạy. Trước khi đóng, ERP gửi `flush`.
- `saved` / `save-failed` của v1: thay bằng `save-result`.
- `setUser`: editor dùng tên tác giả cục bộ cho nhận xét và đánh dấu sửa đổi.
- Tệp người dùng tự mở thêm trong iframe, Lưu Như, Xuất và In: vẫn tải về máy như v1, không thành phiên bản trên ERP.

## Việc ngoài repo

Apache của `office.erpcons.ai` phải cho phép ERP nhúng trang. Header cần trả về:

```
Content-Security-Policy: frame-ancestors 'self' https://lpc.vn
```

Đồng thời header **không** được có `X-Frame-Options: DENY` hoặc `X-Frame-Options: SAMEORIGIN`. Kiểm tra bằng
lệnh `curl -sI https://office.erpcons.ai/bang-tinh/`.

Phía ERP cũng phải cho phép origin này trong `frame-src` (`erpcons_frontend/docs/security/nginx-headers.md`).
