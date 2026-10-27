# Kiểm tay File Access V3: nhận tệp, mở bằng, chia sẻ lại

Danh sách cho người kiểm trên thiết bị thật. Test tự động và Chromium headless đã phủ phần logic (hàng đợi
IndexedDB, mã lỗi, trang `/nhan-tep/`, manifest); mục này kiểm những gì chỉ thiết bị và ứng dụng thật trả lời được:
bảng chia sẻ của hệ điều hành, ứng dụng nguồn (Zalo, Messenger, Gmail, Files), "Mở bằng" của Windows, bộ nhớ thấp.
Chưa có bằng chứng ở đây thì G0 vẫn là **chưa ĐẠT**.

Kết quả ghi vào cột cuối: **ĐẠT**, **LỖI** hoặc **BỊ CHẶN** (không kiểm được, ghi lý do), kèm số phiếu bằng chứng ở mục 4.

## 0. Chuẩn bị

- Bản cần kiểm: mở `https://office.erpcons.ai/build-info.json` (hoặc bản staging), chép `siteSha` và `sha` của
  từng fork vào phiếu bằng chứng.
- Fixture: trên máy có checkout, chạy `node scripts/qa-fixtures.mts` (thêm `--large` cho TC22). Tệp nằm ở
  `.qa-tmp/file-access/`, bảng sha256 ở `SHA256SUMS.md` cùng thư mục. Chép sang điện thoại bằng cáp hoặc Google Drive
  rồi lưu về máy (Files). **Không dùng tệp của khách hàng.**
- Corpus của các fork không có sẵn tệp Office mẫu. Tạo tệp tổng hợp (ví dụ một DOCX, XLSX có công thức, PPTX lưu
  từ chính Văn phòng hoặc LibreOffice, nội dung tự gõ), đặt vào một thư mục rồi chạy
  `node scripts/qa-fixtures.mts --extra <thư mục>`: script chép chúng vào bảng sha256 và tự sinh
  `docx/hong-cat-cut.docx` (docx bị cắt cụt).
- Cài PWA: Chrome/Edge → biểu tượng cài trên thanh địa chỉ (Android: menu ⋮ → Cài đặt ứng dụng). Mở mỗi công cụ
  một lần khi có mạng để trình duyệt lưu sẵn.
- Xem bên trong: Android nối máy tính, mở `chrome://inspect` → trang Văn phòng → **Network** (kiểm không có tải lên)
  và **Application → IndexedDB → erpcons-file-transfer-v1 → pending** (trạng thái, `claimedMime`, `errorCode`).
  Trên Windows/macOS dùng DevTools (F12) của chính cửa sổ PWA.
- Thông báo lỗi luôn kết thúc bằng `(Mã: …)`. Ghi lại mã này vào phiếu.

## 1. Ma trận thiết bị

| Thiết bị | Hệ điều hành / trình duyệt | Cách vào | Ứng dụng nguồn | Ca áp dụng |
|---|---|---|---|---|
| Android | Chrome, PWA đã cài | Bảng chia sẻ | Zalo, Messenger, Gmail, Files | TC01, TC03, TC09–TC15, TC17–TC19, TC21, TC22, R1–R3 |
| iPhone/iPad | Safari (không có share target cho PWA) | Nút "Mở tệp" trên trang chủ | Files | TC04, TC10, TC12, TC13, TC17, TC18 |
| Windows | Chrome và Edge, PWA đã cài | "Mở bằng" trong Explorer, nút "Mở tệp" | Explorer | TC06, TC09, TC10, TC14, TC15, TC17, TC18, R2 |
| macOS | Chrome, PWA đã cài | "Mở bằng" trong Finder, nút "Mở tệp" | Finder | TC06, TC13, TC17 |

Ghi đủ hãng, đời máy, phiên bản hệ điều hành, phiên bản trình duyệt và ứng dụng nguồn vào phiếu. Ca nào chưa có
thiết bị thì ghi **BỊ CHẶN**, không suy ra từ thiết bị khác.

## 2. Ca kiểm

### 2.1 Nhận tệp vào

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| TC01 | Android: trong Zalo mở một tin có tệp DOCX tổng hợp → Chia sẻ → Văn phòng. Lặp lại với tệp đã lưu về máy, chia sẻ từ Files | Hiện trang "Nhận tệp" với một dòng DOCX; bấm "Mở 1 tệp trong Văn bản" thì mở đúng nội dung (chia sẻ không bao giờ tự mở công cụ, xem mục 3). Network chỉ có `POST /share-target/` do service worker trả (cột Size ghi "ServiceWorker"), không có request nào mang tệp lên máy chủ. Nếu Zalo chỉ gửi liên kết thì làm tiếp TC11 và ghi lại | |
| TC03 | Android: Gmail, thư có XLSX đính kèm (có công thức `SUM`, `IF`, tham chiếu sheet khác) → Chia sẻ → Văn phòng | Mở trong Bảng tính; chọn ô có công thức, thanh công thức hiện đúng công thức, giá trị khớp Excel | |
| TC04 | iPhone Safari: trang chủ → "Mở tệp" → Files → chọn DOCX | Mở trong Văn bản. Lặp lại với XLSX, PPTX, PDF: mỗi tệp chọn được và mở đúng công cụ | |
| TC06 | Windows Chrome rồi Edge (PWA đã cài): chuột phải `.docx` → Mở bằng → Văn phòng; lặp lại với `.xlsx`, `.pptx`, `.pdf`. Chọn hai tệp `.docx` cùng lúc → Mở bằng | Mỗi tệp mở đúng công cụ, trong cửa sổ mới (không thay cửa sổ đang mở). Hai tệp chọn cùng lúc mở thành hai tài liệu. macOS Finder: như trên | |
| TC09 | Android Files: chọn cùng lúc 5 tệp `pdf/form.pdf`, `csv/showcase-data.csv`, `txt/README.txt`, `trung-ten/a/Báo cáo tháng 10.pdf`, `pdf/hong-cat-cut.pdf` (hoặc `docx/hong-cat-cut.docx`) → Chia sẻ → Văn phòng | Trang "Nhận tệp" chia nhóm theo công cụ, mỗi nhóm có nút "Mở N tệp trong …". Mở từng nhóm: 4 tệp tốt mở bình thường; tệp hỏng báo "Công cụ không mở được tệp này: …" `(Mã: PARSER_FAILED)` ở công cụ và "Không mở được" trên trang "Nhận tệp" khi quay lại, không làm hỏng 4 tệp kia | |
| TC09b | Như TC09 nhưng thay tệp hỏng bằng `docx/gia-mao.docx` và `pdf/trong.pdf`, thêm một tệp thứ 6 | `gia-mao.docx` "Bị từ chối" `(Mã: INVALID_SIGNATURE)`; `trong.pdf` "Tệp đang trống" `(Mã: INVALID_SIGNATURE)`; tệp thứ 6 bị từ chối `(Mã: QUOTA_EXCEEDED)` "Mỗi lần chỉ nhận tối đa 5 tệp"; các tệp còn lại mở được | |
| TC10 | Chia sẻ (hoặc chọn) lần lượt `trung-ten/a/Báo cáo tháng 10.pdf` và `trung-ten/b/Báo cáo tháng 10.pdf` (cùng tên, khác nội dung: "Ban A", "Ban B") | Mở thành hai tài liệu riêng, trang 1 lần lượt ghi "Ban A" và "Ban B"; không tài liệu nào thay tài liệu kia. Lưu cả hai: tệp thứ hai không ghi đè tệp thứ nhất | |
| TC11 | Android: trong Chrome hoặc Zalo, chia sẻ một **liên kết** (không phải tệp) → Văn phòng | Trang hướng dẫn "Ứng dụng nguồn chỉ gửi liên kết, không gửi tệp…" với nút "Chọn tệp trên máy". Liên kết không hiện trên trang; Network không có request nào tới địa chỉ đó | |
| TC12 | Chia sẻ 2 tệp → ở trang "Nhận tệp" chưa bấm mở. Chỉnh giờ thiết bị tới sau 61 phút (hoặc chờ 1 giờ) → tải lại trang. Lặp lại với một tệp: giữ lại địa chỉ `/<công cụ>/?open=…`, sau 1 giờ mở lại địa chỉ đó | Trang "Lô tệp đã hết hạn" có "Chọn lại tệp" và "Về trang chủ"; địa chỉ `?open=` cũ báo "Tệp tạm đã hết hạn hoặc đã được dọn" `(Mã: PERMISSION_EXPIRED)` kèm lối thoát. IndexedDB không còn bản ghi đó sau lần ghi kế tiếp. Trả giờ thiết bị về như cũ | |
| TC13 | Mở cả 4 công cụ một lần khi có mạng → bật chế độ máy bay → trang chủ "Mở tệp" chọn DOCX; chia sẻ một PDF vào app; chia sẻ 2 tệp cùng lúc | Chọn tệp và chia sẻ một tệp: mở được không cần mạng. Chia sẻ 2 tệp: trang "Nhận tệp" hiện từ bộ nhớ đệm, đủ danh sách và nút "Mở N tệp trong …" (không phải trang "Không tải được trang này"); bấm mở thì công cụ đã mở trước đó nhận tệp | |
| TC14 | Sửa một tài liệu (chưa lưu) → triển khai bản mới lên staging (hoặc chờ bản mới) → không đóng tab, sửa tiếp, rồi tải lại | Tab đang mở vẫn chạy (tệp của bản cũ còn được giữ); sau khi tải lại có đề nghị khôi phục bản nháp, nội dung đủ | |
| TC15 | Chrome DevTools → Application → Storage → "Simulate custom storage quota" đặt 1 MB (Android: máy gần đầy bộ nhớ) → chọn hoặc chia sẻ tệp 2 MB | Thông báo rõ `(Mã: QUOTA_EXCEEDED)` hoặc `(Mã: NO_SPACE)`, có lối mở trực tiếp từ menu Tệp. Tài liệu đang mở, bản nháp và tệp gốc không mất | |
| TC21 | Android: chia sẻ `lon/lon-95mb.pdf` từ Files rồi vuốt tắt Files ngay lập tức | Hoặc mở được, hoặc báo "Không đọc được tệp được chia sẻ… hãy chia sẻ lại" `(Mã: SOURCE_UNAVAILABLE)`. Không treo ở "Đang khởi tạo…" quá 2 phút. Sau 1 giờ, lần chọn hoặc chia sẻ tệp kế tiếp, hoặc lần mở trang "Nhận tệp" / một địa chỉ `?open=`, xóa bản ghi đã hết hạn (IndexedDB không còn nó) | |
| TC22 | Android máy RAM thấp (≤ 4 GB): chia sẻ `lon/lon-95mb.pdf`; Windows: Mở bằng cùng tệp | Mở được hoặc báo lỗi có mã; tab không bị trình duyệt tắt im lặng (nếu sập thì phải hiện hộp "tải lại"). Sau khi mở, IndexedDB không còn giữ bytes của tệp (`file` trống). Ghi bộ nhớ của tab (Task Manager của Chrome) | |

### 2.2 An toàn và tệp đặc biệt

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| TC17 | Mở `pdf/co-script.pdf` (JavaScript khi mở và XFA có script) bằng chia sẻ, Mở bằng và chọn tệp. Chia sẻ cùng `pdf/form.pdf` tệp trong `ten-dao-chieu/` (tên chứa ký tự đảo chiều U+202E: Files hiện "hoa-donfdp.docx", đuôi thật `.pdf`) | Không có hộp thoại "TC17: … ran", Network không có request tới `example.invalid`; nếu PDF có thanh báo tài liệu chứa script thì ghi lại. Tệp đảo chiều nằm trong nhóm PDF (không phải Văn bản) và mở trong PDF; tên trên trang "Nhận tệp" và trên banner là "hoa-donxcod.pdf", không bị đảo | |
| TC18 | Mở `pdf/da-ky.pdf` → thêm chữ → Lưu | Có cảnh báo chữ ký số sẽ mất hiệu lực trước khi lưu | |

### 2.3 Chia sẻ lại

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| TC19 | Trên từng thiết bị của ma trận: ở mỗi công cụ có lệnh "Chia sẻ…" (xem TC19b), mở một tệp (DOCX, XLSX, PPTX tổng hợp hoặc `pdf/form.pdf`) → "Chia sẻ…" → Zalo → gửi vào "Cloud của tôi". Tải tệp từ Zalo về; ở cùng trạng thái tài liệu, dùng "Tải xuống" lấy một bản để so | Bảng chia sẻ mở ngay khi chạm; sau khi gửi có "Đã gửi bản xuất ‘tên’". Tệp nhận được mở lại đúng nội dung, đúng tên và đuôi. Ghi sha256 của cả hai bản; khác nhau thì ghi chú (dấu thời gian trong tệp nén có thể khác) | |
| TC19b | Trên từng thiết bị và trình duyệt của ma trận: mở cả 4 công cụ, xem có lệnh "Chia sẻ…" không | Lệnh hiện hay ẩn theo đúng việc trình duyệt đó có cho chia sẻ loại tệp ấy không (`navigator.canShare`), nên kết quả có thể khác nhau giữa các trình duyệt và hệ điều hành. Ghi lại bảng: thiết bị, trình duyệt, phiên bản × DOCX/XLSX/PPTX/PDF → hiện/ẩn. Lệnh ẩn không phải LỖI; "Tải xuống" vẫn dùng được | |

### 2.4 Rủi ro riêng của Office

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| R1 | Zalo: chia sẻ lần lượt DOCX, XLSX, PDF từ một đoạn chat và từ "Cloud của tôi" | Văn phòng có trong bảng chia sẻ của Zalo với cả ba loại. Ghi `claimedMime` và tên tệp Zalo gửi (IndexedDB) cho từng lần; nếu Văn phòng không hiện trong bảng chia sẻ thì ghi lại MIME/đuôi của tệp | |
| R2 | Đang sửa A (chưa lưu) trong Văn bản → từ Zalo hoặc Explorer mở B vào Văn phòng | B mở ở cửa sổ/tab mới; A vẫn còn nguyên các thay đổi chưa lưu, không bị điều hướng đi | |
| R3 | Android và iPhone: chạm "Chia sẻ…" ở mọi công cụ có hiện lệnh này theo TC19b (Văn bản: ribbon/Backstage; Bảng tính: popup Chia sẻ; Trình chiếu: menu Tệp; PDF: menu Tệp). Lệnh bị ẩn thì không tính ở đây | Bảng chia sẻ mở ngay. Nếu lệnh **có hiện** mà tệp bị tải xuống kèm "Không mở được bảng chia sẻ…", tức là mất user activation: ghi **LỖI** kèm công cụ và vị trí lệnh. Lệnh hiện nhưng chạm vào chỉ tải xuống, không có thông báo, nghĩa là trình duyệt từ chối đúng loại tệp đó (ví dụ `.xlsm`): ghi lại loại tệp, không tính LỖI activation | |

## 3. Giới hạn đã biết (không tính là lỗi)

- iOS: PWA không có share target; Share Extension (TC05) cần app native, ngoài phạm vi.
- Lệnh "Chia sẻ…" chỉ hiện khi trình duyệt cho chia sẻ đúng loại tệp đó; trình duyệt nào cho loại nào thì ghi
  theo TC19b trên thiết bị thật. Bản desktop không có lệnh này.
- Ngay sau khi triển khai bản mới, nếu thiết bị đang offline và công cụ chỉ còn trang của bản cũ trong bộ nhớ đệm,
  trang cũ chỉ hiểu một mã `?open=`: nút "Mở N tệp trong …" với N > 1 báo tệp tạm hết hạn, tệp vẫn còn trong lô.
  Có mạng lại (trang công cụ được tải mới) thì bấm lại nút đó trên trang "Nhận tệp" là mở được.
- Chia sẻ từ bảng chia sẻ của hệ điều hành luôn dừng ở trang "Nhận tệp" chờ người dùng bấm mở, kể cả khi chỉ có
  một tệp: trình duyệt không phân biệt được bảng chia sẻ với một trang web khác tắt referrer (xem
  `docs/file-transfer.md`). Trang lạ vẫn có thể ghi tệp vào bộ nhớ tạm (tối đa 200 MB mỗi lần, tự xóa sau 1 giờ)
  nhưng không mở được công cụ.
- "Chia sẻ…" gửi một bản xuất; không đồng bộ ngược về ứng dụng nguồn.
- Công cụ chưa có hook báo kết quả thì trạng thái dừng ở "Đã chuyển vào công cụ" thay vì "Đã mở".

## 4. Phiếu bằng chứng (mỗi ca một phiếu, theo §09)

```
Mã ca:
siteSha (/build-info.json):
sha fork (wordcraft / gridcraft / deckcraft / pdfcraft):
Thiết bị, hệ điều hành, phiên bản:
Trình duyệt / PWA, phiên bản:
Ứng dụng nguồn, phiên bản:
Fixture (đường dẫn + sha256 từ SHA256SUMS.md):
Các bước đã làm:
Mong đợi:
Thực tế (kèm mã lỗi nếu có):
Ảnh chụp / video (đường dẫn):
Log đã lược bỏ thông tin cá nhân (nếu có):
Kết quả: ĐẠT / LỖI / BỊ CHẶN (lý do):
Người kiểm:                      Ngày:
```

Ảnh, video và log để ngoài repo (không commit), chỉ ghi đường dẫn.

## 5. Nghiệm thu

Người nghiệm thu: ____________ · Ngày: ____________ · Bản: `siteSha` ____________

- [ ] Mục 2.1 đạt trên ít nhất một Android thật với Zalo, Gmail, Files và một Windows có PWA
- [ ] TC04 đạt trên một iPhone thật
- [ ] Mục 2.2 đạt
- [ ] TC19 và R3 đạt trên Android thật
- [ ] R1, R2 có phiếu bằng chứng
- [ ] Mọi ca BỊ CHẶN có lý do và kế hoạch kiểm lại

Chữ ký: ____________
