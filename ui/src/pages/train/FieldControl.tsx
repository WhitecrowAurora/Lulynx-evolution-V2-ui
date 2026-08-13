// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, useState } from 'react'
import type { SchemaField, SchemaFieldOption } from '@/schema/schemaIndex'
import { FieldShell, Input, Select, Slider, Switch, Textarea } from '@/components/form'
import { Button } from '@/components/primitives'
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
import { toast } from '@/stores/toastStore'
import {
  useI18n,
  translate,
  resolveFieldLabel,
  resolveFieldDesc,
  resolveOptionLabel,
} from '@/i18n/useI18n'

/* schema 字段 → 控件。11 种字段类型的统一渲染入口。 */

function optionsOf(
  field: SchemaField,
  language: string,
  config: Record<string, unknown>,
): { value: string; label: string; disabled?: boolean; title?: string }[] {
  const source = typeof field.options === 'function' ? field.options(config) : field.options
  const rows = source && typeof source !== 'string' && Symbol.iterator in Object(source)
    ? Array.from(source)
    : []
  return rows.map((o) => {
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
}: {
  field: SchemaField
  value: string
  onChange: (raw: unknown) => void
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
      }).then((r) => {
        if (checkGen.current !== gen) return
        setPathStatus(r.status)
        setPathHint(r.message || '')
      })
    }, 520)
    return () => window.clearTimeout(t)
  }, [value, field.key, field.type, field.defaultValue])

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
          placeholder={field.placeholder || (field.type === 'folder' ? t('common.path_dir') : t('common.path_file'))}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={bad || undefined}
        />
        <Button size="sm" onClick={() => void browsePath(field, onChange)}>
          {allowModelDirectory ? '选择文件' : t('field.browse')}
        </Button>
        {allowModelDirectory ? (
          <Button size="sm" variant="ghost" onClick={() => void browsePathAs(field, 'folder', onChange)}>
            选择目录
          </Button>
        ) : null}
        {showScan ? (
          <Button size="sm" variant="ghost" onClick={() => void openScan(false)} title={t('field.scan_title')}>{t('field.scan')}</Button>
        ) : null}
        {showRecent ? (
          <Button size="sm" variant="ghost" onClick={openRecent} title={t('field.recent_title')}>{t('field.recent')}</Button>
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
}: {
  field: SchemaField
  value: string
  onChange: (raw: unknown) => void
}) {
  const { t } = useI18n()
  const draft = useDraft()
  const outputDir = String(draft.output_dir ?? '')
  const [hint, setHint] = useState('')
  const gen = useRef(0)

  useEffect(() => {
    const id = ++gen.current
    if (!shouldCheckOutputConflict(outputDir, value)) {
      setHint('')
      return
    }
    const t = window.setTimeout(() => {
      void checkOutputConflictStatus(outputDir, String(value ?? '')).then((r) => {
        if (gen.current !== id) return
        setHint(r.conflict ? r.message : '')
      })
    }, 500)
    return () => window.clearTimeout(t)
  }, [outputDir, value])

  return (
    <div className="lx-output-name-field">
      <Input value={value} placeholder={field.placeholder || t('common.output_name_ph')} onChange={(e) => onChange(e.target.value)} />
      {hint ? <div className="lx-path-hint is-warn">{hint}</div> : null}
    </div>
  )
}

export function FieldControl({
  field,
  value,
  onChange,
  onHelp,
}: {
  field: SchemaField
  value: unknown
  onChange: (raw: unknown) => void
  onHelp: (field: SchemaField) => void
}) {
  const { t, language } = useI18n()
  const draft = useDraft()
  if (field.type === 'hidden') return null

  const label = resolveFieldLabel(field, language)
  const rawDesc = resolveFieldDesc(field, language)
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

  if (field.type === 'boolean') {
    return (
      <div className="lx-field lx-field-bool" title={rawDesc || field.key}>
        <span className="lx-field-main">
          <span className="lx-field-label">
            <span>{label}</span>
            {helpBtn}
          </span>
          {desc ? <span className="lx-field-desc">{desc}</span> : null}
        </span>
        <Switch checked={Boolean(value)} onChange={(v) => onChange(v)} ariaLabel={label} />
      </div>
    )
  }

  if (field.type === 'action') {
    const buttonText = String(field.buttonLabel || field.title || label)
    const handler = String(field.handler || '')
    const implemented = handler === 'openAnimaFolderScanner'
    if (!implemented) return null
    const onAction = () => {
      if (handler === 'openAnimaFolderScanner') {
        void import('@/lib/animaFolderScan')
          .then((m) => m.openAnimaFolderScanner())
          .catch((e) => toast.warn((e as Error).message || 'scan failed', 'SCAN'))
        return
      }
    }
    return (
      <div className="lx-field" title={field.desc || ''}>
        <span className="lx-field-label">
          <span>{label}</span>
          {helpBtn}
        </span>
        <Button size="sm" onClick={onAction}>
          {buttonText}
        </Button>
      </div>
    )
  }

  let control: React.ReactNode
  const str = value == null ? '' : String(value)

  switch (field.type) {
    case 'select': {
      const opts = optionsOf(field, language, draft)
      control = <Select value={str} options={opts} onChange={(e) => onChange(e.target.value)} />
      break
    }
    case 'multiSelect': {
      const opts = optionsOf(field, language, draft)
      const selected = new Set(Array.isArray(value) ? value.map(String) : [])
      control = (
        <div className="lx-multi-select" role="group" aria-label={label}>
          {opts.map((option) => (
            <label key={option.value} className="lx-multi-select-option">
              <input
                type="checkbox"
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
    case 'number':
      control = (
        <Input
          inputMode="decimal"
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
            onChange={(v) => onChange(v)}
          />
          <Input className="lx-slider-num" inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
      break
    }
    case 'textarea':
      control = <Textarea rows={3} value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      break
    case 'file':
    case 'folder':
      control = <PathFieldRow field={field} value={str} onChange={onChange} />
      break
    default:
      if (field.key === 'output_name') {
        control = <OutputNameField field={field} value={str} onChange={onChange} />
      } else {
        // string / text / 未知类型兜底
        control = <Input value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      }
  }

  return (
    <FieldShell
      label={label}
      desc={desc || undefined}
      right={helpBtn}
      className={field.type === 'textarea' ? 'lx-span-full' : field.type === 'file' || field.type === 'folder' ? 'lx-span-2' : undefined}
    >
      <div title={rawDesc || ''}>{control}</div>
    </FieldShell>
  )
}
