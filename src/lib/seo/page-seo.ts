import { SITE, type EditorEntry } from '../../config/editors.ts'

export const SEO_BRAND = 'Văn phòng by ERPCons'
export const SEO_ASSETS = {
  favicon: '/favicon.ico',
  icon16: '/brand/van-phong-icon-16.png',
  icon32: '/brand/van-phong-icon-32.png',
  icon192: '/brand/van-phong-icon-192.png',
  icon512: '/brand/van-phong-icon-512.png',
  maskable512: '/brand/van-phong-maskable-512.png',
  logo64: '/brand/van-phong-logo-64.png',
  apple: '/brand/van-phong-apple-180.png',
  image: '/brand/van-phong-social.png',
  imageAlt: 'Văn phòng by ERPCons: soạn văn bản, bảng tính, trình chiếu và PDF trực tuyến.',
} as const

export interface PageSeo {
  title: string
  description: string
  url: string
}

export function createPageSeo(path: string, title: string, description: string): PageSeo {
  return { title: `${title} | ${SEO_BRAND}`, description, url: new URL(path, SITE.origin).href }
}

export const HOME_SEO = createPageSeo(
  '/',
  'Văn phòng trực tuyến miễn phí',
  'Mở và chỉnh sửa DOCX, XLSX, PPTX, PDF ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp được xử lý trên thiết bị của bạn.',
)

export const EXPLORE_SEO = createPageSeo(
  '/kham-pha/',
  'Công cụ cho công việc và cuộc sống',
  'Khám phá hệ sinh thái ERPCons: công cụ văn phòng trực tuyến và các giải pháp dành cho công việc, gia đình, cuộc sống và doanh nghiệp.',
)

export const GUIDE_SEO = createPageSeo(
  '/huong-dan/',
  'Cài ứng dụng và mở tệp',
  'Hướng dẫn cài Văn phòng by ERPCons trên máy tính, Android, iPhone và iPad, mở tệp DOCX, XLSX, PPTX, PDF bằng "Mở bằng" hoặc nút Chia sẻ, và nơi lưu tệp.',
)

export function editorSeo(editor: EditorEntry): PageSeo {
  return createPageSeo(`/${editor.slug}/`, editor.seoTitle, editor.seoDescription)
}
