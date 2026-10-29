// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { postJson, request } from './transport'

export interface JobStatus {
  id: string
  status: string
  progress?: number
  error?: string | null
  metadata?: Record<string, unknown>
  result?: unknown
}

export const companionToolsApi = {
  startFimScan: (config: Record<string, unknown>) =>
    postJson<{ job_id?: string; jobId?: string }>('/api/system/fim-scan', { config }),

  jobStatus: (jobId: string) =>
    request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`),

  readLoraMetadata: (path: string) =>
    postJson<Record<string, unknown>>('/api/read_lora_metadata', { path }),

  goalForecast: (
    runId: string,
    values: {
      lossTarget?: number
      validationLossTarget?: number
      l2Target?: number
      totalSteps?: number
    },
  ) => {
    const params = new URLSearchParams()
    if (values.lossTarget != null) params.set('loss_target', String(values.lossTarget))
    if (values.validationLossTarget != null) params.set('validation_loss_target', String(values.validationLossTarget))
    if (values.l2Target != null) params.set('l2_target', String(values.l2Target))
    if (values.totalSteps != null) params.set('total_steps', String(values.totalSteps))
    const qs = params.toString()
    return request<Record<string, unknown>>(
      `/api/system/goal-forecast/${encodeURIComponent(runId)}${qs ? `?${qs}` : ''}`,
    )
  },

  startCopilot: (payload: Record<string, unknown>) =>
    postJson<{ session_id?: string; job_id?: string }>('/api/system/copilot/start', payload),

  resumeCopilot: (sessionId: string) =>
    postJson<{ session_id?: string; job_id?: string }>(
      `/api/system/copilot/resume/${encodeURIComponent(sessionId)}`,
      {},
    ),

  copilotStatus: (sessionId: string) =>
    request<Record<string, unknown>>(
      `/api/system/copilot/status/${encodeURIComponent(sessionId)}`,
    ),

  stopCopilot: (sessionId: string) =>
    postJson<Record<string, unknown>>(
      `/api/system/copilot/stop/${encodeURIComponent(sessionId)}`,
      {},
    ),

  copilotSnapshots: (sessionId: string) =>
    request<{ snapshots?: Record<string, unknown>[] }>(
      `/api/system/copilot/snapshots/${encodeURIComponent(sessionId)}`,
    ),

  copilotReportUrl: (sessionId: string, trialIndex: number) =>
    `/api/system/copilot/report/${encodeURIComponent(sessionId)}/${encodeURIComponent(String(trialIndex))}`,

  deleteCopilotSnapshot: (sessionId: string, trialIndex: number) =>
    request<Record<string, unknown>>(
      `/api/system/copilot/snapshots/${encodeURIComponent(sessionId)}/${encodeURIComponent(String(trialIndex))}`,
      { method: 'DELETE' },
    ),
}
