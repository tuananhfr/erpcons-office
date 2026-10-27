import type { MouseEvent, ReactNode, Ref } from 'react'
import type { BatchGroup, BatchRow, BatchView, RowTone } from '@/lib/files/batch-view.ts'

export interface BatchIcons {
  editors: Record<string, ReactNode>
  tones: Record<RowTone, ReactNode>
  refused: ReactNode
  open: ReactNode
  retry: ReactNode
  cancel: ReactNode
}

function Row({ row, icons }: { row: BatchRow; icons: BatchIcons }) {
  return <li className="erp-intake__row" data-tone={row.tone}>
    <div className="erp-intake__file">
      <span className="erp-intake__name">{row.name}</span>
      <span className="erp-intake__meta">{row.type}, {row.size}</span>
    </div>
    <div className="erp-intake__status">
      <p className="erp-intake__state">{icons.tones[row.tone]}<span>{row.state}</span></p>
      {row.detail && <p className="erp-intake__detail">{row.detail}</p>}
    </div>
    {row.retryHref && <a className="erp-btn erp-btn--secondary erp-intake__retry" href={row.retryHref} aria-label={`Thử lại: ${row.name}`}>{icons.retry}Thử lại</a>}
  </li>
}

function Group({ group, icons, onOpen }: { group: BatchGroup; icons: BatchIcons; onOpen: (group: BatchGroup, event: MouseEvent<HTMLAnchorElement>) => void }) {
  const titleId = `nhom-${group.editor}`
  return <section className="erp-intake__group" aria-labelledby={titleId}>
    <header className="erp-intake__group-head">
      <span className="erp-intake__group-icon">{icons.editors[group.editor]}</span>
      <h2 id={titleId}>{group.name}</h2>
      <span className="erp-intake__count">{group.rows.length} tệp</span>
    </header>
    <ul className="erp-intake__rows">{group.rows.map((row) => <Row key={row.id} row={row} icons={icons} />)}</ul>
    {group.openHref && <a className="erp-btn erp-btn--primary erp-intake__open" href={group.openHref} onClick={(event) => onOpen(group, event)}>{icons.open}{group.openLabel}</a>}
  </section>
}

/** The batch page body; stateless so every state renders the same way in tests and in the browser. */
export function BatchList({ view, icons, picker, busy = false, headingRef, onOpen, onCancel }: {
  view: BatchView
  icons: BatchIcons
  picker: ReactNode
  busy?: boolean
  headingRef?: Ref<HTMLHeadingElement>
  onOpen: (group: BatchGroup, event: MouseEvent<HTMLAnchorElement>) => void
  onCancel: () => void
}) {
  const remaining = view.groups.some((group) => group.openHref)
  return <div className="erp-intake">
    <header className="erp-intake__head">
      <h1 ref={headingRef} tabIndex={-1}>Nhận tệp</h1>
      <p>{view.total} tệp được chia sẻ vào Văn phòng. Bản tạm chỉ nằm trên thiết bị này: được xóa khi công cụ đã mở xong, hoặc hết hạn sau một giờ và được dọn ở lần mở Văn phòng kế tiếp.</p>
      {!remaining && <p className="erp-intake__hint">Không còn tệp nào chờ mở.</p>}
    </header>
    <div className="erp-intake__groups">
      {view.groups.map((group) => <Group key={group.editor} group={group} icons={icons} onOpen={onOpen} />)}
      {view.refused.length > 0 && <section className="erp-intake__group erp-intake__group--refused" aria-labelledby="nhom-tu-choi">
        <header className="erp-intake__group-head">
          <span className="erp-intake__group-icon">{icons.refused}</span>
          <h2 id="nhom-tu-choi">Không nhận</h2>
          <span className="erp-intake__count">{view.refused.length} tệp</span>
        </header>
        <ul className="erp-intake__rows">{view.refused.map((row) => <Row key={row.id} row={row} icons={icons} />)}</ul>
      </section>}
    </div>
    <div className="erp-intake__actions">
      {picker}
      <button type="button" className="erp-btn erp-btn--secondary" onClick={onCancel} disabled={busy}>{icons.cancel}Hủy lô tệp</button>
    </div>
  </div>
}

export type NoticeKind = 'loading' | 'missing' | 'expired' | 'cancelled' | 'error'

const NOTICES: Record<Exclude<NoticeKind, 'loading'>, { title: string; text: string }> = {
  missing: { title: 'Không tìm thấy lô tệp', text: 'Lô tệp đã hết hạn hoặc đã được dọn khỏi thiết bị. Hãy chia sẻ lại tệp hoặc chọn tệp trên máy.' },
  expired: { title: 'Lô tệp đã hết hạn', text: 'Tệp tạm chỉ được giữ một giờ. Hãy chia sẻ lại tệp hoặc chọn tệp trên máy.' },
  cancelled: { title: 'Đã hủy lô tệp', text: 'Các bản tạm đã được xóa khỏi thiết bị. Tệp gốc vẫn còn trong ứng dụng đã chia sẻ.' },
  error: { title: 'Không đọc được danh sách tệp', text: 'Trình duyệt không cho mở bộ nhớ tạm. Hãy đóng các tab Văn phòng khác rồi tải lại trang.' },
}

/** Every state without a list: loading, nothing found, expired, cancelled, storage error. */
export function BatchNotice({ kind, icon, picker, headingRef }: { kind: NoticeKind; icon: ReactNode; picker: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  if (kind === 'loading') {
    return <div className="erp-intake erp-intake--loading" aria-busy="true">
      <p className="erp-sr-only" role="status">Đang đọc danh sách tệp…</p>
      <div className="erp-intake__skeleton" aria-hidden="true"><span /><span /><span /></div>
    </div>
  }
  const notice = NOTICES[kind]
  return <div className="erp-intake erp-intake__notice">
    <span className="erp-intake__notice-icon">{icon}</span>
    <h1 ref={headingRef} tabIndex={-1}>{notice.title}</h1>
    <p role="status">{notice.text}</p>
    <div className="erp-intake__actions">
      {picker}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Static hosting uses full navigation without RSC rewrites. */}
      <a className="erp-btn erp-btn--secondary" href="/">Về trang chủ</a>
    </div>
  </div>
}
