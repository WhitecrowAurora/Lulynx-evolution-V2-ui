// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useState } from 'react'
import { PrimaryNavigation } from './PrimaryNavigation'
import { THEME_META, useThemeStore } from '@/stores/themeStore'
import type { MotionMode, ThemeId } from '@/stores/themeStore'
import { Dot } from '@/components/primitives'
import { useI18n } from '@/i18n/useI18n'
import { useLocaleStore } from '@/stores/localeStore'
import { usePerfModeStore } from '@/stores/perfModeStore'
import { useTrainConfigStore } from '@/stores/configStore'
import { TURBOCORE_NATIVE_OPTIMIZERS, turbocoreUnsupportedOptimizer } from '@/lib/turbocoreOptimizerSupport'

type Health = 'unknown' | 'ok' | 'down'

export function Topbar() {
  const { t, language } = useI18n()
  const setLanguage = useLocaleStore((s) => s.setLanguage)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const motionMode = useThemeStore((s) => s.motionMode)
  const setMotionMode = useThemeStore((s) => s.setMotionMode)
  const trainingActive = useThemeStore((s) => s.trainingActive)
  const motionLabel = { auto: t('topbar.motion.auto'), full: t('topbar.motion.full'), eco: t('topbar.motion.eco') } as Record<MotionMode, string>

  const [health, setHealth] = useState<Health>('unknown')
  const [mode, setMode] = useState('')

  const defaultLulynxOpt = usePerfModeStore((s) => s.lulynxOptimization)
  const defaultTurbocore = usePerfModeStore((s) => s.turbocore)
  const lulynxOpt = useTrainConfigStore((s) => s.drafts[s.typeId]?.lulynx_optimization_enabled) ?? defaultLulynxOpt
  const turbocore = useTrainConfigStore((s) => s.drafts[s.typeId]?.turbocore_enabled) ?? defaultTurbocore
  const setValue = useTrainConfigStore((s) => s.setValue)
  const setLulynxOptimization = usePerfModeStore((s) => s.setLulynxOptimization)
  const setTurbocore = usePerfModeStore((s) => s.setTurbocore)
  // 只订阅当前训练类型草稿的优化器两个字段,改其他表单项不触发顶栏重渲染
  const optimizerType = useTrainConfigStore((s) => s.drafts[s.typeId]?.optimizer_type)
  const optimizerArgsCustom = useTrainConfigStore((s) => s.drafts[s.typeId]?.optimizer_args_custom)
  const unsupportedOptimizer = turbocore ? turbocoreUnsupportedOptimizer(optimizerType, optimizerArgsCustom) : ''
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
      <PrimaryNavigation />
      <div className="lx-topbar-right">
        <div className="lx-status-pills">
          <button
            type="button"
            className={['lx-pill', 'lx-pill-toggle', lulynxOpt ? 'on' : ''].filter(Boolean).join(' ')}
            aria-pressed={Boolean(lulynxOpt)}
            onClick={() => { setLulynxOptimization(!lulynxOpt); setValue('lulynx_optimization_enabled', !lulynxOpt) }}
            title={lulynxOpt ? 'Lulynx 优化：已开启，点击关闭。' : 'Lulynx 优化：已关闭，点击开启。'}
          >
            LULYNX 优化
          </button>
          <button
            type="button"
            className={['lx-pill', 'lx-pill-toggle', turbocore ? 'on' : '', unsupportedOptimizer ? 'unsupported' : ''].filter(Boolean).join(' ')}
            aria-pressed={Boolean(turbocore)}
            onClick={() => { setTurbocore(!turbocore); setValue('turbocore_enabled', !turbocore) }}
            title={
              !turbocore
                ? 'TurboCore：已关闭，点击开启。'
                : unsupportedOptimizer
                  ? `TurboCore：当前优化器 ${unsupportedOptimizer} 不受支持，训练时将退回 PyTorch 优化器（标准核心）。支持：${TURBOCORE_NATIVE_OPTIMIZERS.join(' / ')}。点击关闭。`
                  : 'TurboCore：已开启，点击关闭。'
            }
          >
            TURBOCORE
          </button>
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
