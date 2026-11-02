import Image from 'next/image'
import { Icon } from '@/components/Icon.tsx'
import { EDITORS, editorPath, type EditorSlug } from '@/config/editors.ts'
import { formatSize } from '@/content/landing.ts'
import sizes from '@/generated/editor-sizes.json'

const descriptions: Record<EditorSlug, string> = {
  'van-ban': 'Tạo, chỉnh sửa tài liệu với định dạng DOCX.',
  'bang-tinh': 'Tính toán, phân tích dữ liệu với định dạng XLSX.',
  'trinh-chieu': 'Thiết kế bài thuyết trình với định dạng PPTX.',
  pdf: 'Xem, ghi chú, sắp xếp và ký tệp PDF.',
}

export function FeatureGrid() {
  const known = sizes as Record<string, number | null>
  return <section id="chuc-nang" className="erp-tools" aria-labelledby="chuc-nang-title">
    <div className="erp-container">
      <div className="erp-tools__heading"><div><h2 id="chuc-nang-title">Bốn công cụ chính</h2><p>Đáp ứng nhu cầu văn phòng, học tập và công việc hằng ngày.</p></div><span>Chọn công cụ để bắt đầu <Icon name="arrow-down-right" /></span></div>
      <ul className="erp-features">{EDITORS.map(editor => <li key={editor.slug} className={`erp-feature erp-feature--${editor.slug}`}>
        {/* The name comes from the visible text, not aria-label, so it always contains it (WCAG 2.5.3 label in name). */}
        <a href={editorPath(editor.slug)} target="_blank" rel="noopener" className="erp-feature__link">
          <Image className="erp-feature__logo" src={`/brand/office/${editor.slug}-new.png`} width={64} height={72} alt="" />
          <span className="erp-feature__body"><strong>{editor.name}</strong>{' '}<span className="erp-feature__ext">{editor.extension.slice(1).toUpperCase()}</span>{' '}<span className="erp-feature__description" aria-hidden="true">{descriptions[editor.slug]}</span><span className="erp-sr-only">(tab mới)</span></span>
          <span className="erp-feature__arrow" aria-hidden="true"><Icon name="chevron-right" /></span>
        </a>
        {formatSize(known[editor.slug]) ? <p className="erp-feature__size">Lần đầu tải {formatSize(known[editor.slug])}</p> : null}
      </li>)}</ul>
    </div>
  </section>
}
