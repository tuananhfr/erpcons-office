'use client'

import { useState, type ReactNode } from 'react'
import { CATEGORIES, ECOSYSTEM_TOOLS, filterTools, type Category } from '@/content/ecosystem.ts'

export function ToolCatalog({ icons }: { icons: Record<string, ReactNode> }) {
  const [category, setCategory] = useState<Category>('Tất cả')
  const [query, setQuery] = useState('')
  const tools = filterTools(ECOSYSTEM_TOOLS, category, query)
  return <section className="erp-catalog erp-container" aria-label="Danh sách công cụ">
    <div className="erp-catalog__controls"><div className="erp-catalog__filters" role="group" aria-label="Lọc theo nhu cầu">
      {CATEGORIES.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
    </div><label className="erp-search"><span className="erp-sr-only">Tìm công cụ</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm công cụ…" /></label></div>
    <p className="erp-sr-only" aria-live="polite">{tools.length} công cụ</p>
    {tools.length ? <ul className="erp-catalog__grid">{tools.map(tool => {
      const content = <><span className={`erp-catalog__icon erp-color--${tool.color}`}>{icons[tool.id]}</span><span className="erp-catalog__body"><strong>{tool.name}</strong><span>{tool.description}</span><small>{tool.href ? (tool.categories.includes('Miễn phí') ? 'Miễn phí' : 'Tìm hiểu thêm') : 'Đang cập nhật'}</small></span>{tool.href ? <span className="erp-catalog__arrow" aria-hidden="true">→</span> : null}</>
      return <li key={tool.id}>{tool.href ? <a href={tool.href}>{content}</a> : <div className="erp-catalog__upcoming">{content}</div>}</li>
    })}</ul> : <div className="erp-catalog__empty"><h2>Chưa tìm thấy công cụ</h2><p>Thử từ khóa khác hoặc chọn lại nhóm công cụ.</p><button className="erp-btn erp-btn--secondary" onClick={() => { setQuery(''); setCategory('Tất cả') }}>Xem tất cả công cụ</button></div>}
    <p className="erp-catalog__note">Liên kết đến các công cụ còn lại đang được cập nhật.</p>
  </section>
}
