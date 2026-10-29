// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { request } from './transport'

export interface ComparisonRequest {
  source_run_id: string
  candidates: { gpu_slots: number; prefetch_depth: number }[]
  warmup_steps: number
  measurement_steps: number
}
export interface ComparisonJob {
  id: string
  status: string
  progress?: number
  metadata?: { operation?: string; source_run_id?: string }
}
export const comparisonApi = {
  execution: (sourceId: string, executionId: string) => request<Record<string, unknown>>(
    `/train/runs/${encodeURIComponent(sourceId)}/comparison-executions/${encodeURIComponent(executionId)}`),
  report: (anchorId: string, reportId: string, currentRunId?: string) => request<Record<string, unknown>>(
    `/train/runs/${encodeURIComponent(anchorId)}/comparison-reports/${encodeURIComponent(reportId)}${currentRunId ? `?current_run_id=${encodeURIComponent(currentRunId)}` : ''}`),
  cancel: (jobId: string) => request(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
}
