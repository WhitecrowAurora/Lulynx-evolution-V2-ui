// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useMemo } from 'react'
import { Input, Select } from '@/components/form'
import { Button } from '@/components/primitives'
import { useI18n } from '@/i18n/useI18n'
import { useDraft } from '@/stores/configStore'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { toast } from '@/stores/toastStore'

/* 素材解耦编辑器:多行结构化编辑 → JSON.stringify 写回单个 subset_content_roles 字段。
   仿 ProgressivePhaseEditor,由 SectionCard 按 section.id='material-decoupling' 注入。 */

type Row = {
  subset_id: string
  content_type: string
  caption_mode: string
  descriptor: string
  mask_mode: string
}

const CONTENT_TYPES = ['', 'face', 'clothing', 'full_body', 'generic'] as const
const CAPTION_MODES = ['inherit', 'bake', 'descriptor', 'trigger'] as const
const MASK_MODES = ['inherit', 'none', 'auto_fg', 'semantic_region'] as const

const CONTENT_SET = new Set<string>(CONTENT_TYPES)
const CAPTION_SET = new Set<string>(CAPTION_MODES)
const MASK_SET = new Set<string>(MASK_MODES)

function emptyRow(): Row {
  return { subset_id: '', content_type: '', caption_mode: 'inherit', descriptor: '', mask_mode: 'inherit' }
}

type Parsed = { rows: Row[]; invalid: boolean }

function parseRows(value: unknown): Parsed {
  if (value == null || value === '') return { rows: [], invalid: false }
  let raw: unknown = value
  if (typeof value === 'string') {
    if (!value.trim()) return { rows: [], invalid: false }
    try { raw = JSON.parse(value) } catch { return { rows: [], invalid: true } }
  }
  if (!Array.isArray(raw)) return { rows: [], invalid: true }
  const rows = raw.map((item): Row => {
    const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {}
    const contentType = String(o.content_type ?? '')
    const captionMode = String(o.caption_mode ?? 'inherit')
    const maskMode = String(o.mask_mode ?? 'inherit')
    return {
      // 后端也接受 path / folder,读入时统一归到 subset_id
      subset_id: String(o.subset_id ?? o.path ?? o.folder ?? ''),
      content_type: CONTENT_SET.has(contentType) ? contentType : '',
      caption_mode: CAPTION_SET.has(captionMode) ? captionMode : 'inherit',
      descriptor: String(o.descriptor ?? ''),
      mask_mode: MASK_SET.has(maskMode) ? maskMode : 'inherit',
    }
  })
  return { rows, invalid: false }
}

// 空列表 → 空串(collectVisiblePayload 会省略);否则写回严格匹配后端契约的行数组。
function serialize(rows: Row[]): string {
  if (!rows.length) return ''
  return JSON.stringify(rows.map((r) => ({
    subset_id: r.subset_id.trim(),
    content_type: r.content_type,
    caption_mode: r.caption_mode,
    descriptor: r.descriptor,
    mask_mode: r.mask_mode,
  })))
}

// 选目录后尽量换算成相对 train_data_dir 的 posix 子文件夹名;算不出时退回叶子名。
function toRelativeSubset(abs: string, trainDataDir: string): string {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '')
  const a = norm(abs)
  const root = norm(String(trainDataDir || ''))
  if (!a) return ''
  if (root && a.toLowerCase() === root.toLowerCase()) return '.'
  if (root && a.toLowerCase().startsWith(root.toLowerCase() + '/')) return a.slice(root.length + 1)
  return a.split('/').pop() || a
}

export function MaterialDecouplingEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (value: string) => void
}) {
  const { t } = useI18n()
  const draft = useDraft()
  const parsed = useMemo(() => parseRows(value), [value])
  const rows = parsed.rows

  const commit = (next: Row[]) => onChange(serialize(next))
  const updateRow = (index: number, patch: Partial<Row>) =>
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const addRow = () => commit([...rows, emptyRow()])
  const removeRow = (index: number) => commit(rows.filter((_, i) => i !== index))

  const browseFolder = async (index: number) => {
    try {
      const payload = unwrap<Record<string, unknown>>(await trainApi.pickFile('folder', 'subset_content_role_folder'))
      const path =
        (typeof payload === 'string' && payload) ||
        (payload && typeof payload === 'object' && (payload.path ?? payload.file ?? payload.folder))
      if (typeof path === 'string' && path) {
        updateRow(index, { subset_id: toRelativeSubset(path, String(draft.train_data_dir ?? '')) })
      }
    } catch (e) {
      toast.warn((e as Error).message, 'PICKER')
    }
  }

  const contentOptions = CONTENT_TYPES.map((v) => ({ value: v, label: t(`matdecouple.ct.${v || 'unset'}`) }))
  const captionOptions = CAPTION_MODES.map((v) => ({ value: v, label: t(`matdecouple.cm.${v}`) }))
  const maskOptions = MASK_MODES.map((v) => ({ value: v, label: t(`matdecouple.mm.${v}`) }))

  return (
    <div className="lx-progressive-editor">
      <div className="lx-progressive-editor-head">
        <div>
          <b>{t('matdecouple.head_title')}</b>
          <span>{t('matdecouple.head_desc')}</span>
        </div>
        <Button size="sm" onClick={addRow}>{t('matdecouple.add_row')}</Button>
      </div>

      {parsed.invalid ? <p className="lx-progressive-phase-warning">{t('matdecouple.invalid_json')}</p> : null}
      {!rows.length && !parsed.invalid ? <p className="lx-cfg-desc">{t('matdecouple.empty_hint')}</p> : null}

      <div className="lx-progressive-phase-list">
        {rows.map((row, index) => {
          const useDescriptor = row.caption_mode === 'descriptor' || row.caption_mode === 'trigger'
          const subsetMissing = !row.subset_id.trim()
          return (
            <div className="lx-progressive-phase-row" key={index}>
              <div className="lx-progressive-phase-title">
                <span className="lx-num">{String(index + 1).padStart(2, '0')} · {row.subset_id.trim() || '—'}</span>
                <button type="button" className="lx-progressive-remove" onClick={() => removeRow(index)} aria-label={t('matdecouple.remove')}>−</button>
              </div>
              <label>
                <span>{t('matdecouple.subset_id')}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <Input value={row.subset_id} placeholder={t('matdecouple.subset_id_ph')} aria-invalid={subsetMissing || undefined} onChange={(e) => updateRow(index, { subset_id: e.target.value })} />
                  <Button size="sm" variant="ghost" onClick={() => void browseFolder(index)}>{t('matdecouple.browse')}</Button>
                </span>
              </label>
              <label><span>{t('matdecouple.content_type')}</span><Select value={row.content_type} options={contentOptions} onChange={(e) => updateRow(index, { content_type: e.target.value })} /></label>
              <label><span>{t('matdecouple.caption_mode')}</span><Select value={row.caption_mode} options={captionOptions} onChange={(e) => updateRow(index, { caption_mode: e.target.value })} /></label>
              {useDescriptor ? (
                <label><span>{t('matdecouple.descriptor')}</span><Input value={row.descriptor} placeholder={t('matdecouple.descriptor_ph')} onChange={(e) => updateRow(index, { descriptor: e.target.value })} /></label>
              ) : null}
              <label><span>{t('matdecouple.mask_mode')}</span><Select value={row.mask_mode} options={maskOptions} onChange={(e) => updateRow(index, { mask_mode: e.target.value })} /></label>
              {subsetMissing ? <small className="lx-progressive-phase-warning">{t('matdecouple.err_subset_required')}</small> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
