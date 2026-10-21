import { Icon } from '@/components/Icon.tsx'
import { EDITORS } from '@/config/editors.ts'
import { DesktopDownloadLinks } from './DesktopDownloadLinks.tsx'

export function DesktopDownloads() {
  return <section id="tai-ban-desktop" className="erp-section" aria-labelledby="tai-ban-desktop-title">
    <div className="erp-container">
      <h2 id="tai-ban-desktop-title">Tải bản cài trên máy tính</h2>
      <p>Làm việc ngoại tuyến, mở tệp từ máy tính với các công cụ như bản web.</p>
      <ul className="erp-features erp-downloads">{EDITORS.map(editor => <li key={editor.slug}
        className={`erp-feature erp-feature--${editor.slug} erp-downloads__card`}>
        <h3><Icon name={editor.icon} /> {editor.name} – ERPCons</h3>
        <DesktopDownloadLinks editor={editor} />
      </li>)}</ul>
      <div className="erp-faq erp-downloads__note">
        <details>
          <summary>Vì sao máy báo cảnh báo khi cài?</summary>
          <p>Các bộ cài hiện chưa được ký mã (code signing), nên hệ điều hành có thể hiển thị cảnh báo.</p>
          <p>Windows SmartScreen: chọn “Thông tin thêm” (More info) → “Vẫn chạy” (Run anyway).</p>
          <p>macOS: nhấp chuột phải vào ứng dụng → Open (Mở), hoặc chạy trong Terminal:
            <code>{' xattr -dr com.apple.quarantine "/Applications/<tên ứng dụng>.app"'}</code></p>
          <p>Linux AppImage: mở thuộc tính tệp và cho phép chạy tệp như một chương trình.</p>
        </details>
      </div>
    </div>
  </section>
}
