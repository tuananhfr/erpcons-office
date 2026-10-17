import Image from 'next/image'
import { Icon } from '@/components/Icon.tsx'
import { OpenFileButton } from '@/components/landing/OpenFileButton.tsx'

export function Hero() {
  return <section className="erp-hero" aria-labelledby="hero-title">
    <div className="erp-container erp-hero__inner">
      <div className="erp-hero__copy">
        <h1 id="hero-title">Mở tệp là<br /><span>làm việc.</span></h1>
        <p className="erp-hero__lead">Soạn văn bản, bảng tính, trình chiếu và PDF ngay trên trình duyệt.</p>
        <p className="erp-hero__tagline">Miễn phí. Nhanh. Tiện lợi.</p>
        <div className="erp-hero__actions">
          <OpenFileButton icon={<Icon name="folder2-open" />} />
          <a className="erp-btn erp-btn--secondary" href="#chuc-nang"><Icon name="grid" /> Chọn công cụ</a>
        </div>
        <p className="erp-hero__trust"><Icon name="shield-check" /> Không cần tài khoản <span>·</span> Tệp xử lý trên thiết bị</p>
      </div>
      <div className="erp-hero__art"><Image src="/illustrations/workspace.webp" alt="Góc làm việc bên cửa sổ, laptop, cây xanh và sổ tay." width={1536} height={1024} priority sizes="(max-width: 767px) 100vw, 60vw" /></div>
    </div>
  </section>
}
