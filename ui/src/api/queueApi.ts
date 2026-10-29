// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { request } from './transport'
import type { ComparisonJob } from './comparisonApi'

/* 队列/任务域 API */

export interface TaskRecord {
  id?: string
  task_id?: string
  name?: string
  status?: string
  progress?: number
  type?: string
  error?: string | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  metadata?: Record<string, unknown>
  stages?: unknown[]
  queue_position?: number
  queue_message?: string
  [extra: string]: unknown
}

export interface QueueRun {
  run_id?: string
  config_name?: string
  status?: string
  queue_position?: number
  queue_message?: string
  queued_at?: string
  eta?: { available?: boolean; wait_seconds?: number; duration_seconds?: number; reason?: string }
  [extra: string]: unknown
}

export interface QueuePayload {
  revision: number
  current_run_id?: string
  current_status?: string
  queue_depth?: number
  queued_runs?: QueueRun[]
  [extra: string]: unknown
}

export const queueApi = {
  tasks: () => request<{ tasks?: TaskRecord[] }>('/api/tasks'),
  jobs: () => request<{ jobs?: ComparisonJob[] }>('/api/jobs'),
  workbench: () => request<QueuePayload>('/train/queue'),
  editContext: (runId: string) => request<{ revision: number; run_id: string; config: Record<string, unknown>; queue_item?: QueueRun }>(`/train/queue/${encodeURIComponent(runId)}/edit-context`),
  edit: (runId: string, revision: number, patch: Record<string, unknown>) =>
    request<QueuePayload>(`/train/queue/${encodeURIComponent(runId)}`, { method: 'PATCH', body: JSON.stringify({ revision, patch }) }),
  reorder: (revision: number, orderedRunIds: string[]) =>
    request<QueuePayload>('/train/queue/reorder', { method: 'POST', body: JSON.stringify({ revision, ordered_run_ids: orderedRunIds }) }),
  replay: (runId: string, replayKind: 'requeue' | 'rerun') =>
    request(`/train/queue/${encodeURIComponent(runId)}/replay`, { method: 'POST', body: JSON.stringify({ replay_kind: replayKind, request_id: `${replayKind}-${Date.now()}` }) }),
  pause: (runId: string) => request(`/train/queue/${encodeURIComponent(runId)}/pause`, { method: 'POST' }),
  resume: (runId: string) => request(`/train/queue/${encodeURIComponent(runId)}/resume`, { method: 'POST' }),
  terminate: (taskId: string) => request(`/api/tasks/terminate/${encodeURIComponent(taskId)}`, { method: 'POST' }),
  deleteTask: (taskId: string) => request(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  deleteAll: () => request('/api/tasks', { method: 'DELETE' }),
}
