// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useState } from 'react'
import { companionToolsApi } from '@/api/companionToolsApi'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { Input } from '@/components/form'
import { Modal } from '@/components/overlay'
import { Badge, Button } from '@/components/primitives'
import { useCompanionToolStore } from '@/stores/companionToolStore'
import { toast } from '@/stores/toastStore'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '未知错误')
}

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) return null
  return (
    <pre className="lx-log" style={{ maxHeight: 320, overflow: 'auto', marginTop: 12 }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function FimScanTool({ config, onClose }: { config: Record<string, unknown>; onClose: () => void }) {
  const [calibSteps, setCalibSteps] = useState(String(config.fim_scan_calib_steps ?? 8))
  const [rMin, setRMin] = useState(String(config.fim_scan_r_min ?? 8))
  const [rMax, setRMax] = useState(String(config.fim_scan_r_max ?? 64))
  const [ratio, setRatio] = useState(String(config.fim_scan_suggest_ratio ?? 0.5))
  const [jobId, setJobId] = useState('')
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const tick = async () => {
      try {
        const job = await companionToolsApi.jobStatus(jobId)
        if (cancelled) return
        setStatus(String(job.status || ''))
        if (job.error) setStatus(`failed: ${job.error}`)
        const result = job.metadata?.report ?? job.result
        if (result != null) setReport(result)
        if (['completed', 'failed', 'cancelled', 'canceled'].includes(String(job.status || '').toLowerCase())) {
          setBusy(false)
          if (job.error) toast.err(String(job.error), 'FIM SCAN')
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(`poll failed: ${errorText(error)}`)
          setBusy(false)
        }
      }
    }
    void tick()
    const timer = window.setInterval(tick, 1200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [jobId])

  const start = async () => {
    setBusy(true)
    setReport(null)
    setStatus('starting...')
    try {
      const payload = await companionToolsApi.startFimScan({
        ...config,
        fim_scan_enabled: true,
        fim_scan_calib_steps: Number(calibSteps) || 8,
        fim_scan_r_min: Number(rMin) || 8,
        fim_scan_r_max: Number(rMax) || 64,
        fim_scan_suggest_ratio: Number(ratio) || 0.5,
      })
      const data = unwrap<{ job_id?: string; jobId?: string }>(payload)
      const id = String(data.job_id ?? data.jobId ?? '')
      if (!id) throw new Error('后端未返回 job_id')
      setJobId(id)
      setStatus('queued')
      setBusy(false)
    } catch (error) {
      setBusy(false)
      setStatus(`failed: ${errorText(error)}`)
      toast.err(errorText(error), 'FIM SCAN')
    }
  }

  return (
    <Modal open title="FIM Rank 扫描器" onClose={onClose} width={680} busy={busy}>
      <p className="lx-field-desc">用经验 Fisher 信息扫描各层敏感度，生成建议层与 rank map。扫描会占用训练 GPU。</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <label className="lx-field"><span className="lx-field-label">校准步数</span><Input value={calibSteps} onChange={(e) => setCalibSteps(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">建议比例</span><Input value={ratio} onChange={(e) => setRatio(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">r_min</span><Input value={rMin} onChange={(e) => setRMin(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">r_max</span><Input value={rMax} onChange={(e) => setRMax(e.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <Button variant="primary" disabled={busy} onClick={() => void start()}>{busy ? '扫描中…' : '开始扫描'}</Button>
        {status ? <Badge tone={status.startsWith('failed') ? 'danger' : status === 'completed' ? 'ok' : 'accent'}>{status}</Badge> : null}
      </div>
      <JsonBlock value={report} />
    </Modal>
  )
}

function LoraMetaTool({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('')
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async () => {
    try {
      const picked = unwrap<{ path?: string }>(await trainApi.pickFile('file', 'lora_file'))
      if (picked.path) setPath(picked.path)
    } catch (error) {
      toast.warn(errorText(error), 'LORA META')
    }
  }

  const read = async () => {
    if (!path.trim()) return
    setBusy(true)
    try {
      setMeta(unwrap<Record<string, unknown>>(await companionToolsApi.readLoraMetadata(path.trim())))
    } catch (error) {
      toast.err(errorText(error), 'LORA META')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title="LoRA 元数据读取" onClose={onClose} width={640} busy={busy}>
      <p className="lx-field-desc">读取 safetensors / pt / ckpt 的训练元数据，不加载权重、不启动训练。</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="选择或填写 LoRA 文件路径" />
        <Button onClick={() => void pick()}>选择文件</Button>
        <Button variant="primary" disabled={busy || !path.trim()} onClick={() => void read()}>{busy ? '读取中…' : '读取'}</Button>
      </div>
      <JsonBlock value={meta} />
    </Modal>
  )
}

function GoalForecastTool({ config, onClose }: { config: Record<string, unknown>; onClose: () => void }) {
  const [runId, setRunId] = useState(String(config.__last_run_id || config.output_name || ''))
  const [lossTarget, setLossTarget] = useState('')
  const [validationTarget, setValidationTarget] = useState('')
  const [l2Target, setL2Target] = useState('')
  const [totalSteps, setTotalSteps] = useState(String(config.max_train_steps ?? ''))
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!runId.trim()) return
    setBusy(true)
    try {
      setReport(unwrap<Record<string, unknown>>(await companionToolsApi.goalForecast(runId.trim(), {
        lossTarget: lossTarget ? Number(lossTarget) : undefined,
        validationLossTarget: validationTarget ? Number(validationTarget) : undefined,
        l2Target: l2Target ? Number(l2Target) : undefined,
        totalSteps: totalSteps ? Number(totalSteps) : undefined,
      })))
    } catch (error) {
      toast.err(errorText(error), 'GOAL FORECAST')
    } finally {
      setBusy(false)
    }
  }

  const verdict = String(report?.verdict ?? '')
  return (
    <Modal open title="训练达标预测" onClose={onClose} width={620} busy={busy}>
      <p className="lx-field-desc">读取已训练 run 的 loss / 验证 loss / L2 时序，做只读预测；不会修改训练。</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <label className="lx-field"><span className="lx-field-label">Run ID</span><Input value={runId} onChange={(e) => setRunId(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">总步数</span><Input value={totalSteps} onChange={(e) => setTotalSteps(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">Loss 目标</span><Input value={lossTarget} onChange={(e) => setLossTarget(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">验证 Loss 目标</span><Input value={validationTarget} onChange={(e) => setValidationTarget(e.target.value)} /></label>
        <label className="lx-field"><span className="lx-field-label">L2 目标</span><Input value={l2Target} onChange={(e) => setL2Target(e.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <Button variant="primary" disabled={busy || !runId.trim()} onClick={() => void run()}>{busy ? '预测中…' : '开始预测'}</Button>
        {verdict ? <Badge tone={verdict === 'on_track' ? 'ok' : verdict === 'off_track' ? 'danger' : 'warn'}>{verdict}</Badge> : null}
      </div>
      <JsonBlock value={report} />
    </Modal>
  )
}

const COPILOT_TUNABLES = [
  { name: 'learning_rate', label: '学习率', step: '2.0' },
  { name: 'network_dim', label: 'network_dim', step: '8' },
  { name: 'network_alpha', label: 'network_alpha', step: '2.0' },
  { name: 'min_snr_gamma', label: 'min_snr_gamma', step: '1' },
] as const

const COPILOT_SESSION_KEY = 'lulynx.copilot.session'

function CopilotTool({ config, onClose }: { config: Record<string, unknown>; onClose: () => void }) {
  const [goals, setGoals] = useState({ loss: '', validation_loss: '', l2_norm: '' })
  const [budget, setBudget] = useState({ maxTrials: '6', stepsPerTrial: '100', maxTotal: '2000', gpuHours: '0', keepSnapshots: '10' })
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ learning_rate: true, network_dim: true, network_alpha: true, min_snr_gamma: true })
  const [steps, setSteps] = useState<Record<string, string>>({ learning_rate: '2.0', network_dim: '8', network_alpha: '2.0', min_snr_gamma: '1' })
  const [dryRun, setDryRun] = useState(true)
  const [sessionId, setSessionId] = useState(() => {
    try { return window.localStorage.getItem(COPILOT_SESSION_KEY) || '' } catch { return '' }
  })
  const [session, setSession] = useState<Record<string, unknown> | null>(null)
  const [jobStatus, setJobStatus] = useState('')
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const remember = (id: string) => {
    setSessionId(id)
    try { window.localStorage.setItem(COPILOT_SESSION_KEY, id) } catch { /* ignore */ }
  }

  const poll = async (id: string) => {
    try {
      const status = unwrap<Record<string, unknown>>(await companionToolsApi.copilotStatus(id))
      setSession((status.session as Record<string, unknown> | undefined) ?? null)
      setJobStatus(String(status.job_status ?? ''))
      const snap = unwrap<{ snapshots?: Record<string, unknown>[] }>(await companionToolsApi.copilotSnapshots(id))
      setSnapshots(snap.snapshots ?? [])
    } catch (error) {
      setMessage(errorText(error))
    }
  }

  useEffect(() => {
    if (!sessionId.trim()) return
    let cancelled = false
    const tick = () => { if (!cancelled) void poll(sessionId.trim()) }
    tick()
    const timer = window.setInterval(tick, 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [sessionId])

  const buildPayload = () => {
    const goalValues = {
      loss: goals.loss ? Number(goals.loss) : null,
      validation_loss: goals.validation_loss ? Number(goals.validation_loss) : null,
      l2_norm: goals.l2_norm ? Number(goals.l2_norm) : null,
    }
    if (Object.values(goalValues).every((value) => value == null)) {
      throw new Error('至少填写一个目标值（Loss / 验证 Loss / L2）')
    }
    const searchSpace = COPILOT_TUNABLES
      .filter((t) => enabled[t.name])
      .map((t) => ({ name: t.name, enabled: true, step: Number(steps[t.name]) || Number(t.step) }))
    if (!searchSpace.length) throw new Error('至少选择一个可调参数')
    return {
      base_config: { ...config },
      goals: goalValues,
      budget: {
        max_trials: Number(budget.maxTrials) || 6,
        steps_per_trial: Number(budget.stepsPerTrial) || 100,
        max_total_steps: Number(budget.maxTotal) || 2000,
        max_gpu_hours: Number(budget.gpuHours) || 0,
      },
      retention: {
        keep_snapshots: Number(budget.keepSnapshots) || 10,
        protect_best: true,
        purge_on_finish: false,
      },
      search_space: searchSpace,
      search_strategy: 'adaptive',
      search_seed: 0,
      start_policy: 'warm_start',
      execution_profile_id: String(config.execution_profile_id || config.__execution_profile_id || ''),
      attention_backend: String(config.attention_backend || 'auto'),
      schema_id: String(config.__schema_id || config.schema_id || ''),
      dry_run: dryRun,
    }
  }

  const start = async () => {
    let payload: Record<string, unknown>
    try {
      payload = buildPayload()
    } catch (error) {
      setMessage(errorText(error))
      return
    }
    if (!dryRun && !window.confirm('这会授权 Copilot 自动启动真实训练 trial。确认继续？')) return
    setBusy(true)
    setMessage('')
    try {
      const data = unwrap<{ session_id?: string; job_id?: string }>(await companionToolsApi.startCopilot(payload))
      const id = String(data.session_id ?? '')
      if (!id) throw new Error('后端未返回 session_id')
      remember(id)
      setJobStatus(String(data.job_id ?? ''))
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const resume = async () => {
    if (!sessionId.trim()) return
    setBusy(true)
    try {
      const data = unwrap<{ session_id?: string; job_id?: string }>(await companionToolsApi.resumeCopilot(sessionId.trim()))
      remember(String(data.session_id ?? sessionId.trim()))
      setJobStatus(String(data.job_id ?? ''))
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    if (!sessionId.trim()) return
    setBusy(true)
    try {
      await companionToolsApi.stopCopilot(sessionId.trim())
      await poll(sessionId.trim())
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteSnapshot = async (trialIndex: number) => {
    if (!sessionId.trim()) return
    try {
      await companionToolsApi.deleteCopilotSnapshot(sessionId.trim(), trialIndex)
      await poll(sessionId.trim())
    } catch (error) {
      setMessage(errorText(error))
    }
  }

  const phase = String(session?.phase ?? '')
  const verdict = String(session?.verdict ?? '')
  const best = session?.best_trial_index
  const terminal = ['done', 'stopped', 'failed'].includes(String(session?.status ?? '').toLowerCase())

  return (
    <Modal open title="自动训练 Copilot" onClose={onClose} width={820} busy={busy}>
      <p className="lx-field-desc">一次授权后按目标阈值和预算自动跑 trial；默认 dry-run。真实训练还需要后端 `LULYNX_COPILOT_ENABLED=1`。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
        <label className="lx-field"><span className="lx-field-label">Loss 目标</span><Input value={goals.loss} onChange={(e) => setGoals({ ...goals, loss: e.target.value })} /></label>
        <label className="lx-field"><span className="lx-field-label">验证 Loss 目标</span><Input value={goals.validation_loss} onChange={(e) => setGoals({ ...goals, validation_loss: e.target.value })} /></label>
        <label className="lx-field"><span className="lx-field-label">L2 目标</span><Input value={goals.l2_norm} onChange={(e) => setGoals({ ...goals, l2_norm: e.target.value })} /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 10 }}>
        <label className="lx-field"><span className="lx-field-label">最大 trial</span><Input value={budget.maxTrials} onChange={(e) => setBudget({ ...budget, maxTrials: e.target.value })} /></label>
        <label className="lx-field"><span className="lx-field-label">每 trial 步数</span><Input value={budget.stepsPerTrial} onChange={(e) => setBudget({ ...budget, stepsPerTrial: e.target.value })} /></label>
        <label className="lx-field"><span className="lx-field-label">总步数上限</span><Input value={budget.maxTotal} onChange={(e) => setBudget({ ...budget, maxTotal: e.target.value })} /></label>
        <label className="lx-field"><span className="lx-field-label">GPU 小时</span><Input value={budget.gpuHours} onChange={(e) => setBudget({ ...budget, gpuHours: e.target.value })} /></label>
        <label className="lx-field"><span className="lx-field-label">保留快照</span><Input value={budget.keepSnapshots} onChange={(e) => setBudget({ ...budget, keepSnapshots: e.target.value })} /></label>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="lx-field-label">搜索空间</span>
        {COPILOT_TUNABLES.map((t) => (
          <label key={t.name} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={enabled[t.name]} onChange={(e) => setEnabled({ ...enabled, [t.name]: e.target.checked })} />
            {t.label}
            <Input style={{ width: 58 }} value={steps[t.name]} onChange={(e) => setSteps({ ...steps, [t.name]: e.target.value })} />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          dry-run（不启动真实训练）
        </label>
        <Button variant="primary" disabled={busy} onClick={() => void start()}>启动 Copilot</Button>
        <Button disabled={busy || !sessionId.trim()} onClick={() => void resume()}>恢复会话</Button>
        <Button variant="danger" disabled={busy || !sessionId.trim() || terminal} onClick={() => void stop()}>停止</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <Input value={sessionId} onChange={(e) => remember(e.target.value)} placeholder="Copilot session ID" />
        {phase ? <Badge tone="accent">{phase}</Badge> : null}
        {verdict ? <Badge tone={verdict === 'goal_met' ? 'ok' : verdict === 'off_track' || verdict === 'no_search_space' ? 'danger' : 'warn'}>{verdict}</Badge> : null}
        {jobStatus ? <Badge tone="accent">job {jobStatus}</Badge> : null}
        {best != null ? <Badge tone="ok">best #{String(best)}</Badge> : null}
      </div>
      {message ? <p style={{ color: 'var(--lx-danger)', marginTop: 8 }}>{message}</p> : null}
      {session?.message ? <p className="lx-field-desc" style={{ marginTop: 8 }}>{String(session.message)}</p> : null}
      <div style={{ marginTop: 12 }}>
        <strong>快照 / 报告</strong>
        {snapshots.length === 0 ? <p className="lx-field-desc">暂无快照。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {snapshots.map((snap) => {
              const trialIndex = Number(snap.trial_index)
              return (
                <div key={String(snap.trial_index)} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span>trial #{String(snap.trial_index)}</span>
                  <span>{String(snap.status ?? '')}</span>
                  <span>score {String(snap.score ?? '—')}</span>
                  {snap.goal_met ? <Badge tone="ok">goal met</Badge> : null}
                  <Button size="sm" onClick={() => window.open(companionToolsApi.copilotReportUrl(sessionId, trialIndex), '_blank', 'noopener,noreferrer')}>报告</Button>
                  <Button size="sm" variant="danger" onClick={() => void deleteSnapshot(trialIndex)}>删除</Button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <JsonBlock value={session} />
    </Modal>
  )
}

export function CompanionToolHost() {
  const tool = useCompanionToolStore((s) => s.tool)
  const config = useCompanionToolStore((s) => s.config)
  const close = useCompanionToolStore((s) => s.close)
  if (tool === 'fim_scan') return <FimScanTool config={config} onClose={close} />
  if (tool === 'lora_meta') return <LoraMetaTool onClose={close} />
  if (tool === 'goal_forecast') return <GoalForecastTool config={config} onClose={close} />
  if (tool === 'copilot') return <CopilotTool config={config} onClose={close} />
  return null
}
