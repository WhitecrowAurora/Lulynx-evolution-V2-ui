// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { useI18n } from '@/i18n/useI18n'
import { bandLabel, RESIDENCY_KEYS, residencyEdits, type ResourceCost } from '@/lib/resourceCost'
import { listRunRecords } from '@/stores/historyStore'
import type { ComparisonRequest } from '@/api/comparisonApi'
import './resourceCost.css'

export function ResourceCostPanel({ cost, onApply, onCompare }: {
  cost: ResourceCost | undefined
  onApply: (edits: Record<string, unknown>) => void
  onCompare?: (request: ComparisonRequest) => Promise<void>
}) {
  const { language } = useI18n()
  const en = language === 'en'
  const [candidateId, setCandidateId] = useState('fewer_slots')
  const [sourceId, setSourceId] = useState(() => listRunRecords().find((run) => run.typeId === 'krea2-lora' && !run.comparisonSourceRunId)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const candidates = cost?.candidates ?? []
  const selected = candidates.find((candidate) => candidate.id === candidateId && candidate.id !== 'current')
  if (!candidates.length) return null
  const names: Record<string, string> = en
    ? { current: 'Current', fewer_slots: 'Fewer slots', more_slots: 'More slots', less_prefetch: 'Less prefetch', more_prefetch: 'More prefetch' }
    : { current: '当前配置', fewer_slots: '少驻留一块', more_slots: '多驻留一块', less_prefetch: '少预取一块', more_prefetch: '多预取一块' }
  const compare = async () => {
    if (!selected || !onCompare || busy) return
    setBusy(true)
    try {
      await onCompare({ source_run_id: sourceId.trim(), warmup_steps: 2, measurement_steps: 3,
        candidates: [{ gpu_slots: Number(selected.effective_config[RESIDENCY_KEYS[0]]),
          prefetch_depth: Number(selected.effective_config[RESIDENCY_KEYS[1]]) }] })
    } finally { setBusy(false) }
  }
  return <section className="lx-resource-cost" aria-label={en ? 'Residency cost' : '驻留资源代价'}>
    <h4>{en ? 'Residency candidates' : '驻留候选与资源代价'}</h4>
    <p>{en ? 'Weight composition estimates; VRAM/RAM/pinned peaks, total transfer wait and speed remain unmeasured.'
      : '下表估算权重组成。显存、内存与锁页峰值、总传输等待和速度尚未测得，继续保留当前配置。'}</p>
    <div className="lx-resource-scroll"><table>
      <thead><tr><th>{en ? 'Configuration' : '配置'}</th><th>{en ? 'Slots / prefetch' : '驻留 / 预取'}</th><th>{en ? 'Cache weight target' : '缓存权重目标'}</th><th>{en ? 'Prefetch payload' : '预取载荷参考'}</th><th /></tr></thead>
      <tbody>{candidates.map((candidate) => <tr key={candidate.id}>
        <td>{names[candidate.id] ?? candidate.id}</td>
        <td>{String(candidate.effective_config[RESIDENCY_KEYS[0]])} / {String(candidate.effective_config[RESIDENCY_KEYS[1]])}</td>
        <td>{bandLabel(candidate.memory.cache_target_weight_bytes)}</td>
        <td>{bandLabel(candidate.memory.prefetch_payload_reference_bytes)}</td>
        <td>{candidate.id !== 'current' ? <Button size="sm" disabled={busy} onClick={() => onApply(residencyEdits(candidate))}>{en ? 'Apply & recheck' : '采纳并重跑预检'}</Button> : null}</td>
      </tr>)}</tbody>
    </table></div>
    <p>{en ? 'One cold forward weight upload' : '一次冷前向的权重上传参考'}：{bandLabel(candidates[0].transfer.one_cold_forward_weight_h2d_bytes)}。{en ? 'This is not the transfer volume of a training step.' : '此值不是完整训练一步的传输量。'}</p>
    {onCompare ? <fieldset disabled={busy}>
      <legend>{en ? 'Run a bounded comparison' : '提交有界配置比较'}</legend>
      <p>{en ? 'Krea-2 LoRA, eager standard execution, zero workers. Set a full resume checkpoint and retain the original training horizon. Six serial arms each run 2 warmup + 3 measured updates.'
        : '支持 Krea-2 LoRA、标准 eager、零 worker。请配置完整恢复 checkpoint，保留原训练目标。六臂串行，各执行 2 步预热与 3 步测量。'}</p>
      <label>{en ? 'Source run ID' : '来源训练 ID'}<input value={sourceId} onChange={(event) => setSourceId(event.target.value)} /></label>
      <label>{en ? 'Candidate' : '比较候选'}<select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
        {candidates.filter((candidate) => candidate.id !== 'current').map((candidate) => <option key={candidate.id} value={candidate.id}>{names[candidate.id] ?? candidate.id}</option>)}
      </select></label>
      <Button disabled={busy || !selected || !sourceId.trim()} onClick={() => void compare()}>{busy ? (en ? 'Submitting…' : '提交中…') : (en ? 'Start comparison' : '开始比较')}</Button>
    </fieldset> : null}
  </section>
}
