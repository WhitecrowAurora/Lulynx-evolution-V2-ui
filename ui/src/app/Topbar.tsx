// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useState } from 'react'
import { ROUTES, useRouteStore } from '@/stores/routeStore'
import { THEME_META, useThemeStore } from '@/stores/themeStore'
import type { MotionMode, ThemeId } from '@/stores/themeStore'
import { Dot } from '@/components/primitives'
import { useI18n } from '@/i18n/useI18n'
import { useLocaleStore } from '@/stores/localeStore'

type Health = 'unknown' | 'ok' | 'down'

export function Topbar() {
  const { t, language } = useI18n()
  const setLanguage = useLocaleStore((s) => s.setLanguage)
  const route = useRouteStore((s) => s.route)
  const navigate = useRouteStore((s) => s.navigate)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const motionMode = useThemeStore((s) => s.motionMode)
  const setMotionMode = useThemeStore((s) => s.setMotionMode)
  const trainingActive = useThemeStore((s) => s.trainingActive)
  const motionLabel = { auto: t('topbar.motion.auto'), full: t('topbar.motion.full'), eco: t('topbar.motion.eco') } as Record<MotionMode, string>

  const [health, setHealth] = useState<Health>('unknown')
  const [mode, setMode] = useState('')

  useEffect(() => {
    let alive = true
    const ping = async () => {
      try {
        const r = await fetch('/health', { cache: 'no-store' })
        const j = (await r.json()) as { status?: string; mode?: string }
        if (!alive) return
        setHealth(j.status === 'ok' ? 'ok' : 'down')
        setMode(j.mode ?? '')
      } catch {
        if (alive) setHealth('down')
      }
    }
    void ping()
    const t = window.setInterval(ping, 12000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])

  const ecoNow = motionMode === 'eco' || (motionMode === 'auto' && trainingActive)
  const cycleMotion = () => {
    const order: MotionMode[] = ['auto', 'full', 'eco']
    setMotionMode(order[(order.indexOf(motionMode) + 1) % order.length])
  }

  return (
    <header className="lx-topbar">
      <div className="lx-brand">
        <span className="lx-brand-mark" />
        <span className="lx-brand-name">LULYNX</span>
        <span className="lx-brand-sub">TRAINER</span>
      </div>
      <nav className="lx-nav">
        {ROUTES.map((r) => (
          <a key={r.id} className={route === r.id ? 'on' : ''} onClick={() => navigate(r.id)}>
            <i>{r.idx}</i>
            <span>{language === 'en' ? r.en : r.zh}</span>
          </a>
        ))}
      </nav>
      <div className="lx-topbar-right">
        <div className="lx-status-pills" aria-hidden>
          <span className="lx-pill">LULYNX 优化</span>
          <span className="lx-pill">TURBOCORE</span>
          <span className={['lx-pill', 'accent', health === 'ok' ? 'on' : ''].filter(Boolean).join(' ')}>
            PYTORCH {health === 'ok' ? 'READY' : health === 'down' ? 'OFFLINE' : '…'}
          </span>
        </div>
        <span className="lx-conn" title={mode ? `backend mode: ${mode}` : t('topbar.backend_down')}>
          <Dot tone={health === 'ok' ? 'ok' : health === 'down' ? 'danger' : 'warn'} pulse={health === 'ok'} />
          {health === 'ok' ? `LINK·${mode || 'OK'}` : health === 'down' ? 'OFFLINE' : '…'}
        </span>
        <div className="lx-lang-seg" role="group" aria-label="language">
          <button className={language === 'zh' ? 'on' : ''} onClick={() => setLanguage('zh')}>中</button>
          <button className={language === 'en' ? 'on' : ''} onClick={() => setLanguage('en')}>EN</button>
        </div>
        <div className="lx-theme-seg" role="group" aria-label={t('topbar.theme')}>
          {(Object.keys(THEME_META) as ThemeId[]).map((id) => (
            <button key={id} className={theme === id ? 'on' : ''} onClick={() => setTheme(id)} title={THEME_META[id].zh}>
              {THEME_META[id].label}
            </button>
          ))}
        </div>
        <button
          className={['lx-motion-btn', ecoNow ? 'eco' : ''].filter(Boolean).join(' ')}
          onClick={cycleMotion}
          title={t('topbar.motion_hint')}
        >
          {motionLabel[motionMode]}
        </button>
      </div>
    </header>
  )
}
