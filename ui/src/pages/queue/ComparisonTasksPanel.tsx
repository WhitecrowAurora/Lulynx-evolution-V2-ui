// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, useState } from 'react'
import { Panel } from '@/components/layout'
import { Button } from '@/components/primitives'
import { comparisonApi, type ComparisonJob } from '@/api/comparisonApi'
import { unwrap } from '@/api/transport'
import { useI18n } from '@/i18n/useI18n'
import { listRunRecords } from '@/stores/historyStore'
import { bandLabel, bytesLabel, RESIDENCY_KEYS, type ByteBand } from '@/lib/resourceCost'
import { toast } from '@/stores/toastStore'
import { ComparisonHostResources } from './ComparisonHostResources'

const STATES: Record<string, [string, string]> = {
  queued: ['等待执行', 'Queued'], running: ['比较中', 'Running'], completed: ['已完成', 'Completed'],
  failed: ['候选失败', 'Failed'], cancelled: ['已取消', 'Cancelled'], cancel_timeout: ['取消超时', 'Cancellation timed out'],
  interrupted: ['协调已中断', 'Interrupted'], unknown: ['状态未知', 'Unknown'], pending: ['未测量', 'Not measured'],
}
function stateLabel(value: unknown, en: boolean) { return STATES[String(value)]?.[en ? 1 : 0] ?? String(value ?? '—') }

export function ComparisonTasksPanel({ jobs, refreshTick, error, onRefresh }: {
  jobs: ComparisonJob[]; refreshTick: number; error: string; onRefresh: () => void
}) {
  const { language } = useI18n()
  const en = language === 'en'
  const [selectedId, setSelectedId] = useState('')
  const [execution, setExecution] = useState<Record<string, unknown> | null>(null)
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [readError, setReadError] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [currentRunId, setCurrentRunId] = useState('')
  const [reuseBusy, setReuseBusy] = useState(false)
  const [reuse, setReuse] = useState<Record<string, unknown> | null>(null)
  const reuseRevision = useRef(0)
  const saved = listRunRecords().filter((run) => run.comparisonSourceRunId)
  const known = jobs.filter((job) => job.metadata?.operation === 'training_comparison_execution')
    .map((job) => ({ id: job.id, source: job.metadata!.source_run_id ?? '', status: job.status }))
  const sessions = [...known, ...saved.filter((run) => !known.some((job) => job.id === run.id))
    .map((run) => ({ id: run.id, source: run.comparisonSourceRunId!, status: 'unknown' }))]
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0]
  const source = selected?.source ?? ''
  const id = selected?.id ?? ''
  useEffect(() => { reuseRevision.current++; setExecution(null); setReport(null); setReadError(''); setReuse(null); setCurrentRunId(''); setReuseBusy(false) }, [source, id])
  useEffect(() => {
    if (!id || !source) return
    let active = true
    void (async () => {
      try {
        const record = unwrap<Record<string, unknown>>(await comparisonApi.execution(source, id))
        const locator = record.report as { anchor_run_id?: string; report_id?: string } | null
        const result = locator?.anchor_run_id && locator.report_id
          ? unwrap<Record<string, unknown>>(await comparisonApi.report(locator.anchor_run_id, locator.report_id)) : null
        if (active) { setExecution(record); setReport(result); setReadError('') }
      } catch (e) { if (active) setReadError((e as Error).message) }
    })()
    return () => { active = false }
  }, [source, id, refreshTick])
  const cancel = async () => {
    if (!id || cancelBusy) return
    setCancelBusy(true)
    try { unwrap(await comparisonApi.cancel(id)); onRefresh() }
    catch (e) { toast.err((e as Error).message) }
    finally { setCancelBusy(false) }
  }
  const runs = (report?.runs ?? []) as Record<string, unknown>[]
  const predictions = report?.resource_predictions as { candidates?: { id: string; worker_peak_allocated_bytes?: ByteBand; weight_h2d_bytes?: ByteBand }[] } | undefined
  const checkReuse = async () => {
    if (!report || reuseBusy) return
    setReuseBusy(true)
    const revision = ++reuseRevision.current
    const anchor = String(report.anchor_run_id ?? '')
    try {
      const refreshed = unwrap<Record<string, unknown>>(await comparisonApi.report(anchor, String(report.report_id), currentRunId.trim() || anchor))
      if (revision === reuseRevision.current) setReuse(refreshed.current_resource_reuse as Record<string, unknown> ?? null)
    } catch (e) { toast.err((e as Error).message) }
    finally { if (revision === reuseRevision.current) setReuseBusy(false) }
  }
  const arms = (execution?.arms ?? []) as { index: number; label?: string; status?: string }[]
  const status = execution?.status ?? selected?.status
  return <Panel title={en ? 'Training configuration comparisons' : '训练配置比较'} panelId="QUEUE.COMPARISONS" className="lx-comparison-tasks"
    right={<Button size="sm" onClick={onRefresh}>{en ? 'Refresh reports' : '刷新报告'}</Button>}>
    {error || readError ? <p role="alert">{error || readError}</p> : null}
    {!sessions.length ? <p>{en ? 'Choose a candidate in training preflight to submit a comparison.' : '在训练预检中选择候选，显式提交比较任务。'}</p> : <>
      <label>{en ? 'Comparison' : '比较任务'} <select aria-label={en ? 'Comparison' : '比较任务'} value={id} onChange={(event) => setSelectedId(event.target.value)}>
        {sessions.map((session) => <option key={session.id} value={session.id}>{session.id} · {stateLabel(session.status, en)}</option>)}
      </select></label>
      <p>{stateLabel(status, en)} · {source}</p>
      {status === 'queued' || status === 'running' ? <Button size="sm" disabled={cancelBusy} onClick={() => void cancel()}>{en ? 'Cancel comparison' : '取消比较'}</Button> : null}
      {execution?.error ? <p role="alert">{String(execution.error)}</p> : null}
      <p>{arms.map((arm) => `${arm.index + 1}: ${stateLabel(arm.status, en)}`).join(' · ')}</p>
      {report ? <>
        <p>{en ? 'A/A median range' : 'A/A 中位数范围'}：{typeof report.aa_median_range_fraction === 'number' ? `${(report.aa_median_range_fraction * 100).toFixed(2)}%` : '—'}。
          {en ? 'Keep the current configuration; no automatic recommendation.' : '保留当前配置；本报告不自动推荐或修改训练参数。'}</p>
        <p>{en ? 'Artifact validity' : '记录有效性'}：{report.snapshot_validity === 'stale'
          ? (en ? 'Artifacts or source changed; historical result only.' : '文件或源码已变化，仅供历史查看。')
          : (en ? 'Recorded artifacts unchanged; current workload reuse has not been verified.' : '已记录文件未变化；尚未核对当前工作负载能否复用。')}</p>
        <div className="lx-resource-scroll"><table>
          <thead><tr><th>{en ? 'Run / slots / prefetch' : '训练 / 驻留 / 预取'}</th><th>{en ? 'Numerics' : '数值对照'}</th><th>{en ? 'Step median' : '整步中位数'}</th><th>H2D / D2H</th><th>{en ? 'Ideal reference difference' : '理想访问参考差值'}</th><th>{en ? 'Wait bracket' : '等待包围区间'}</th><th>{en ? 'Worker peak' : 'worker 历史峰值'}</th></tr></thead>
          <tbody>{runs.map((run) => {
            const resource = run.resource_comparison as { steady_medians?: Record<string, unknown>; reference_error_median_bytes?: ByteBand } | undefined
            const measured = resource?.steady_medians ?? {}
            const config = (run.evidence as { effective_config?: Record<string, unknown> } | undefined)?.effective_config ?? {}
            return <tr key={String(run.run_id)}><td>{run.role === 'baseline' ? (en ? 'Baseline' : '基线') : (en ? 'Candidate' : '候选')} · {String(run.run_id).slice(0, 8)} · {String(config[RESIDENCY_KEYS[0]] ?? '—')} / {String(config[RESIDENCY_KEYS[1]] ?? '—')}</td>
              <td>{run.comparison_status === 'comparable' ? (en ? 'Exact recorded match' : '记录数值一致') : (en ? 'Insufficient / different' : '证据不足或不同')}</td>
              <td>{typeof run.median_step_seconds === 'number' ? `${run.median_step_seconds.toFixed(3)} s` : '—'}</td>
              <td>{bytesLabel(measured.weight_h2d_bytes)} / {bytesLabel(measured.weight_d2h_bytes)}</td>
              <td>{bandLabel(resource?.reference_error_median_bytes)}</td>
              <td>{typeof measured.prefetch_wait_bracket_seconds === 'number' ? `${(measured.prefetch_wait_bracket_seconds * 1000).toFixed(2)} ms` : '—'}</td>
              <td>{bytesLabel(measured.worker_peak_allocated_bytes)}</td></tr>
          })}</tbody>
        </table></div>
        <p>{en ? 'Reference differences compare actual bytes with ideal cold forward/reverse LRU, excluding prefetch and active eviction. Wait brackets include submission gaps, not all unhidden transfer. Worker peaks include model load and prior callbacks. Old reports may lack resources.'
          : '参考差值为实测字节减理想冷前向/反向 LRU，简化了预取与活跃块淘汰。等待区间包含提交间隙，未覆盖总等待；worker 峰值包含加载与先前回调。旧报告可能没有资源测量。'}</p>
        <label>{en ? 'Recorded workload run ID' : '待核对负载的训练 ID'} <input disabled={reuseBusy} value={currentRunId} placeholder={String(report.anchor_run_id ?? '')} onChange={(event) => { setCurrentRunId(event.target.value); setReuse(null) }} /></label>
        <Button size="sm" disabled={reuseBusy || report.snapshot_validity === 'stale'} onClick={() => void checkReuse()}>{reuseBusy ? (en ? 'Checking assets…' : '正在核对素材…') : (en ? 'Check resource reuse' : '核对资源复用')}</Button>
        <p>{reuse?.status === 'resource_workload_matches' && report.snapshot_validity !== 'stale'
          ? (en ? 'Assets, code and environment match at the recorded check time. Resource estimates only; checkpoint and numerical trajectory reuse remain separate.' : '核对时模型、缓存、源码与环境一致。仅用于资源估算；恢复起点和数值轨迹需单独比较。')
          : reuse ? `${en ? 'Unavailable or different' : '证据不足或负载不同'}：${JSON.stringify(reuse.differences)}` : (en ? 'Current asset identity has not been refreshed.' : '尚未重新核对当前素材身份。')}
          {reuse?.checked_at ? ` ${String(reuse.checked_at)}` : ''}</p>
        {predictions?.candidates?.length ? <>
          <p>{en ? 'Historical workload fit, limited to measured slots at the same prefetch depth. Error bands are empirical, not capacity guarantees; speed remains unknown.' : '历史负载拟合仅覆盖实测驻留范围及相同预取深度。误差范围来自样本，不保证一定容纳；速度仍未知。'}</p>
          <div className="lx-resource-scroll"><table><thead><tr><th>{en ? 'Candidate' : '候选'}</th><th>{en ? 'Estimated worker peak' : '估算 worker 历史峰值'}</th><th>{en ? 'Estimated H2D' : '估算 H2D'}</th></tr></thead>
            <tbody>{predictions.candidates.map((item) => <tr key={item.id}><td>{item.id}</td><td>{bandLabel(item.worker_peak_allocated_bytes)}</td><td>{bandLabel(item.weight_h2d_bytes)}</td></tr>)}</tbody></table></div>
        </> : null}
        <ComparisonHostResources runs={runs} predictions={report.host_peak_predictions as Parameters<typeof ComparisonHostResources>[0]['predictions']} en={en} />
        <details><summary>{en ? 'Evidence, differences and reference errors' : '证据、配置差异与参考误差'}</summary><pre className="lx-log">{JSON.stringify(report, null, 2)}</pre></details>
      </> : null}
    </>}
  </Panel>
}
