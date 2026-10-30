import { DESKTOP_DOWNLOADS_ENABLED } from '../config/desktop.ts'
import { EDITORS } from '../config/editors.ts'
import sizes from '../generated/editor-sizes.json'

export const WHY = [
  { icon: 'shield-lock', title: 'Tệp không rời máy', text: 'Mọi thao tác chạy ngay trong trình duyệt. Tệp không được tải lên máy chủ nào.' },
  { icon: 'person-check', title: 'Không cần tài khoản', text: 'Mở trang là dùng được, không đăng ký, không đăng nhập.' },
  { icon: 'wifi-off', title: 'Dùng được khi mất mạng', text: 'Sau lần mở đầu tiên khi có mạng, trình soạn thảo vẫn mở được lúc không có kết nối.' },
]

export const NOTICES = [
  'Đây là bản beta: tệp phức tạp có thể hiển thị khác bản gốc. Hãy giữ một bản sao của tệp ban đầu.',
  'Dùng tốt nhất trên máy tính; trên điện thoại một số thanh công cụ có thể bị chật.',
  'Cần trình duyệt có WebGPU hoặc WebGL2 (Chrome, Edge, Firefox, Safari phiên bản mới).',
]

// Sizes come from the last editor build so the answer cannot drift from what users actually download.
export function firstLoadAnswer(sizes: Record<string, number | null>): string {
  const known = Object.values(sizes).filter((mb): mb is number => typeof mb === 'number').map(Math.round)
  const min = Math.min(...known)
  const max = Math.max(...known)
  const range = known.length === 0 ? '' : min === max ? ` (khoảng ${min} MB)` : ` (khoảng ${min} đến ${max} MB tùy chức năng)`
  return `Lần đầu trình duyệt phải tải trình soạn thảo${range}. Từ lần sau phần này đã có sẵn trên máy nên mở nhanh hơn nhiều.`
}

export const FAQ = [
  { question: 'Tệp của tôi có bị tải lên máy chủ không?', answer: 'Không. Tệp được mở và xử lý ngay trong trình duyệt trên máy bạn. Máy chủ chỉ gửi phần mềm trình soạn thảo, không nhận tệp của bạn.' },
  { question: 'Lưu tệp như thế nào?', answer: 'Dùng lệnh lưu của trình soạn thảo (Ctrl+S hoặc menu Tệp). Tệp được tải về máy bạn.' },
  { question: 'Vì sao lần mở đầu tiên chậm?', answer: firstLoadAnswer(sizes) },
  { question: 'Có dùng được trên điện thoại không?', answer: 'Mở được, nhưng giao diện được thiết kế cho màn hình lớn. Để làm việc thoải mái, nên dùng máy tính.' },
  ...(DESKTOP_DOWNLOADS_ENABLED
    ? [{ question: 'Có bản cài trên máy tính không?', answer: 'Có. Đăng nhập PI ID rồi tải bản cài Windows tại mục Tải bản cài trên máy tính.', href: '/#tai-ban-desktop' }]
    : []),
  { question: 'Có mất phí không?', answer: 'Không. ERPCons Văn phòng miễn phí và không cần tài khoản.' },
]

export const FORK_REPOS = EDITORS.map((e) => ({ name: e.upstreamName, url: `https://github.com/tuananhfr/${e.fork}` }))

export function formatSize(mb: number | null | undefined): string | null {
  if (mb === null || mb === undefined) return null
  return `khoảng ${mb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}
