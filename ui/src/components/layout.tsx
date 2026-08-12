// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import type { ReactNode } from 'react'

/* 布局件:面板 / 页签 / 页面标题 */

export function Panel({
  title,
  idx,
  panelId,
  en,
  count,
  right,
  hoverable,
  className,
  children,
}: {
  title?: ReactNode
  idx?: string
  panelId?: string
  /** 英文副标,仿设计稿 (WEIGHT COMPOSITION) */
  en?: string
  /** 可见字段计数徽标,仿设计稿「N 项设置」 */
  count?: ReactNode
  right?: ReactNode
  hoverable?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={['lx-panel', hoverable ? 'hoverable' : '', className].filter(Boolean).join(' ')}>
      {title != null && (
        <header className="lx-panel-head">
          <h2 className="lx-panel-title">
            {idx ? <i className="lx-idx">{idx} /</i> : null}
            {title}
            {en ? <span className="lx-panel-en">({en})</span> : null}
          </h2>
          {right ?? (count != null ? <span className="lx-panel-count">{count}</span> : panelId ? <span className="lx-panel-id">{panelId}</span> : null)}
        </header>
      )}
      {children}
    </section>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; idx?: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="lx-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className={['lx-tab', t.id === active ? 'on' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(t.id)}
        >
          {t.idx ? <span className="lx-idx">{t.idx}</span> : null}
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function PageHead({
  idx,
  tag,
  lines,
  sub,
  marquee,
}: {
  idx: string
  tag?: string
  lines: { text: string; outline?: boolean }[]
  sub?: ReactNode
  marquee?: string
}) {
  return (
    <div className="lx-page-head">
      <div className="lx-page-eyebrow">
        <span className="lx-idx lx-num">( {idx} )</span>
        {tag ? <span data-scramble>{tag}</span> : null}
      </div>
      <h1 className="lx-page-title">
        {lines.map((l, i) => (
          <span key={i} className={['line', l.outline ? 'outline' : ''].filter(Boolean).join(' ')}>
            {l.text}
          </span>
        ))}
      </h1>
      {sub ? <p className="lx-page-sub">{sub}</p> : null}
      {marquee ? (
        <div className="lx-marquee" aria-hidden style={{ marginTop: 18 }}>
          <div className="lx-marquee-inner lx-loop">
            {`${marquee} — `.repeat(4)}
            {`${marquee} — `.repeat(4)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
