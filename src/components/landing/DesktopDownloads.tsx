import { Icon } from '@/components/Icon.tsx'
import Image from 'next/image'
import { EDITORS } from '@/config/editors.ts'
import { siteFlags } from '@/config/site-flags.ts'
import { DesktopDownloadGate } from './DesktopDownloadGate.tsx'
import { DesktopDownloadLinks } from './DesktopDownloadLinks.tsx'

export function DesktopDownloads() {
  const flags = siteFlags()
  const downloads = <Downloads />
  return <section id="tai-ban-desktop" className="erp-section erp-desktop-download" aria-labelledby="tai-ban-desktop-title">
    <div className="erp-container">
      <div className="erp-desktop-download__heading">
        <span className="erp-desktop-download__platform"><Icon name="windows" /></span>
        <div><h2 id="tai-ban-desktop-title">Tải ứng dụng</h2><p>Windows (64-bit) · Làm việc ngay cả khi ngoại tuyến.</p></div>
      </div>
      {flags.pi
        ? <DesktopDownloadGate signInIcon={<Icon name="box-arrow-in-right" />} signUp={flags.online}>{downloads}</DesktopDownloadGate>
        : downloads}
    </div>
  </section>
}

function Downloads() {
  return <>
    <div className="erp-downloads__suite">
      <div className="erp-downloads__suite-heading"><Image src="/brand/office/office-mark.png" alt="" width={52} height={52} /><div><h3>Trọn bộ ERPCons Office</h3><p>Văn bản, Bảng tính, Trình chiếu và PDF.</p></div></div>
      <DesktopDownloadLinks />
    </div>
    <details className="erp-downloads__individual">
      <summary><Icon name="list-ul" /><span>Tải từng ứng dụng</span><small>4 ứng dụng</small></summary>
      <ul className="erp-downloads__apps">{EDITORS.map(editor => <li key={editor.slug}>
        <Image src={`/brand/office/${editor.slug}-new.png`} alt="" width={34} height={38} />
        <h3>{editor.name}<small>{editor.extension.slice(1).toUpperCase()}</small></h3>
        <DesktopDownloadLinks editor={editor} />
      </li>)}</ul>
    </details>
    <div className="erp-faq erp-downloads__note">
      <details>
        <summary><Icon name="info-circle" /> Thông tin cài đặt</summary>
        <p><strong>Vì sao máy báo cảnh báo khi cài?</strong> Các bộ cài hiện chưa được ký mã (code signing), nên Windows có thể hiển thị cảnh báo.</p>
        <p>Windows SmartScreen: chọn “Thông tin thêm” (More info) → “Vẫn chạy” (Run anyway).</p>
      </details>
    </div>
  </>
}
