// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { ApiError, postJson, request, unwrap } from './transport'
import type { CheckpointSaveReport } from '@/lib/runOutcomeNotices'

/* 监控域 API:canonical /train/* 遥测 + /api 硬件状态 */

export interface RunStatePayload {
  run_id?: string
  status?: string
  current_step?: number
  total_steps?: number
  current_epoch?: number
  total_epochs?: number
  last_loss?: number
  last_lr?: number
  error?: string
  model_type?: string
  training_type?: string
  config_name?: string
  execution_profile_id?: string
  resolved_attention_backend?: string
  effective_execution_core?: string
  turbocore_fallback_reason?: string
  checkpoint_save_report?: CheckpointSaveReport
  [extra: string]: unknown
}

export interface ActivePayload {
  runs?: RunStatePayload[]
  queued_runs?: Record<string, unknown>[]
  current_run_id?: string | null
  queue_depth?: number
}

export interface LogPayload {
  lines?: string[]
  offset?: number
  has_more?: boolean
  status?: string
  error?: string
}

export interface ChartPayload {
  points?: { step: number; value: number }[]
  series?: string
}

export interface TrainingPreviewItem {
  name: string
  size: number
  mtime: number
  step: number
  epoch: number
  sample: number
  timestamp: number
}

export interface TrainingPreviewRequest {
  request_id: string
  status: string
  error?: string
  artifacts?: string[]
}

export interface TrainingPreviewPayload {
  task_id: string
  resolved_run_id: string
  status: string
  items: TrainingPreviewItem[]
  cursor: number
  next_cursor: number
  has_more: boolean
  total: number
  sort: string
  preview_request?: TrainingPreviewRequest | null
  pending_cpu_previews?: number
}

export interface QualityTrend {
  status?: string
  direction?: string
  point_count?: number
  start?: number | null
  end?: number | null
  relative_change?: number | null
  slope_per_step?: number | null
}

export interface RewardComponent {
  name?: string
  status?: string
  direction?: string
  weight?: number
  checkpoint_value?: number | null
  base_value?: number | null
  delta?: number | null
  score?: number | null
  confidence?: number | null
  sample_count?: number
  failure_reason?: string
}

export interface RewardEvaluation {
  status?: string
  suite?: {
    suite_id?: string
    fingerprint?: string
    case_count?: number
    stages?: string[]
    baseline_mode?: string
  }
  total?: {
    status?: string
    score?: number | null
    base_score?: number | null
    delta?: number | null
    missing_metrics?: string[]
    failure_reason?: string
  }
  components?: RewardComponent[]
  multi_objective_conflicts?: { code?: string; severity?: string; message?: string }[]
  trends?: { total?: QualityTrend; components?: Record<string, QualityTrend> }
}

export interface TrainingQualityReportPayload {
  schema_id?: string
  schema_version?: number
  generated_at?: string
  run_id?: string
  run_status?: string
  status?: string
  coverage?: Record<string, boolean>
  latest?: Record<string, number | null>
  trends?: Record<string, QualityTrend>
  regions?: {
    status?: string
    loss?: Record<string, number>
    loss_ratio?: Record<string, number>
    gradient_norm?: Record<string, number>
    gradient_dominance?: string
  }
  health?: {
    status?: string
    nan_inf_detected?: boolean
    loss_behavior?: string
    gradient_behavior?: string
    adapter_weight_growth?: string
    region_gradient_dominance?: string
    background_pollution_risk?: string
    seed_stability?: string
    alerts?: { code?: string; severity?: string; message?: string }[]
  }
  reward_evaluation?: RewardEvaluation
  visual_evaluation?: {
    status?: string
    metrics?: Record<string, unknown>
    missing_dependencies?: string[]
    source?: string
    non_finite_removed?: boolean
    error?: string
  }
  limitations?: string[]
}

export interface GpuInfo {
  index?: number
  name?: string
  total_mb?: number
  used_mb?: number
  utilization_pct?: number
  utilization?: number
  temperature?: number
  temperature_c?: number
  [extra: string]: unknown
}

export interface SystemMonitorPayload {
  gpu?: { available?: boolean; gpus?: GpuInfo[] }
  cpu?: { percent?: number; count?: number }
  ram?: { total_gb?: number; used_gb?: number; percent?: number }
}

export const monitorApi = {
  requestPreview: async (taskId: string, signal: AbortSignal) =>
    unwrap<TrainingPreviewRequest>(await request(`/api/task_preview/${encodeURIComponent(taskId)}`, {
      method: 'POST', signal, credentials: 'include',
    })),
  active: () => request<ActivePayload>('/train/active'),
  status: (runId: string) => request<RunStatePayload>(`/train/status/${encodeURIComponent(runId)}`),
  log: (runId: string, offset: number, maxLines = 500) =>
    request<LogPayload>(`/train/log/${encodeURIComponent(runId)}?offset=${offset}&max_lines=${maxLines}`),
  chartSeries: (runId: string, series: 'loss' | 'lr', lastN = 400) =>
    request<ChartPayload>(`/train/chart-series/${encodeURIComponent(runId)}?series=${series}&last_n=${lastN}`),
  qualityReport: (runId: string, signal?: AbortSignal) =>
    request<TrainingQualityReportPayload>(
      `/train/runs/${encodeURIComponent(runId)}/quality-report`,
      signal ? { signal } : {},
    ),
  previews: async (taskId: string, cursor = 0, limit = 24, signal?: AbortSignal) =>
    unwrap<TrainingPreviewPayload>(await request(
      `/api/task_preview/${encodeURIComponent(taskId)}?cursor=${cursor}&limit=${limit}`,
      { signal, credentials: 'include' },
    )),
  previewFileUrl: (taskId: string, name: string, mtime: number) =>
    `/api/task_preview/${encodeURIComponent(taskId)}/file?name=${encodeURIComponent(name)}&v=${encodeURIComponent(String(mtime))}`,
  previewImage: async (taskId: string, name: string, mtime: number, signal: AbortSignal) => {
    // Use the same fetch transport as JSON requests: the host bridge can resolve
    // the backend origin and attach auth headers. A native <img src="/api/...">
    // bypasses that bridge; render a local blob URL instead, never a query token.
    const response = await fetch(monitorApi.previewFileUrl(taskId, name, mtime), {
      signal, credentials: 'include',
    })
    if (!response.ok) throw new ApiError('Preview image unavailable', response.status)
    return response.blob()
  },
  stop: () => postJson('/train/stop', {}),
  // 没有 gpuStatus:/api/gpu_status 的 gpu 部分与 /api/system_monitor 逐字段相同,
  // 留一个零调用的别名只会让人以为有第二条轮询面。显卡表走 /api/graphic_cards。
  systemMonitor: () => request('/api/system_monitor'),
}
