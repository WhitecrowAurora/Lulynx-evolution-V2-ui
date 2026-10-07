// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0

export interface CheckpointSaveReport {
  completion_status?: string
  errors?: string[]
  warnings?: string[]
  adapter_saved?: boolean
  adapter_path?: string | null
  resume_capability?: string
}

export interface RunOutcomeNotice {
  kind: 'info' | 'warning' | 'error'
  title: string
  messages: string[]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

/** Present the backend's resolved outcome; training and artifact status stay independent. */
export function buildRunOutcomeNotices(value: unknown): RunOutcomeNotice[] {
  const run = record(value)
  const notices: RunOutcomeNotice[] = []
  const core = text(run.effective_execution_core)
  const fallback = text(run.turbocore_fallback_reason)
  if (core || fallback) {
    const coreLabel = ({ standard: '标准训练核心', turbo: 'TurboCore' } as Record<string, string>)[core] || core
    const messages = coreLabel ? [`实际执行：${coreLabel}`] : []
    if (fallback) messages.push(`TurboCore 回退原因：${fallback === 'turbocore_disabled' ? 'TurboCore 总开关已关闭' : fallback}`)
    notices.push({ kind: fallback ? 'warning' : 'info', title: '执行结果', messages })
  }
  const report = record(run.checkpoint_save_report)
  const status = text(report.completion_status)
  const errors = strings(report.errors)
  const warnings = strings(report.warnings)
  if (status === 'failed' || status === 'completed_with_warning' || errors.length || warnings.length) {
    const messages = [...new Set([...errors, ...warnings])]
    if (report.adapter_saved === true) messages.unshift('训练权重已保存。请查看下方保存或导出提示。')
    if (!messages.length) messages.push('请检查保存结果与训练日志。')
    notices.push({ kind: status === 'failed' ? 'error' : 'warning', title: '保存结果需要注意', messages })
  }
  return notices
}

export function runOutcomeStatus(value: unknown): string {
  const run = record(value)
  const status = text(run.status) || 'unknown'
  if (status.toLowerCase() === 'completed'
    && buildRunOutcomeNotices(run).some((notice) => notice.kind !== 'info')) {
    return 'completed_with_warning'
  }
  return status
}
