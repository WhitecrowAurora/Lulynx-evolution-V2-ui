// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useMemo, useRef, useState } from 'react'
import { Input, Select } from '@/components/form'
import { Button } from '@/components/primitives'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { buildRunConfig } from '@/schema/schemaIndex.js'
import { normalizeSubsetTimestepOffsets } from '@/schema/features/subsetTimestepOffsets.js'
import { useTrainConfigStore } from '@/stores/configStore'
import { useI18n } from '@/i18n/useI18n'
import { SubsetTimestepDistribution, type SubsetDistribution } from './SubsetTimestepDistribution'

type Subset = { subset_id: string; samples: number; sample_count: number }
type Preview = {
  applied: boolean
  sampling_mode: string
  reason: string
  warnings: string[]
  subsets: Subset[]
  subset_sample_counts: Record<string, number>
  distribution_preview: SubsetDistribution
}
const RELEVANT_KEYS = [
  'subset_timestep_offsets', 'train_data_dir', 'caption_extension', 'flow_model',
  'timestep_sampling', 'ddpm_timestep_sampling', 'timestep_sampling_mode',
  'smart_noise_enabled', 'smart_noise_focus_strength', 'ant_enabled',
  'flow_logit_mean', 'flow_logit_std', 'krea2_training_mode', 'universal_dit_enabled',
  'performance_expert_mode',
]

export function SubsetTimestepOffsetEditor({ config, onChange, onHelp }: {
  config: Record<string, unknown>
  onChange: (value: unknown) => void
  onHelp: () => void
}) {
  const { language } = useI18n()
  const english = language === 'en'
  const typeId = useTrainConfigStore(s => s.typeId)
  const dataDir = String(config.train_data_dir ?? '')
  const [scan, setScan] = useState<{ dataDir: string; subsets: Subset[]; counts: Record<string, number>; warnings: string[] } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState('')
  const generation = useRef(0)
  const activeScan = scan?.dataDir === dataDir ? scan : null
  const subsetsById = useMemo(() => new Map(activeScan?.subsets.map(s => [s.subset_id, s]) ?? []), [activeScan])
  const parsed = useMemo(() => {
    try { return { offsets: normalizeSubsetTimestepOffsets(config.subset_timestep_offsets) as Record<string, number>, error: '' } }
    catch (e) { return { offsets: {} as Record<string, number>, error: (e as Error).message } }
  }, [config.subset_timestep_offsets])
  // Preserve partially typed numeric values until the user completes them.
  const rawOffsets = config.subset_timestep_offsets && typeof config.subset_timestep_offsets === 'object'
    && !Array.isArray(config.subset_timestep_offsets) ? config.subset_timestep_offsets as Record<string, unknown> : parsed.offsets
  const rows = [...new Set([...(activeScan?.subsets.map(s => s.subset_id) ?? []), ...Object.keys(rawOffsets)])].sort()
  const relevant = JSON.stringify(RELEVANT_KEYS.map(key => config[key]))
  const previewCounts = selected && rows.includes(selected) ? { [selected]: 1 } : activeScan?.counts ?? {}
  const countsKey = JSON.stringify(previewCounts)
  useEffect(() => {
    const id = ++generation.current
    setPreview(null)
    setError('')
    setBusy(false)
    if (parsed.error) return
    const timer = window.setTimeout(() => {
      try {
        const payload = buildRunConfig(config, typeId)
        void trainApi.subsetTimestepPreview(payload, false, JSON.parse(countsKey)).then(response => {
          if (id === generation.current) setPreview(unwrap<Preview>(response))
        }).catch(e => { if (id === generation.current) setError((e as Error).message) })
      } catch (e) { setError((e as Error).message) }
    }, 350)
    return () => { window.clearTimeout(timer); generation.current += 1 }
  }, [relevant, typeId, countsKey, parsed.error])

  const scanDataset = async () => {
    const id = ++generation.current
    setBusy(true)
    setPreview(null)
    setError('')
    try {
      const result = unwrap<Preview>(await trainApi.subsetTimestepPreview(buildRunConfig(config, typeId), true))
      if (id !== generation.current) return
      setScan({ dataDir, subsets: result.subsets, counts: result.subset_sample_counts, warnings: result.warnings })
      setSelected('')
      setPreview(result)
    } catch (e) { if (id === generation.current) setError((e as Error).message) }
    finally { if (id === generation.current) setBusy(false) }
  }
  const update = (id: string, value: string) => onChange({ ...rawOffsets, [id]: value === '' ? '' : Number(value) })
  const remove = (id: string) => onChange(Object.fromEntries(Object.entries(rawOffsets).filter(([key]) => key !== id)))
  const warning = parsed.error || error
  return (
    <div className="lx-progressive-editor">
      <div className="lx-progressive-editor-head">
        <div><b>{english ? 'Subset noise distribution' : '子集噪声分布'}</b><span>{english ? 'Default 0. Negative: lower noise; positive: higher noise. Normalized 1000-step domain; logit_normal only.' : '默认 0。负值偏低噪声，正值偏高噪声；按 1000 步归一化域计量，仅 logit_normal 生效。'}</span></div>
        <Button size="sm" disabled={busy || !dataDir.trim() || Boolean(parsed.error)} onClick={() => void scanDataset()}>{busy ? (english ? 'Scanning…' : '扫描中…') : (english ? 'Scan subsets' : '扫描数据集子集')}</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange({})}>{english ? 'Reset offsets' : '偏移全部归零'}</Button>
        <Button size="sm" variant="ghost" onClick={onHelp}>{english ? 'Help' : '使用说明'}</Button>
      </div>
      {warning ? <p className="lx-progressive-phase-warning">{warning}</p> : null}
      {preview ? <p className={preview.applied ? 'lx-cfg-desc' : 'lx-progressive-phase-warning'}>
        {preview.applied ? (english ? 'This configuration supports subset offsets.' : '当前配置支持子集偏移；未设置的子集仍为 0。') : (english ? 'Offsets are inactive in this configuration.' : '当前配置的子集偏移不生效，已保存值会保留。')}
        {' '}{preview.sampling_mode}{preview.reason ? `：${preview.reason}` : ''}
      </p> : null}
      {!rows.length ? <p className="lx-cfg-desc">{english ? 'Select a training dataset directory, then scan its subsets.' : '先选择训练数据集目录，再扫描子集。根数据集使用 .；正则化样本固定为 0。'}</p> : null}
      {activeScan?.warnings.map(message => <p className="lx-progressive-phase-warning" key={message}>{message}</p>)}
      <div className="lx-progressive-phase-list">
        {rows.map(id => {
          const subset = subsetsById.get(id)
          const missing = Boolean(activeScan && !subset && id !== '__regularization__')
          return <div className="lx-progressive-phase-row" key={id}>
            <div className="lx-progressive-phase-title"><b>{id === '.' ? (english ? '. (dataset root)' : '.（数据集根目录）') : id}</b>
              {id in rawOffsets ? <Button size="sm" variant="ghost" onClick={() => remove(id)}>{english ? 'Clear' : '清除配置'}</Button> : null}
            </div>
            <label><span>{english ? 'Offset (−1000 to 1000)' : '偏移（−1000 至 1000）'}</span>
              <Input type="number" min={-1000} max={1000} step={1} value={String(rawOffsets[id] ?? 0)} disabled={preview?.applied === false || id === '__regularization__'} onChange={e => update(id, e.target.value)} />
            </label>
            {subset ? <small>{subset.samples} {english ? 'samples; repeat-weighted count' : '样本；计入重复次数'} {subset.sample_count}</small> : null}
            {missing ? <small className="lx-progressive-phase-warning">{english ? 'Saved subset not found in this dataset; clear or select the original dataset before training.' : '当前数据集中未找到此已保存子集；训练前请清除该配置或选回原数据集。'}</small> : null}
          </div>
        })}
      </div>
      {preview?.distribution_preview.preview_available ? <div>
        {rows.length ? <Select value={selected} options={[{ value: '', label: english ? 'All subsets' : '全部子集（按样本及重复次数加权）' }, ...rows.map(id => ({ value: id, label: id }))]} onChange={e => setSelected(e.target.value)} /> : null}
        <p className="lx-cfg-desc">{!activeScan && !selected ? (english ? 'Baseline preview; scan the dataset to calculate its weighted distribution.' : '尚未扫描数据集，当前仅显示原分布；扫描后计算实际子集加权分布。') : (english ? 'Theoretical distribution; validation and regularization stay unbiased. Custom sampling may change subset proportions.' : '理论分布；验证与正则化样本不加偏移。自定义采样策略可能改变子集占比。')}</p>
        <SubsetTimestepDistribution preview={preview.distribution_preview} english={english} />
      </div> : null}
    </div>
  )
}
