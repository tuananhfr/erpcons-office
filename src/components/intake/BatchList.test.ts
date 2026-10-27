import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { batchView } from '../../lib/files/batch-view.ts'
import type { IntakeRecord } from '../../lib/files/intake-contract.ts'
import { BatchList, BatchNotice, type BatchIcons } from './BatchList.tsx'

const NOW = Date.UTC(2026, 9, 26, 9)
const icon = createElement('i')
const icons: BatchIcons = {
  editors: { 'van-ban': icon, 'bang-tinh': icon, 'trinh-chieu': icon, pdf: icon },
  tones: { ready: icon, progress: icon, done: icon, warn: icon, error: icon, muted: icon },
  refused: icon, open: icon, retry: icon, cancel: icon,
}
const row = (fields: Partial<IntakeRecord> & { id: string; name: string }): IntakeRecord => ({ batchId: 'b', expiresAt: NOW + 1000, state: 'READY', file: new Blob(['x']), size: 10, ...fields })
const render = (records: IntakeRecord[]) => renderToStaticMarkup(createElement(BatchList, {
  view: batchView(records, NOW), icons, picker: createElement('button', { type: 'button' }, 'Chọn lại tệp'), onOpen: () => {}, onCancel: () => {},
}))

describe('BatchList', () => {
  const mixed = [
    row({ id: 'a', name: 'A.docx', editor: 'van-ban' }),
    row({ id: 'b', name: 'B.docx', editor: 'van-ban' }),
    row({ id: 'c', name: 'C.xlsx', editor: 'bang-tinh', state: 'FAILED_RETRYABLE', reason: 'notReady', errorCode: 'OFFLINE_DEPENDENCY' }),
    row({ id: 'd', name: 'anh.jpg', state: 'FAILED_FINAL', reason: 'unsupported', errorCode: 'UNSUPPORTED_TYPE', file: undefined }),
  ]

  it('renders one labelled section per editor with its open link, and the refused files apart', () => {
    const html = render(mixed)
    expect(html).toContain('<h1 tabindex="-1">Nhận tệp</h1>')
    expect(html).toContain('4 tệp được chia sẻ vào Văn phòng')
    expect(html.match(/<section class="erp-intake__group[^"]*" aria-labelledby="[^"]+">/g)).toHaveLength(3)
    expect(html).toContain('<h2 id="nhom-van-ban">Văn bản</h2>')
    expect(html).toContain('href="/van-ban/?open=a,b"')
    expect(html).toContain('Mở 2 tệp trong Văn bản')
    expect(html).not.toContain('href="/bang-tinh/?open=c"><i></i>Mở')
    expect(html).toContain('<h2 id="nhom-tu-choi">Không nhận</h2>')
    expect(html).toContain('(Mã: UNSUPPORTED_TYPE)')
  })

  it('lists every file refused at intake under "Không nhận", even one whose type a tool opens', () => {
    const html = render([
      ...mixed,
      row({ id: 'e', name: 'Thừa.pdf', editor: 'pdf', state: 'FAILED_FINAL', reason: 'tooMany', errorCode: 'QUOTA_EXCEEDED', file: undefined }),
    ])
    const refused = html.slice(html.indexOf('<h2 id="nhom-tu-choi">'))
    expect(refused).toContain('Thừa.pdf')
    expect(refused).toContain('(Mã: QUOTA_EXCEEDED)')
    expect(html).not.toContain('id="nhom-pdf"')
  })

  it('offers "Thử lại" with an accessible name only on a retryable row', () => {
    const html = render(mixed)
    expect(html.match(/Thử lại<\/a>/g)).toHaveLength(1)
    expect(html).toContain('href="/bang-tinh/?open=c" aria-label="Thử lại: C.xlsx"')
  })

  it('always offers "Chọn lại tệp" and "Hủy lô tệp" as real buttons', () => {
    const html = render(mixed)
    expect(html).toContain('<button type="button">Chọn lại tệp</button>')
    expect(html).toMatch(/<button type="button" class="erp-btn erp-btn--secondary"><i><\/i>Hủy lô tệp<\/button>/)
  })

  it('says when everything was opened', () => {
    const html = render([row({ id: 'a', name: 'A.docx', editor: 'van-ban', state: 'OPENED', file: undefined })])
    expect(html).toContain('Không còn tệp nào chờ mở.')
    expect(html).toContain('Đã mở')
    expect(html).not.toContain('?open=')
  })
})

describe('BatchNotice', () => {
  const notice = (kind: 'loading' | 'missing' | 'expired' | 'cancelled' | 'error') =>
    renderToStaticMarkup(createElement(BatchNotice, { kind, icon, picker: createElement('button', { type: 'button' }, 'Chọn lại tệp') }))

  it('explains an expired batch and offers a way forward', () => {
    const html = notice('expired')
    expect(html).toContain('<h1 tabindex="-1">Lô tệp đã hết hạn</h1>')
    expect(html).toContain('Chọn lại tệp')
    expect(html).toContain('href="/"')
  })

  it.each(['missing', 'cancelled', 'error'] as const)('has a heading and a status message for %s', (kind) => {
    expect(notice(kind)).toMatch(/<h1 tabindex="-1">[^<]+<\/h1><p role="status">[^<]+<\/p>/)
  })

  it('announces loading without showing a spinner', () => {
    const html = notice('loading')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('role="status">Đang đọc danh sách tệp…')
  })
})
