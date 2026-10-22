export interface GuideStep {
  text: string
  /** Bootstrap Icons name shown inline where the step names an on-screen button. */
  icon?: string
}

export interface PlatformGuide {
  id: string
  name: string
  browsers: string
  icon: string
  install: GuideStep[]
  open: GuideStep[]
  note?: string
}

// Claims here must match what the site ships: file_handlers + launchQueue (desktop "Open with"),
// share_target (Android), and no share entry on iOS, where web apps cannot receive shared files.
export const PLATFORMS: PlatformGuide[] = [
  {
    id: 'may-tinh',
    name: 'Máy tính',
    browsers: 'Windows, macOS, Linux · Chrome hoặc Edge',
    icon: 'laptop',
    install: [
      { text: 'Mở office.erpcons.ai bằng Chrome hoặc Edge.' },
      { text: 'Bấm "Cài ứng dụng" ở đầu trang, hoặc biểu tượng cài đặt ở cuối thanh địa chỉ.', icon: 'download' },
      { text: 'Văn phòng mở trong cửa sổ riêng và có biểu tượng trên màn hình, thanh tác vụ hoặc Launchpad.' },
    ],
    open: [
      { text: 'Nhấp chuột phải vào tệp DOCX, XLSX, PPTX hoặc PDF, chọn "Mở bằng" rồi chọn Văn phòng.' },
      { text: 'Lần đầu, trình duyệt hỏi có cho Văn phòng mở loại tệp này không. Chọn Cho phép.' },
      { text: 'Hoặc kéo tệp thả vào trang công cụ, hoặc bấm "Mở tệp" ở trang chủ.', icon: 'folder2-open' },
    ],
  },
  {
    id: 'android',
    name: 'Android',
    browsers: 'Chrome',
    icon: 'android2',
    install: [
      { text: 'Mở office.erpcons.ai bằng Chrome.' },
      { text: 'Bấm "Cài ứng dụng" trong menu của trang, hoặc menu ⋮ của Chrome rồi chọn "Cài đặt ứng dụng".', icon: 'three-dots-vertical' },
      { text: 'Văn phòng xuất hiện trên màn hình chính như một ứng dụng.' },
    ],
    open: [
      { text: 'Trong ứng dụng Tệp, Gmail hoặc Zalo, chọn tệp rồi bấm Chia sẻ và chọn Văn phòng.', icon: 'share' },
      { text: 'Tệp mở thẳng trong đúng công cụ: Văn bản, Bảng tính, Trình chiếu hoặc PDF.' },
      { text: 'Hoặc mở Văn phòng, bấm "Mở tệp" và chọn tệp trên máy.', icon: 'folder2-open' },
    ],
    note: 'Văn phòng chỉ có trong danh sách Chia sẻ sau khi đã cài, và một số ứng dụng không cho chia sẻ tệp ra ngoài.',
  },
  {
    id: 'iphone-ipad',
    name: 'iPhone và iPad',
    browsers: 'Safari',
    icon: 'phone',
    install: [
      { text: 'Mở office.erpcons.ai bằng Safari.' },
      { text: 'Bấm nút Chia sẻ của Safari.', icon: 'box-arrow-up' },
      { text: 'Chọn "Thêm vào MH chính" rồi bấm Thêm.', icon: 'plus-square' },
    ],
    open: [
      { text: 'Mở Văn phòng từ màn hình chính và bấm "Mở tệp".', icon: 'folder2-open' },
      { text: 'Chọn tệp trong ứng dụng Tệp, iCloud Drive hoặc thư mục đã tải về.' },
    ],
    note: 'iPhone và iPad không cho ứng dụng web nhận tệp từ nút Chia sẻ, nên hãy mở tệp từ bên trong Văn phòng.',
  },
]

export const SAVING = [
  { icon: 'browser-chrome', title: 'Chrome và Edge', text: 'Ctrl+S (⌘S trên Mac) mở hộp chọn nơi lưu. Bạn chọn thư mục và tên tệp.' },
  { icon: 'browser-firefox', title: 'Firefox và Safari', text: 'Tệp được tải về thư mục Tải xuống. Trên iPhone, xem trong ứng dụng Tệp, mục Tải về.' },
  { icon: 'hdd', title: 'Bản nháp', text: 'Trong lúc sửa, bản nháp được giữ trên máy. Lỡ đóng trang thì mở lại công cụ để khôi phục.' },
]

export const TROUBLES = [
  { icon: 'file-earmark-x', title: 'Loại tệp chưa hỗ trợ', text: 'Văn phòng mở DOCX, XLSX, PPTX và PDF. Tệp DOC, XLS, PPT đời cũ cần lưu lại sang định dạng mới bằng Microsoft Office hoặc LibreOffice.' },
  { icon: 'cloud-arrow-down', title: 'Tệp trên 100 MB', text: 'Nút "Mở tệp" ở trang chủ nhận tối đa 100 MB. Với tệp lớn hơn, mở công cụ rồi dùng menu Tệp bên trong.' },
  { icon: 'exclamation-triangle', title: 'Tệp hỏng hoặc trống', text: 'Công cụ sẽ báo không đọc được. Thử mở tệp bằng phần mềm khác, lưu lại một bản mới rồi mở lại.' },
  { icon: 'info-circle', title: 'Không lưu tạm được tệp', text: 'Máy có thể đã hết dung lượng, hoặc trình duyệt đang ở chế độ ẩn danh hay chặn lưu trữ. Giải phóng bộ nhớ hoặc mở bằng cửa sổ thường.' },
]
