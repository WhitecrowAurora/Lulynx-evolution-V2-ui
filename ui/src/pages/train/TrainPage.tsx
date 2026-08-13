// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SchemaField } from '@/schema/schemaIndex'
import {
  TRAINING_TYPES,
  applyBackendConfigOptions,
  buildRunConfig,
  getAvailableTabs,
  getSectionsForTab,
  getSectionsForType,
  isFieldVisible,
} from '@/schema/schemaIndex.js'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { autofillEmptyModelPaths } from '@/lib/inventoryAutofill'
import {
  fetchRestorableLastTraining,
  isDraftNearDefault,
  type RestorableLastTraining,
  type ResumeOffer,
} from '@/lib/lastTrainingRestore'
import {
  clearCurrentTypeDraftOnDisk,
  flushTrainDraftsToDisk,
  hydrateTrainDraftsFromDisk,
  useTrainConfigStore,
  useDraft,
} from '@/stores/configStore'
import { addRunRecord } from '@/stores/historyStore'
import { useRouteStore } from '@/stores/routeStore'
import { toast } from '@/stores/toastStore'
import { usePageEntrance } from '@/motion/useEntrance'
import { PageHead, Tabs } from '@/components/layout'
import { Button } from '@/components/primitives'
import { Input } from '@/components/form'
import { SectionCard } from './SectionCard'
import { typeIcon } from './typeIcons'
import { ConfigPreview } from './ConfigPreview'
import { HelpModal } from './HelpModal'
import { PreflightModal, SavedConfigsModal } from './modals'
import './train.css'
import { useI18n, resolveTabLabel, resolveGroupLabel } from '@/i18n/useI18n'
import { validateConfig } from '@/utils/configValidator'

/* 训练配置页:类型轨 → schema 页签表单 → 预检/参数存取/启动 */

let optionsLoaded = false
let draftsHydrateStarted = false
/** 会话内只静默 seed 一次,避免与用户编辑抢写 */
let lastSeedAttempted = false

function useBackendOptions() {
  const bump = useTrainConfigStore((s) => s.bumpSchemaRev)
  useEffect(() => {
    if (optionsLoaded) return
    optionsLoaded = true
    trainApi
      .configOptions()
      .then((resp) => {
        if (applyBackendConfigOptions(unwrap(resp))) bump()
      })
      .catch(() => {
        optionsLoaded = false // 后端未起时静默,下次进入页面重试
      })
  }, [bump])
}

/**
 * 启动顺序:LS → 磁盘 merge → 空草稿同 type last seed → inventory 空字段 autofill
 */
function useDraftHydrateAndAutofill(typeId: string) {
  const diskHydrated = useTrainConfigStore((s) => s.diskHydrated)
  useEffect(() => {
    if (draftsHydrateStarted) return
    draftsHydrateStarted = true
    void hydrateTrainDraftsFromDisk()
  }, [])
  useEffect(() => {
    if (!diskHydrated) return
    let cancelled = false
    ;(async () => {
      if (!lastSeedAttempted) {
        lastSeedAttempted = true
        try {
          const last = await fetchRestorableLastTraining()
          if (!cancelled && last.ok) {
            const st = useTrainConfigStore.getState()
            const curType = st.typeId
            const sid = String(last.schemaId || '').trim()
            // 仅同 type 静默 seed;跨 type 留给显式「上次」
            if ((!sid || sid === curType) && isDraftNearDefault(curType, st.drafts[curType] ?? {})) {
              st.replaceDraft(last.config)
            }
          }
        } catch {
          /* 静默 */
        }
      }
      if (!cancelled) void autofillEmptyModelPaths()
    })()
    return () => {
      cancelled = true
    }
  }, [diskHydrated, typeId])
}

function knownTrainingType(id: string): boolean {
  return TRAINING_TYPES.some((t) => t.id === id && !t.disabled)
}

function applyRestorable(
  last: RestorableLastTraining,
  mode: 'seed' | 'explicit',
  tt: (key: string, vars?: Record<string, string | number>) => string,
) {
  const sid = String(last.schemaId || '').trim()
  const st = useTrainConfigStore.getState()
  if (sid && knownTrainingType(sid) && sid !== st.typeId) {
    st.setType(sid)
  } else if (sid && !knownTrainingType(sid) && mode === 'explicit') {
    toast.warn(tt('train.last_type_fallback', { id: sid }), 'LAST')
  }
  useTrainConfigStore.getState().replaceDraft(last.config)
}

function TypeRail({ typeId, onSelect }: { typeId: string; onSelect: (id: string) => void }) {
  const { t: tt, language } = useI18n()
  const groups = useMemo(() => {
    const m = new Map<string, typeof TRAINING_TYPES>()
    for (const t of TRAINING_TYPES) {
      if (t.hidden) continue
      const g = t.group || tt('common.other')
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(t)
    }
    return [...m.entries()]
  }, [tt])

  let n = 0
  return (
    <aside className="lx-typerail">
      {groups.map(([group, types]) => (
        <div key={group} className="lx-typerail-group">
          <h3>{resolveGroupLabel(group, language)}</h3>
          {types.map((t) => {
            n += 1
            return (
              <button
                key={t.id}
                type="button"
                className={['lx-type-btn', t.id === typeId ? 'on' : ''].filter(Boolean).join(' ')}
                disabled={t.disabled}
                title={t.disabled ? t.disabledReason || tt('common.unavailable') : t.id}
                onClick={() => onSelect(t.id)}
              >
                <i className="lx-type-idx">{String(n).padStart(2, '0')}</i>
                <span className="lx-type-icon" aria-hidden>{typeIcon(t.id, t.group)}</span>
                <span className="lx-type-label">{t.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </aside>
  )
}

export default function TrainPage() {
  const ref = usePageEntrance()
  const { t: tt, language } = useI18n()
  useBackendOptions()

  const typeId = useTrainConfigStore((s) => s.typeId)
  useDraftHydrateAndAutofill(typeId)
  const schemaRev = useTrainConfigStore((s) => s.schemaRev)
  const setType = useTrainConfigStore((s) => s.setType)
  const setValue = useTrainConfigStore((s) => s.setValue)
  const applyValues = useTrainConfigStore((s) => s.applyValues)
  const replaceDraft = useTrainConfigStore((s) => s.replaceDraft)
  const resetDraft = useTrainConfigStore((s) => s.resetDraft)
  const draft = useDraft()
  const navigate = useRouteStore((s) => s.navigate)

  const [tab, setTab] = useState('model')
  const [search, setSearch] = useState('')
  const [helpField, setHelpField] = useState<SchemaField | null>(null)
  const [showPreflight, setShowPreflight] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [igniting, setIgniting] = useState(false)
  /** 操作栏「预设」上拉菜单(收纳低频/破坏性操作,与主按钮物理隔离) */
  const [showDraftMenu, setShowDraftMenu] = useState(false)
  const draftMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showDraftMenu) return
    const onDown = (e: MouseEvent) => {
      if (draftMenuRef.current && !draftMenuRef.current.contains(e.target as Node)) {
        setShowDraftMenu(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showDraftMenu])
  /** P0-A: incomplete last run banner (never auto-enqueue). */
  const [resumeBanner, setResumeBanner] = useState<ResumeOffer | null>(null)
  const [resumeBannerDismissed, setResumeBannerDismissed] = useState(false)

  // P2: 配置冲突检测 + 自动修正
  const validation = useMemo(() => validateConfig(draft), [draft])

  useEffect(() => {
    if (validation.autoFixes) {
      applyValues(validation.autoFixes)
    }
  }, [validation.autoFixes, applyValues])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const last = await fetchRestorableLastTraining()
        if (cancelled) return
        const offer = last.resumeOffer
        if (offer?.show_banner) {
          setResumeBanner(offer)
        } else {
          setResumeBanner(null)
        }
      } catch {
        if (!cancelled) setResumeBanner(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const explicitFieldsByType = useRef(new Map<string, Set<string>>())
  const explicitFields = explicitFieldsByType.current.get(typeId) || new Set<string>()
  if (!explicitFieldsByType.current.has(typeId)) explicitFieldsByType.current.set(typeId, explicitFields)

  const markExplicit = useCallback((keys: Iterable<string>) => {
    const fields = explicitFieldsByType.current.get(typeId) || new Set<string>()
    for (const key of keys) fields.add(key)
    explicitFieldsByType.current.set(typeId, fields)
  }, [typeId])

  const updateExplicitValue = useCallback((key: string, raw: unknown) => {
    markExplicit([key])
    setValue(key, raw)
  }, [markExplicit, setValue])

  const applySuggestedValues = useCallback((values: Record<string, unknown>) => {
    applyValues(values)
  }, [applyValues])
  const tabs = useMemo(() => getAvailableTabs(typeId, draft), [typeId, draft, schemaRev])
  const activeTab = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'model')
  const expertMode = !!draft.performance_expert_mode

  // 切到标准后 advanced/frontier 被藏：把 state tab 同步回合法页签，避免残留
  useEffect(() => {
    if (tab !== activeTab) setTab(activeTab)
  }, [tab, activeTab])

  const setExpertMode = useCallback(
    (on: boolean) => {
      setValue('performance_expert_mode', on)
    },
    [setValue],
  )

  const sections = useMemo(() => {
    if (search.trim()) {
      // 搜索时跨页签全局匹配,但不越过 expertOnly 页签的可见性
      const allowed = new Set(tabs.map((t) => t.key))
      return getSectionsForType(typeId).filter((s) => allowed.has(s.tab))
    }
    return getSectionsForTab(activeTab, typeId)
  }, [search, activeTab, typeId, tabs, schemaRev])

  const visibleFieldCount = useMemo(
    () =>
      sections.reduce(
        (acc, s) => acc + s.fields.filter((f) => f.type !== 'hidden' && isFieldVisible(f, draft)).length,
        0,
      ),
    [sections, draft],
  )

  const typeMeta = TRAINING_TYPES.find((t) => t.id === typeId)
  const typeLabel = typeMeta?.label ?? typeId
  const typeGroup = typeMeta?.group ? resolveGroupLabel(typeMeta.group, language) : ''

  const buildPayload = () => {
    const state = useTrainConfigStore.getState()
    return buildRunConfig(state.drafts[state.typeId] ?? {}, state.typeId)
  }

  const doIgnite = async () => {
    setIgniting(true)
    try {
      // 提交前把草稿落盘(替代原独立「落盘」按钮;失败不阻断提交,草稿另有 debounce 自动写盘兜底)
      try {
        await flushTrainDraftsToDisk()
      } catch {
        /* ignore */
      }
      // 输出目录同名产物冲突提示(检查失败不阻断提交)
      const dir = String(draft.output_dir ?? '')
      const name = String(draft.output_name ?? '')
      if (dir && name) {
        try {
          const c = unwrap<Record<string, unknown>>(await trainApi.checkOutputConflict(dir, name))
          const conflict = c?.conflict === true || c?.exists === true
          if (conflict) {
            const msg = typeof c?.message === 'string' && c.message ? c.message : tt('train.outdir_exists', { name })
            if (!window.confirm(msg)) return
          }
        } catch {
          /* ignore */
        }
      }
      const payload = buildPayload()
      const resp = unwrap(await trainApi.run(payload))
      addRunRecord(typeId, draftSnapshot(), resp)
      toast.ok(tt('train.submitted', { type: typeLabel }), 'IGNITED')
      navigate('monitor')
    } catch (e) {
      toast.err((e as Error).message, tt('train.submit_fail'))
    } finally {
      setIgniting(false)
    }
  }

  const doReset = () => {
    if (window.confirm(tt('train.reset_confirm', { type: typeLabel }))) {
      resetDraft()
      explicitFields.clear()
      toast.info(tt('train.reset_ok'), 'RESET')
    }
  }

  const doClearTypeDraft = async () => {
    if (!window.confirm(tt('train.clear_draft_confirm', { type: typeLabel }))) return
    try {
      await clearCurrentTypeDraftOnDisk()
      explicitFields.clear()
      toast.ok(tt('train.clear_draft_ok'), 'CLEAR')
    } catch (e) {
      toast.err((e as Error).message, 'CLEAR')
    }
  }

  const doRestoreLast = async () => {
    try {
      const last = await fetchRestorableLastTraining()
      if (!last.ok) {
        const hint =
          last.reason === 'raw_config_unavailable'
            ? tt('train.last_no_raw')
            : tt('train.last_none')
        toast.warn(hint, 'LAST')
        return
      }
      const near = isDraftNearDefault(typeId, draft)
      if (!near) {
        const target = last.schemaId && knownTrainingType(last.schemaId) ? last.schemaId : typeId
        const label = TRAINING_TYPES.find((t) => t.id === target)?.label ?? target
        if (!window.confirm(tt('train.last_overwrite', { type: label }))) return
      }
      applyRestorable(last, 'explicit', tt)
      markExplicit(Object.keys(last.config || {}))
      const src = last.source === 'last-training' ? tt('train.last_source') : 'saved_params'
      toast.ok(`${tt('train.restored', { source: src })}${last.runId ? ` · ${last.runId}` : ''}`, 'LAST')
    } catch (e) {
      toast.err((e as Error).message, 'LAST')
    }
  }

  return (
    <div ref={ref}>
      <nav className="lx-breadcrumb" aria-label="breadcrumb">
        <span className="lx-crumb">LULYNX TRAINER</span>
        {typeGroup ? (
          <>
            <span className="lx-crumb-sep">›</span>
            <span className="lx-crumb">{typeGroup}</span>
          </>
        ) : null}
        <span className="lx-crumb-sep">›</span>
        <span className="lx-crumb on">{typeLabel}</span>
      </nav>

      <PageHead
        idx="01 — TRAIN"
        tag="DIFFUSION TRAINER CONSOLE"
        lines={[{ text: 'CONFIGURE' }, { text: 'TRAINING_', outline: true }]}
        sub={tt('train.current_type_sub', { type: typeLabel, count: visibleFieldCount })}
      />

      <div className="lx-train-layout">
        <TypeRail typeId={typeId} onSelect={setType} />

        <div>
          {resumeBanner && !resumeBannerDismissed ? (
            <div className="lx-resume-banner" role="status">
              <p>
                {tt('train.resume_banner', {
                  run: resumeBanner.run_id ? ` · ${resumeBanner.run_id}` : '',
                  status: resumeBanner.run_status || resumeBanner.hint || 'incomplete',
                })}
              </p>
              <div className="lx-resume-banner-actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    void doRestoreLast().then(() => setResumeBannerDismissed(true))
                  }}
                >
                  {tt('train.resume_banner_action')}
                </Button>
                <Button onClick={() => setResumeBannerDismissed(true)}>
                  {tt('train.resume_banner_dismiss')}
                </Button>
              </div>
            </div>
          ) : null}

          {/* P2: 配置冲突/警告横幅 */}
          {validation.errors.length > 0 && (
            <div className="lx-validation-banner lx-validation-error" role="alert">
              <div className="lx-validation-icon">⚠️</div>
              <div className="lx-validation-content">
                <strong>{tt('train.config_errors')}</strong>
                <ul>
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="lx-validation-banner lx-validation-warning" role="status">
              <div className="lx-validation-icon">💡</div>
              <div className="lx-validation-content">
                <strong>{tt('train.config_warnings')}</strong>
                <ul>
                  {validation.warnings.map((warn, i) => (
                    <li key={i}>{warn.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="lx-cfg-toolbar">
            <Tabs
              tabs={tabs.map((tab, i) => ({ id: tab.key, label: resolveTabLabel(tab, language), idx: String(i + 1).padStart(2, '0') }))}
              active={activeTab}
              onChange={setTab}
            />
            <div className="lx-mode-toggle" role="group" aria-label={tt('train.mode_label')}>
              <button
                type="button"
                className={['lx-mode-btn', !expertMode ? 'on' : ''].filter(Boolean).join(' ')}
                onClick={() => setExpertMode(false)}
              >
                {tt('train.mode_standard')}
              </button>
              <button
                type="button"
                className={['lx-mode-btn', expertMode ? 'on' : ''].filter(Boolean).join(' ')}
                onClick={() => setExpertMode(true)}
              >
                {tt('train.mode_advanced')}
              </button>
            </div>
            <Input
              className="lx-cfg-search"
              placeholder={tt('train.search_fields')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {sections.map((s, i) => (
            <SectionCard
              key={s.id}
              section={s}
              idx={i}
              config={draft}
              search={search.trim()}
              onChange={updateExplicitValue}
              onHelp={setHelpField}
              explicitFields={[...explicitFields]}
              onApplySuggestions={applySuggestedValues}
            />
          ))}
          {search.trim() && !sections.some((s) => s.fields.some((f) => isFieldVisible(f, draft))) ? (
            <p className="lx-wiki-fallback" style={{ padding: '28px 0', textAlign: 'center' }}>
              {tt('train.no_match', { search })}
            </p>
          ) : null}

          <div className="lx-cmdline" aria-hidden>
            <span className="lx-cmdline-prompt">$</span>
            <span className="lx-cmdline-body">lulynx train --config config.json</span>
          </div>

          <div className="lx-actionbar">
            <div className="lx-actionbar-meta">
              <b>{typeLabel}</b>
              <span className="lx-num">{typeId}</span>
            </div>
            <div className="lx-actionbar-menuwrap" ref={draftMenuRef}>
              <Button
                aria-haspopup="menu"
                aria-expanded={showDraftMenu}
                onClick={() => setShowDraftMenu((v) => !v)}
              >
                {tt('train.presets')} ▴
              </Button>
              {showDraftMenu && (
                <div className="lx-actionbar-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setShowDraftMenu(false); setShowSaved(true) }}>
                    {tt('train.presets_open')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    title={tt('train.restore_last_title')}
                    onClick={() => { setShowDraftMenu(false); void doRestoreLast() }}
                  >
                    {tt('train.last')}
                  </button>
                  <hr />
                  <button type="button" role="menuitem" onClick={() => { setShowDraftMenu(false); doReset() }}>
                    {tt('train.reset')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    title={tt('train.clear_draft_title')}
                    onClick={() => { setShowDraftMenu(false); void doClearTypeDraft() }}
                  >
                    {tt('train.clear_type')}
                  </button>
                </div>
              )}
            </div>
            <Button onClick={() => setShowPreflight(true)}>{tt('train.preflight')}</Button>
            <Button
              className="lx-ignite"
              variant="primary"
              disabled={igniting || validation.errors.length > 0}
              onClick={() => void doIgnite()}
            >
              {igniting ? tt('train.submitting') : tt('train.ignite')}
            </Button>
          </div>
        </div>

        <ConfigPreview draft={draft} typeId={typeId} />
      </div>

      <HelpModal field={helpField} onClose={() => setHelpField(null)} />
      <PreflightModal open={showPreflight} onClose={() => setShowPreflight(false)} buildPayload={buildPayload} />
      <SavedConfigsModal
        open={showSaved}
        onClose={() => setShowSaved(false)}
        currentDraft={draftSnapshot}
        onLoad={(config) => { replaceDraft(config); markExplicit(Object.keys(config)) }}
      />
    </div>
  )
}

/** 保存参数时取草稿的即时快照(读 store 最新态,避免闭包过期) */
function draftSnapshot(): Record<string, unknown> {
  const s = useTrainConfigStore.getState()
  return { ...(s.drafts[s.typeId] ?? {}) }
}
