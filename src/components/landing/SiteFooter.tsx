import { Brand } from '@/components/Brand.tsx'
import { FORK_REPOS } from '@/content/landing.ts'

export function SiteFooter() {
  return <footer className="erp-site-footer">
    <div className="erp-container">
      <div className="erp-site-footer__top"><Brand /><p>Công việc nhẹ hơn.<br />Cuộc sống vui hơn.</p><a href="https://erpcons.vn/">Tìm hiểu ERPCons ↗</a></div>
      <div className="erp-site-footer__legal"><p>Dựa trên WordCraft, GridCraft, DeckCraft và PdfCraft của nhóm ArtCraft, phát hành theo giấy phép MIT hoặc Apache-2.0.</p>
      <p>Mã nguồn: {FORK_REPOS.map((repo, i) => <span key={repo.url}>{i > 0 ? ' · ' : ''}<a href={repo.url}>{repo.name}</a></span>)}</p>
      <p>© 2026 ERPCons. Những tiện ích nhỏ, tạo thay đổi lớn. Miễn phí cho mọi người.</p></div>
    </div>
  </footer>
}
