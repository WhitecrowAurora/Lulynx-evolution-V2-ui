// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/* 基础原子:按钮/徽标/状态点/进度条/KPI/空态/跑马灯 */

export function Button({
  variant = 'ghost',
  size,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; size?: 'sm' }) {
  const cls = ['lx-btn', variant, size, className].filter(Boolean).join(' ')
  return <button type="button" className={cls} {...rest} />
}

export function Badge({
  tone,
  children,
  className,
}: {
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
  children: ReactNode
  className?: string
}) {
  return <span className={['lx-badge', tone, className].filter(Boolean).join(' ')}>{children}</span>
}

export function Dot({ tone = 'idle', pulse }: { tone?: 'ok' | 'accent' | 'warn' | 'danger' | 'idle'; pulse?: boolean }) {
  return <span className={['lx-dot', tone === 'idle' ? '' : tone, pulse ? 'pulse lx-loop' : ''].filter(Boolean).join(' ')} />
}

export function Bar({
  value,
  lg,
  thin,
  shimmer,
  className,
}: {
  value: number
  lg?: boolean
  thin?: boolean
  shimmer?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={['lx-bar', lg ? 'lg' : '', thin ? 'thin' : '', shimmer ? 'shimmer' : '', className].filter(Boolean).join(' ')}>
      <span className={shimmer ? 'lx-loop' : undefined} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Kpi({ label, value, accent, title }: { label: string; value: ReactNode; accent?: boolean; title?: string }) {
  return (
    <div className={['lx-kpi', accent ? 'accent' : ''].filter(Boolean).join(' ')} title={title}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

export function Empty({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="lx-empty">
      <h3>{title}</h3>
      {desc ? <p>{desc}</p> : null}
      {children ? <div style={{ marginTop: 16 }}>{children}</div> : null}
    </div>
  )
}

export function Marquee({ text }: { text: string }) {
  const seg = `${text} — `.repeat(4)
  return (
    <div className="lx-marquee" aria-hidden>
      <div className="lx-marquee-inner lx-loop">
        {seg}
        {seg}
      </div>
    </div>
  )
}
