// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, useState } from 'react'
import type { SchemaField, SchemaFieldOption } from '@/schema/schemaIndex'
import { FieldShell, Input, Select, Slider, Switch, Textarea } from '@/components/form'
import { Button } from '@/components/primitives'
import { ConceptDirectionPairs } from './ConceptDirectionPairs'
import { GradientClippingControl } from './GradientClippingControl'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { candidatesForField, countCandidatesForField } from '@/lib/inventoryAutofill'
import type { PathCandidate } from '@/lib/modelPathMatch'
import { isPathEmptyForAutofill } from '@/lib/modelPathMatch'
import { checkPathStatus, type PathCheckStatus } from '@/lib/pathExistsCheck'
import {
  checkOutputConflictStatus,
  shouldCheckOutputConflict,
} from '@/lib/outputConflictCheck'
import {
  collectRecentDatasetPaths,
  isDatasetFolderField,
} from '@/lib/recentDatasetPaths'
import { useTrainConfigStore, useDraft } from '@/stores/configStore'
import { COMPANION_HANDLERS, useCompanionToolStore } from '@/stores/companionToolStore'
import {
  attentionBackendBlockReason,
  makeAttentionOptions,
} from '@/schema/features/attentionCapabilities.js'
import { deviceOptions } from '@/schema/features/deviceOptions.js'
import {
  optionConstraints,
  runtimeAdvisoryNote,
  runtimeForcedReason,
} from '@/schema/features/runtimeFieldConstraints.js'
import { useRuntimeStore, type RuntimeCapabilitySnapshot } from '@/stores/runtimeStore'
import { toast } from '@/stores/toastStore'
import {
  useI18n,
  translate,
} from '@/i18n/useI18n'
import { resolveFieldLabel, resolveFieldDesc, resolveOptionLabel } from '@/i18n/schemaI18n'

/* schema 字段 → 控件。11 种字段类型的统一渲染入口。 */

function optionsOf(
  field: SchemaField,
  language: string,
  config: Record<string, unknown>,
  runtime?: RuntimeCapabilitySnapshot,
): { value: string; label: string; disabled?: boolean; title?: string }[] {
  const source = field.deviceListOptions
    ? deviceOptions(runtime?.cards ?? [])
    : typeof field.options === 'function' ? field.options(config) : field.options
  const rows = source && typeof source !== 'string' && Symbol.iterator in Object(source)
    ? Array.from(source)
    : []
  const resolved = rows.map((o) => {
    if (o && typeof o === 'object') {
      const opt = o as SchemaFieldOption
      const value = String(opt.value)
      return {
        value,
        label: resolveOptionLabel(field.key, opt, language),
        disabled: opt.disabled === true || undefined,
        title: opt.disabledReason ? String(opt.disabledReason) : undefined,
      }
    }
    const value = String(o)
    return {
      value,
      label: resolveOptionLabel(field.key, { value, label: value }, language),
    }
  })
  // 可用性叠在标签本地化「之后」:makeAttentionOptions 会往 label 上追加「当前运行时
  // 不可用」这类后缀,若放在 resolveOptionLabel 之前,英文档会从 i18n 表取回一份没有
  // 后缀的标签,把后缀吃掉。
  // 逐选项的运行时约束(如 rocm-amd 上那几个 8bit / paged 优化器):合并进同一对
  // disabled / title,已有的静态理由优先 —— 那是字段自己的规则,比运行时的更具体。
  const blocked = optionConstraints(field, runtime?.profiles ?? null, {
    ...config,
    runtime_id: runtime?.runtimeId || '',
    language,
  }) as Record<string, string>
  const withRuntimeBlocks = (
    rows: { value: string; label: string; disabled?: boolean; title?: string }[],
  ) => rows.map((opt) => (blocked[opt.value]
    ? { ...opt, disabled: true, title: opt.title || blocked[opt.value] }
    : opt))
  if (!field.attentionBackendOptions) return withRuntimeBlocks(resolved)
  const capable = makeAttentionOptions(resolved, runtime?.profiles ?? null, {
    ...config,
    runtime_id: runtime?.runtimeId || '',
    language,
  }) as unknown as {
    value?: unknown
    label?: unknown
    disabled?: boolean
    disabledReason?: unknown
  }[]
  return withRuntimeBlocks(capable.map((opt) => ({
    value: String(opt.value ?? ''),
    label: String(opt.label ?? ''),
    disabled: opt.disabled === true || undefined,
    title: opt.disabledReason ? String(opt.disabledReason) : undefined,
  })))
}

async function browsePath(field: SchemaField, onChange: (v: unknown) => void) {
  const pickerType = field.pickerType || (field.type === 'folder' ? 'folder' : 'file')
  try {
    const payload = unwrap<Record<string, unknown>>(await trainApi.pickFile(pickerType, field.key))
    const path =
      (typeof payload === 'string' && payload) ||
      (payload && typeof payload === 'object' && (payload.path ?? payload.file ?? payload.folder))
    if (typeof path === 'string' && path) onChange(path)
    else toast.info(translate('field.path_unselected'))
  } catch (e) {
    toast.warn((e as Error).message, 'PICKER')
  }
}

async function browsePathAs(field: SchemaField, pickerType: string, onChange: (v: unknown) => void) {
  await browsePath({ ...field, pickerType }, onChange)
}

function formatSize(n: number): string {
  if (!n || n < 0) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}M`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)}G`
}

function PathFieldRow({
  field,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  field: SchemaField
  value: string
  onChange: (raw: unknown) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const { t } = useI18n()
  const typeId = useTrainConfigStore((s) => s.typeId)
  const showScan =
    field.type === 'file' &&
    (field.pickerType === 'model-file' ||
      field.pickerType === 'output-model-file' ||
      field.key === 'pretrained_model_name_or_path' ||
      field.key === 'vae' ||
      field.key === 'qwen3' ||
      field.key === 'network_weights' ||
      field.key === 'llm_adapter_path')
  const showRecent = field.type === 'folder' && isDatasetFolderField(field.key)
  const allowModelDirectory = field.allowModelDirectory === true

  const [open, setOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PathCandidate[]>([])
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [pathStatus, setPathStatus] = useState<PathCheckStatus>('idle')
  const [pathHint, setPathHint] = useState('')
  const [multiHint, setMultiHint] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const checkGen = useRef(0)

  useEffect(() => {
    if (!open && !recentOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setRecentOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, recentOpen])

  /* 非空非占位路径: debounce 校验存在性(不阻断编辑) */
  useEffect(() => {
    const gen = ++checkGen.current
    const text = String(value ?? '').trim()
    if (!text) {
      setPathStatus('idle')
      setPathHint('')
      return
    }
    setPathStatus('checking')
    setPathHint('')
    const t = window.setTimeout(() => {
      void checkPathStatus(text, {
        type: field.type,
        key: field.key,
        defaultValue: field.defaultValue,
        allowModelDirectory: field.allowModelDirectory,
      }).then((r) => {
        if (checkGen.current !== gen) return
        setPathStatus(r.status)
        setPathHint(r.message || '')
      })
    }, 520)
    return () => window.clearTimeout(t)
  }, [value, field.key, field.type, field.defaultValue, field.allowModelDirectory])

  /* 空/占位 + 可扫描: 多候选灰字提示(复用 inventory 缓存) */
  useEffect(() => {
    if (!showScan) {
      setMultiHint('')
      return
    }
    const empty = isPathEmptyForAutofill(value, {
      key: field.key,
      type: field.type,
      pickerType: field.pickerType,
      defaultValue: field.defaultValue,
    })
    if (!empty) {
      setMultiHint('')
      return
    }
    let cancelled = false
    void countCandidatesForField(typeId, field.key).then((n) => {
      if (cancelled) return
      setMultiHint(n >= 2 ? t('field.multi_hint', { n }) : '')
    })
    return () => {
      cancelled = true
    }
  }, [showScan, value, typeId, field.key, field.type, field.pickerType, field.defaultValue])

  const openScan = async (refresh = false) => {
    setRecentOpen(false)
    setOpen(true)
    setLoading(true)
    try {
      const list = await candidatesForField(typeId, field.key, { refresh })
      setItems(list)
      if (!list.length) toast.info(t('field.scan_empty'), 'SCAN')
    } catch (e) {
      toast.warn((e as Error).message, 'SCAN')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const openRecent = () => {
    setOpen(false)
    const list = collectRecentDatasetPaths()
    setRecentPaths(list)
    setRecentOpen(true)
    if (!list.length) toast.info(t('field.recent_empty'), 'RECENT')
  }

  const bad = pathStatus === 'missing' || pathStatus === 'type_mismatch'
  const rowClass = ['lx-path-row', bad ? 'is-missing' : '', pathStatus === 'ok' ? 'is-ok' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="lx-path-field" ref={rootRef}>
      <div className={rowClass}>
        <Input
          value={value}
          disabled={disabled}
          placeholder={field.placeholder || (field.type === 'folder' ? t('common.path_dir') : t('common.path_file'))}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={bad || invalid || undefined}
        />
        <Button size="sm" disabled={disabled} onClick={() => void browsePath(field, onChange)}>
          {allowModelDirectory ? '选择文件' : t('field.browse')}
        </Button>
        {allowModelDirectory ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void browsePathAs(field, 'folder', onChange)}>
            选择目录
          </Button>
        ) : null}
        {showScan ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void openScan(false)} title={t('field.scan_title')}>{t('field.scan')}</Button>
        ) : null}
        {showRecent ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={openRecent} title={t('field.recent_title')}>{t('field.recent')}</Button>
        ) : null}
      </div>
      {pathHint ? (
        <div className={['lx-path-hint', bad ? 'is-bad' : pathStatus === 'error' ? 'is-warn' : ''].filter(Boolean).join(' ')}>
          {pathHint}
        </div>
      ) : multiHint ? (
        <div className="lx-path-hint lx-path-hint-multi">{multiHint}</div>
      ) : null}
      {open && showScan ? (
        <div className="lx-scan-pop" role="listbox">
          <div className="lx-scan-pop-head">
            <span>{t('field.scan_results')}</span>
            <button type="button" className="lx-scan-refresh" onClick={() => void openScan(true)} disabled={loading}>
              {loading ? '…' : t('common.refresh')}
            </button>
          </div>
          {loading && !items.length ? <div className="lx-scan-empty">{t('field.scan_loading')}</div> : null}
          {!loading && !items.length ? <div className="lx-scan-empty">{t('field.scan_no_match')}</div> : null}
          <ul className="lx-scan-list">
            {items.map((it) => (
              <li key={it.path}>
                <button
                  type="button"
                  className="lx-scan-item"
                  title={it.path}
                  onClick={() => {
                    onChange(it.path)
                    setOpen(false)
                    toast.ok(t('field.filled', { name: it.name }), 'SCAN')
                  }}
                >
                  <b>{it.name}</b>
                  <span>
                    {[it.model_family, it.artifact_kind || it.model_type, formatSize(it.size)].filter(Boolean).join(' · ')}
                  </span>
                  <i>{it.path}</i>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {recentOpen && showRecent ? (
        <div className="lx-scan-pop" role="listbox">
          <div className="lx-scan-pop-head">
            <span>{t('field.recent_paths')}</span>
            <button type="button" className="lx-scan-refresh" onClick={openRecent}>{t('common.refresh')}</button>
          </div>
          {!recentPaths.length ? (
            <div className="lx-scan-empty">{t('field.recent_no_record')}</div>
          ) : (
            <ul className="lx-scan-list">
              {recentPaths.map((p) => {
                const leaf = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p
                return (
                  <li key={p}>
                    <button
                      type="button"
                      className="lx-scan-item"
                      title={p}
                      onClick={() => {
                        onChange(p)
                        setRecentOpen(false)
                        toast.ok(t('field.filled', { name: leaf }), 'RECENT')
                      }}
                    >
                      <b>{leaf}</b>
                      <i>{p}</i>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** output_name 边输边检(依赖同 draft 的 output_dir) */
function OutputNameField({
  field,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  field: SchemaField
  value: string
  onChange: (raw: unknown) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const { t } = useI18n()
  const draft = useDraft()
  const outputDir = String(draft.output_dir ?? '')
  const saveTo = String(draft.save_to ?? '')
  const resumePath = String(draft.resume_path ?? '')
  const [hint, setHint] = useState('')
  const gen = useRef(0)

  useEffect(() => {
    const id = ++gen.current
    if (!shouldCheckOutputConflict(saveTo || outputDir, value)) {
      setHint('')
      return
    }
    const t = window.setTimeout(() => {
      void checkOutputConflictStatus(outputDir, String(value ?? ''), { saveTo, resumePath }).then((r) => {
        if (gen.current !== id) return
        setHint(r.conflict ? r.message : '')
      })
    }, 500)
    return () => window.clearTimeout(t)
  }, [outputDir, saveTo, resumePath, value])

  return (
    <div className="lx-output-name-field">
      <Input disabled={disabled} value={value} placeholder={field.placeholder || t('common.output_name_ph')} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
      {hint ? <div className="lx-path-hint is-warn">{hint}</div> : null}
    </div>
  )
}

export function FieldControl({
  field,
  value,
  onChange,
  onHelp,
  disabled: disabledProp = false,
  disabledReason: disabledReasonProp = '',
  required = false,
  invalid = false,
}: {
  field: SchemaField
  value: unknown
  onChange: (raw: unknown) => void
  onHelp: (field: SchemaField) => void
  disabled?: boolean
  disabledReason?: string
  /** 后端硬闸要求这个字段(或它的同组字段)必须有值 */
  required?: boolean
  /** 必填但当前为空 */
  invalid?: boolean
}) {
  const { t, language } = useI18n()
  const draft = useDraft()
  const openCompanionTool = useCompanionToolStore((s) => s.open)
  const runtime = useRuntimeStore()
  const activeTrainingType = useTrainConfigStore((s) => s.typeId)
  if (field.type === 'hidden') return null

  // 上游 enable 门(disabledProp)、「该后端在当前运行时不可用」、「当前运行时会强制覆盖
  // 这个字段」合并成一个封锁。已经打开的开关即使被封锁也保持可点,否则用户没法把它关掉。
  const runtimeCtx = {
    ...draft,
    activeTrainingType,
    runtime_id: runtime.runtimeId,
    language,
  }
  const attentionBlocker = attentionBackendBlockReason(field, runtime.profiles, runtimeCtx)
  // forced 才夺走控制权;advisory(如 rocm-amd 的 mixed_precision)只出提示 —— 置灰它
  // 等于把 A 卡用户锁在选不了 fp16 的状态,而 fp16 恰好是那条路线想要的档。
  const blocker = attentionBlocker || runtimeForcedReason(field, runtime.profiles, runtimeCtx)
  const advisory = runtimeAdvisoryNote(field, runtime.profiles, runtimeCtx)
  const keepEditable = field.type === 'boolean' && Boolean(blocker) && Boolean(value)
  const disabled = disabledProp || (Boolean(blocker) && !keepEditable)
  const disabledReason = [blocker || disabledReasonProp, advisory].filter(Boolean).join(' · ')

  const label = resolveFieldLabel(field, language, activeTrainingType)
  const rawDesc = resolveFieldDesc(field, language, activeTrainingType)
  const desc = rawDesc && rawDesc !== label ? rawDesc : ''
  const helpBtn = (
    <span
      className="lx-help"
      title={t('field.help_title')}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onHelp(field)
      }}
    >
      ?
    </span>
  )

  if (field.clippingControl === true) {
    return <GradientClippingControl key={activeTrainingType} field={field} value={value} onChange={onChange}
      help={helpBtn} desc={desc} disabled={disabled} disabledReason={disabledReason} />
  }

  if (field.type === 'boolean') {
    return (
      <div className={['lx-field', 'lx-field-bool', disabled ? 'is-profile-managed' : ''].filter(Boolean).join(' ')} title={rawDesc || field.key}>
        <span className="lx-field-main">
          <span className="lx-field-label">
            <span>{label}</span>
            {helpBtn}
          </span>
          {desc ? <span className="lx-field-desc">{desc}</span> : null}
        </span>
        <Switch checked={Boolean(value)} disabled={disabled} onChange={(v) => onChange(v)} ariaLabel={label} />
        {disabledReason ? <span className="lx-profile-managed-note">{disabledReason}</span> : null}
      </div>
    )
  }

  if (field.type === 'action') {
    const buttonText = String(field.buttonLabel || field.title || label)
    const handler = String(field.handler || '')
    const implemented = handler === 'openAnimaFolderScanner' || Boolean(COMPANION_HANDLERS[handler])
    if (!implemented) return null
    const onAction = () => {
      if (handler === 'openAnimaFolderScanner') {
        void import('@/lib/animaFolderScan')
          .then((m) => m.openAnimaFolderScanner())
          .catch((e) => toast.warn((e as Error).message || 'scan failed', 'SCAN'))
        return
      }
      openCompanionTool(handler, draft)
    }
    return (
      <div className="lx-field" title={field.desc || ''}>
        <span className="lx-field-label">
          <span>{label}</span>
          {helpBtn}
        </span>
        <Button size="sm" disabled={disabled} onClick={onAction}>
          {buttonText}
        </Button>
      </div>
    )
  }

  let control: React.ReactNode
  const str = value == null ? '' : String(value)

  if (field.type === 'concept_direction_pairs') {
    return <div className="lx-field lx-span-full" data-field-key={field.key}>
      <span className="lx-field-label">{label}{helpBtn}</span>
      <ConceptDirectionPairs value={value} onChange={onChange} disabled={disabled} />
      {disabledReason ? <span className="lx-profile-managed-note">{disabledReason}</span> : null}
    </div>
  }
  switch (field.type) {
    case 'select': {
      const opts = optionsOf(field, language, draft, runtime)
      control = <Select disabled={disabled} value={str} options={opts} onChange={(e) => onChange(e.target.value)} />
      break
    }
    case 'multiSelect': {
      const opts = optionsOf(field, language, draft, runtime)
      const selected = new Set(Array.isArray(value) ? value.map(String) : [])
      control = (
        <div className="lx-multi-select" role="group" aria-label={label}>
          {opts.map((option) => (
            <label key={option.value} className="lx-multi-select-option">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.has(option.value)}
                onChange={(event) => {
                  const next = new Set(selected)
                  if (event.target.checked) next.add(option.value)
                  else next.delete(option.value)
                  onChange(Array.from(next))
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )
      break
    }
    case 'csvMultiSelect': {
      // 值存逗号串而不是数组:gpu_ids 在权威声明里是 str(configs_base.py),后端两处也按
      // 逗号串解析,写数组会在 pydantic 那一关被拒。
      const opts = optionsOf(field, language, draft, runtime)
      const tokens = str.split(',').map((token) => token.trim()).filter(Boolean)
      if (!opts.length) {
        // 候选表还没到位(或机器上一张卡都读不到)时退回文本框,让用户仍能手填,而不是
        // 留一个点不动的空控件。
        control = (
          <Input
            disabled={disabled}
            value={str}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )
        break
      }
      const known = new Set(opts.map((o) => o.value))
      // 认不出来的取值(手改的配置 / 旧版本别名)原样留着并说明,不静默丢掉
      const unknown = tokens.filter((token) => !known.has(token))
      const picked = tokens.filter((token) => known.has(token))
      const selected = new Set(picked)
      const write = (next: string[]) => onChange([...next, ...unknown].join(','))
      const toggle = (optionValue: string, on: boolean) => {
        if (field.preserveSelectionOrder) {
          // 顺序有语义的字段(来源优先级)按勾选顺序追加,不重排
          write(on ? [...picked, optionValue] : picked.filter((token) => token !== optionValue))
          return
        }
        const next = new Set(selected)
        if (on) next.add(optionValue)
        else next.delete(optionValue)
        write(opts.filter((o) => next.has(o.value)).map((o) => o.value))
      }
      const en = language === 'en'
      const inheritHint = !field.deviceListOptions
        ? ''
        : runtime.launcherSelection
          ? en
            ? `Empty = inherit the cards the launcher started with: ${runtime.launcherSelection}`
            : `留空 = 继承 launcher 启动时选择的显卡：${runtime.launcherSelection}`
          : en
            ? 'The launcher named no card; empty means every visible GPU'
            : 'launcher 启动时未指定显卡，留空将使用全部可见显卡'
      control = (
        <>
          {['lulynx_optimization_features', 'turbocore_optimizer_algorithms'].includes(field.key) ? (
            <div className="lx-choice-actions">
              <button type="button" disabled={disabled} onClick={() => onChange(opts.filter((option) => !option.disabled).map((option) => option.value).join(','))}>{en ? 'Select all' : '全选'}</button>
              <button type="button" disabled={disabled} onClick={() => onChange('')}>{en ? 'Clear' : '清空'}</button>
            </div>
          ) : null}
          <div className="lx-multi-select" role="group" aria-label={label}>
            {opts.map((option) => (
              <label key={option.value} className="lx-multi-select-option" title={option.title}>
                <input
                  type="checkbox"
                  disabled={disabled || option.disabled}
                  checked={selected.has(option.value)}
                  onChange={(event) => toggle(option.value, event.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {field.preserveSelectionOrder && picked.length > 1 ? (
            <div className="lx-path-hint">
              {(en ? 'Order: ' : '当前顺序：') + picked.join(' → ')}
            </div>
          ) : null}
          {unknown.length ? (
            <div className="lx-path-hint is-warn">
              {(en ? `Kept ${unknown.length} unrecognized value(s): ` : `保留了 ${unknown.length} 个未识别取值：`)
                + unknown.join(', ')}
            </div>
          ) : null}
          {inheritHint && !picked.length ? <div className="lx-path-hint">{inheritHint}</div> : null}
        </>
      )
      break
    }
    case 'number':
      control = (
        <Input
          inputMode="decimal"
          disabled={disabled}
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )
      break
    case 'slider': {
      const num = typeof value === 'number' ? value : Number(value) || Number(field.min ?? 0)
      control = (
        <div className="lx-slider-row">
          <Slider
            min={Number(field.min ?? 0)}
            max={Number(field.max ?? 100)}
            step={Number(field.step ?? 1)}
            value={num}
            disabled={disabled}
            onChange={(v) => onChange(v)}
          />
          <Input className="lx-slider-num" inputMode="decimal" disabled={disabled} value={str} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
      break
    }
    case 'textarea':
      control = <Textarea rows={3} disabled={disabled} value={str} placeholder={field.placeholder} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
      break
    case 'file':
    case 'folder':
      control = <PathFieldRow field={field} value={str} onChange={onChange} disabled={disabled} invalid={invalid} />
      break
    default:
      if (field.key === 'output_name') {
        control = <OutputNameField field={field} value={str} onChange={onChange} disabled={disabled} invalid={invalid} />
      } else {
        // string / text / 未知类型兜底
        control = <Input disabled={disabled} value={str} placeholder={field.placeholder} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
      }
  }

  return (
    <FieldShell
      group={field.type === 'csvMultiSelect' || field.type === 'multiSelect'}
      label={label}
      desc={desc || undefined}
      right={helpBtn}
      required={required}
      invalid={invalid}
      className={[
        ['lulynx_optimization_features', 'turbocore_optimizer_algorithms'].includes(field.key) ? 'lx-optimization-choices' : '',
        field.type === 'textarea' ? 'lx-span-full' : field.type === 'file' || field.type === 'folder' ? 'lx-span-2' : '',
        disabled ? 'is-profile-managed' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
      <div title={rawDesc || ''}>{control}</div>
      {invalid ? <span className="lx-field-invalid-note">{t('field.required_missing')}</span> : null}
      {disabledReason ? <span className="lx-profile-managed-note">{disabledReason}</span> : null}
    </FieldShell>
  )
}
