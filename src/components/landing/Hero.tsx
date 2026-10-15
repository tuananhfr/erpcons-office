import { SITE } from '@/config/editors.ts'

export function Hero() {
  return (
    <section className="erp-hero">
      <div className="erp-container">
        <p className="erp-hero__eyebrow">Miễn phí · Không cần cài đặt · Tệp không rời máy</p>
        <h1>{SITE.name}</h1>
        <p className="erp-hero__lead">Soạn văn bản, bảng tính, trình chiếu và PDF ngay trên trình duyệt.</p>
        <a className="erp-btn erp-btn--primary" href="#chuc-nang">Bắt đầu</a>
      </div>
    </section>
  )
}
