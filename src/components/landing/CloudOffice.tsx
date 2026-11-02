import { Icon } from '@/components/Icon.tsx'
import { CloudOfficeAction } from './CloudOfficeAction.tsx'

export function CloudOffice() {
  return <section className="erp-container erp-cloud" aria-labelledby="cloud-title">
    <div className="erp-cloud__inner">
      <span className="erp-cloud__icon"><Icon name="cloud" /></span>
      <div className="erp-cloud__copy"><h2 id="cloud-title">Cloud Office <span>(tùy chọn)</span></h2><p>Lưu trữ, chia sẻ và mở lại tài liệu trên nhiều thiết bị khi đăng nhập PI ID.</p></div>
      <ul><li><Icon name="pc-display" /> Mở trên nhiều thiết bị</li><li><Icon name="people" /> Chia sẻ và phân quyền</li><li><Icon name="clock-history" /> Lịch sử phiên bản</li><li><Icon name="folder2" /> Sắp xếp theo thư mục</li></ul>
      <CloudOfficeAction />
    </div>
  </section>
}
