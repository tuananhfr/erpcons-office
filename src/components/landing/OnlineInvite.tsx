import { Icon } from '@/components/Icon.tsx'

/** The one landing line of the online tier; a server component, so a build with it off ships none of it. */
export function OnlineInvite() {
  // Only documents saved online leave the device (docs/adr/online-tier.md); the Free line above stays as it is.
  return <p className="erp-hero__trust erp-hero__online" style={{ marginTop: 8 }}>
    <Icon name="cloud-arrow-up" /> <a href="/tai-lieu/">Đăng nhập để lưu online</a> và mở lại ở thiết bị khác
  </p>
}
