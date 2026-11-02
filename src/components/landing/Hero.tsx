import { Icon } from '@/components/Icon.tsx'
import { OnlineInvite } from '@/components/landing/OnlineInvite.tsx'
import { OpenFileButton } from '@/components/landing/OpenFileButton.tsx'
import { siteFlags } from '@/config/site-flags.ts'
import { NewDocumentMenu } from './NewDocumentMenu.tsx'
import { OfficePreview } from './OfficePreview.tsx'

export function Hero() {
  return <section className="erp-hero" aria-labelledby="hero-title">
    <div className="erp-container erp-hero__inner">
      <div className="erp-hero__copy">
        <p className="erp-hero__eyebrow">BỘ CÔNG CỤ VĂN PHÒNG TRỰC TUYẾN</p>
        <h1 id="hero-title">Làm việc<br /><span>mọi lúc, mọi nơi.</span></h1>
        <p className="erp-hero__lead">Soạn thảo, bảng tính, trình chiếu, đọc và chỉnh sửa PDF.<br className="erp-hero__desktop-break" /> Dùng ngay trên web hoặc cài đặt PWA. Miễn phí, không cần đăng nhập.</p>
        <div className="erp-hero__actions">
          <OpenFileButton label="Mở tệp từ thiết bị" icon={<Icon name="folder2-open" />} />
          <NewDocumentMenu />
        </div>
        <ul className="erp-hero__benefits">
          <li><Icon name="lightning-charge" /><span>Dùng ngay<small>không cần tài khoản</small></span></li>
          {siteFlags().online
            ? <li><Icon name="cloud" /><span>Lưu trữ Cloud<small>khi có PI ID</small></span></li>
            : <li><Icon name="wifi-off" /><span>Làm việc ngoại tuyến<small>sau lần mở đầu tiên</small></span></li>}
          <li><Icon name="pc-display" /><span>Linh hoạt mỗi ngày<small>Web, PWA, Windows</small></span></li>
          <li><Icon name="shield-check" /><span>Chủ động dữ liệu<small>trên thiết bị của bạn</small></span></li>
        </ul>
        <p className="erp-hero__trust erp-sr-only">Không cần tài khoản <span>·</span> Tệp xử lý trên thiết bị</p>
        {siteFlags().online && <OnlineInvite />}
      </div>
      <div className="erp-hero__art"><OfficePreview /></div>
    </div>
  </section>
}
