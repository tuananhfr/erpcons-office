export const CATEGORIES = ['Tất cả', 'Miễn phí', 'Công việc', 'Cuộc sống', 'Doanh nghiệp'] as const
export type Category = typeof CATEGORIES[number]
export interface EcosystemTool {
  id: string
  name: string
  description: string
  icon: string
  logo?: string
  color: string
  categories: Category[]
  href?: string
}
export const ECOSYSTEM_TOOLS: EcosystemTool[] = [
  { id: 'office', name: 'Văn phòng', description: 'Soạn thảo, bảng tính, trình chiếu và PDF.', icon: 'files', logo: '/brand/van-phong-icon-192.png', color: 'blue', categories: ['Miễn phí', 'Công việc'], href: '/#chuc-nang' },
  { id: 'chuyen-nho', name: 'Chuyện Nhỏ', description: 'Bộ công cụ tiện ích hằng ngày.', icon: 'tools', logo: '/brand/ecosystem/chuyen-nho.png', color: 'blue', categories: ['Cuộc sống', 'Công việc'] },
  { id: 'suc-khoe-so', name: 'Sức Khỏe Số', description: 'Kiểm tra website và trải nghiệm sử dụng.', icon: 'heart-pulse', logo: '/brand/ecosystem/suc-khoe-so.png', color: 'cyan', categories: ['Công việc', 'Doanh nghiệp'] },
  { id: 'suc-khoe-dn', name: 'Sức Khỏe DN', description: 'Đánh giá hoạt động doanh nghiệp.', icon: 'bar-chart', logo: '/brand/ecosystem/suc-khoe-dn.png', color: 'green', categories: ['Doanh nghiệp'] },
  { id: 'lich-gia-dinh', name: 'Lịch Gia Đình', description: 'Lịch chung cho cả gia đình.', icon: 'calendar-heart', logo: '/brand/ecosystem/lich-gia-dinh.png', color: 'pink', categories: ['Cuộc sống'] },
  { id: 'so-nha', name: 'Sổ Nhà', description: 'Hồ sơ số ngôi nhà của bạn.', icon: 'house', logo: '/brand/ecosystem/so-nha.png', color: 'orange', categories: ['Cuộc sống'] },
  { id: 'ubotbuild', name: 'UbotBuild', description: 'Công cụ thiết kế và xây dựng.', icon: 'cone-striped', logo: '/brand/ecosystem/ubotbuild.png', color: 'red', categories: ['Công việc', 'Doanh nghiệp'] },
  { id: 'ubotview', name: 'UbotView', description: 'Chụp ảnh và ghi nhận thực tế.', icon: 'camera', logo: '/brand/ecosystem/ubotview.png', color: 'purple', categories: ['Công việc'] },
  { id: 'ubotconnect', name: 'UbotConnect', description: 'Kết nối đa kênh.', icon: 'diagram-3', logo: '/brand/ecosystem/ubotconnect.png', color: 'blue', categories: ['Doanh nghiệp'] },
  { id: 'tekshot', name: 'Tekshot OS', description: 'Truyền thông và vận hành AI.', icon: 'film', logo: '/brand/ecosystem/tekshot.png', color: 'purple', categories: ['Công việc', 'Doanh nghiệp'] },
  { id: 'erpcons', name: 'ERPCons', description: 'Quản trị doanh nghiệp toàn diện.', icon: 'buildings', logo: '/brand/ecosystem/erpcons.png', color: 'red', categories: ['Doanh nghiệp'], href: 'https://erpcons.ai/' },
]
export function filterTools(tools: EcosystemTool[], category: Category, query: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi')
  const search = normalize(query.trim())
  return tools.filter(tool => (category === 'Tất cả' || tool.categories.includes(category)) && normalize(tool.name + ' ' + tool.description).includes(search))
}
