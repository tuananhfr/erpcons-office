import { Icon } from '@/components/Icon.tsx'
import { InstallAppButton } from '@/components/InstallAppButton.tsx'

export function HelpCard() {
  return <aside className="erp-help" aria-label="Hướng dẫn và cài ứng dụng">
    <div className="erp-help__guide"><span className="erp-help__icon"><Icon name="book" /></span><div><h2>Hướng dẫn sử dụng</h2><p>Một chút hướng dẫn, bắt đầu dễ hơn.</p><ul><li><Icon name="check2" /> Mở, chỉnh sửa và lưu tệp</li><li><Icon name="check2" /> Cài ứng dụng trên từng thiết bị</li><li><Icon name="check2" /> Mẹo sử dụng và câu hỏi thường gặp</li></ul><a href="/huong-dan/">Xem hướng dẫn <Icon name="arrow-right" /></a></div></div>
    <div className="erp-help__pwa"><Icon name="window-stack" /><div><h3>Cài Office trên trình duyệt</h3><p>Mở nhanh từ màn hình chính với ứng dụng PWA.</p></div><InstallAppButton variant="header" icon={<Icon name="download" />} shareIcon={<Icon name="box-arrow-up" label="Chia sẻ" />} /></div>
  </aside>
}
