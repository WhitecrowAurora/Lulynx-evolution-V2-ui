// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { AVAILABLE_ROUTES, useRouteStore } from '@/stores/routeStore'

export function PrimaryNavigation() {
  const { t, language } = useI18n()
  const route = useRouteStore((s) => s.route)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [route])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  return (
    <div
      className="lx-navigation"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        setOpen(false)
        toggle.current?.focus()
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="lx-nav-toggle"
        aria-label={t(open ? 'nav.close' : 'nav.open')}
        title={t(open ? 'nav.close' : 'nav.open')}
        aria-expanded={open}
        aria-controls="lx-primary-nav"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      <nav id="lx-primary-nav" className={`lx-nav${open ? ' is-open' : ''}`} aria-label={t('nav.primary')}>
        {AVAILABLE_ROUTES.map((item) => (
          <a
            key={item.id}
            href={`#/${item.id}`}
            className={route === item.id ? 'on' : ''}
            aria-current={route === item.id ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <i>{item.idx}</i>
            <span>{language === 'en' ? item.en : item.zh}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
