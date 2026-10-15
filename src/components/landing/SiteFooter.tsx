import { SITE } from '@/config/editors.ts'
import { FORK_REPOS } from '@/content/landing.ts'

export function SiteFooter() {
  return (
    <footer className="erp-site-footer">
      <div className="erp-container">
        <p><strong>{SITE.name}</strong> · Một sản phẩm của <a href="https://erpcons.vn/">ERPCons</a></p>
        <p>Dựa trên WordCraft, GridCraft, DeckCraft và PdfCraft của nhóm ArtCraft, phát hành theo giấy phép MIT hoặc Apache-2.0.</p>
        <p>Mã nguồn: {FORK_REPOS.map((repo, i) => (
          <span key={repo.url}>{i > 0 ? ' · ' : ''}<a href={repo.url}>{repo.name}</a></span>
        ))}</p>
      </div>
    </footer>
  )
}
