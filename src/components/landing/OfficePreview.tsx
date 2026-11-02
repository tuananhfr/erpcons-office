import Image from 'next/image'
import { EDITORS } from '@/config/editors.ts'
import { Icon } from '@/components/Icon.tsx'

// A code-rendered illustration: every mark uses the same asset as the real tool cards.
// Sample documents are deliberately illustrative and have no interactive controls.
export function OfficePreview() {
  return <div className="erp-office-preview" role="img" aria-label="Minh họa không gian Office với bốn công cụ Văn bản, Bảng tính, Trình chiếu và PDF. Tên tài liệu là ví dụ minh họa.">
    <div className="erp-office-preview__laptop" aria-hidden="true">
      <div className="erp-office-preview__frame">
        <div className="erp-office-preview__screen">
          <div className="erp-office-preview__topbar">
            <span className="erp-office-preview__brand"><Image src="/brand/office/office-mark.png" alt="" width={28} height={28} /><b>Offi<span>ce</span><small>by ERPCons</small></b></span>
            <span className="erp-office-preview__search"><Icon name="search" /> Tìm kiếm tài liệu…</span><Icon name="bell" /><span className="erp-office-preview__avatar">PI</span>
          </div>
          <div className="erp-office-preview__workspace">
            <div className="erp-office-preview__sidebar"><span className="erp-office-preview__active"><Icon name="house" /> Trang chủ</span><span><Icon name="plus-lg" /> Tạo mới</span><span><Icon name="folder2" /> Tài liệu của tôi</span><span><Icon name="cloud" /> Cloud Office</span><i />{EDITORS.map(editor => <span key={editor.slug}><Image src={`/brand/office/${editor.slug}-new.png`} alt="" width={17} height={19} />{editor.name}</span>)}<i /><span><Icon name="trash" /> Thùng rác</span></div>
            <div className="erp-office-preview__content">
              <strong className="erp-office-preview__heading">Bắt đầu công việc của bạn</strong>
              <div className="erp-office-preview__tools">{EDITORS.map(editor => <div key={editor.slug}><Image src={`/brand/office/${editor.slug}-new.png`} alt="" width={44} height={48} /><strong>{editor.name}</strong><small>{editor.extension.slice(1).toUpperCase()}</small></div>)}</div>
              <div className="erp-office-preview__recent-heading"><strong>Tài liệu gần đây</strong><span>Ví dụ minh họa</span></div>
              <div className="erp-office-preview__files">{EDITORS.map((editor, index) => <div key={editor.slug}><Image src={`/brand/office/${editor.slug}-new.png`} alt="" width={20} height={24} /><span>{['Báo cáo dự án', 'Dự toán công trình', 'Thuyết trình dự án', 'Hợp đồng mẫu'][index]}{editor.extension}</span><small>Hôm nay</small><Icon name="three-dots" /></div>)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="erp-office-preview__base"><span /></div>
    </div>
  </div>
}
