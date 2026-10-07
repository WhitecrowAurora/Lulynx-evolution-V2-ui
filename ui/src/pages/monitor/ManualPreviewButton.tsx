import { useEffect, useRef, useState } from 'react'
import { monitorApi, type TrainingPreviewRequest } from '@/api/monitorApi'
import { Button } from '@/components/primitives'

export function ManualPreviewButton({ taskId, status, result, en, onRequested }: {
  taskId: string; status: string; result?: TrainingPreviewRequest | null
  en: boolean; onRequested: () => void
}) {
  const controller = useRef<AbortController | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState<TrainingPreviewRequest | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setSent(null)
    setError('')
    setSubmitting(false)
    return () => controller.current?.abort()
  }, [taskId])
  const latest = sent && result?.request_id !== sent.request_id ? sent : result
  const rendering = latest?.status === 'scheduled'
  const pending = latest?.status === 'pending' || latest?.status === 'running' || rendering
  async function submit() {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setSubmitting(true)
    setError('')
    try {
      const response = await monitorApi.requestPreview(taskId, request.signal)
      if (request.signal.aborted) return
      setSent(response)
      onRequested()
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!request.signal.aborted) setSubmitting(false)
    }
  }
  const active = ['training', 'running'].includes(status.trim().toLowerCase())
  return <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    <Button size="sm" disabled={!taskId.trim() || !active || submitting || pending} onClick={() => void submit()}>
      {rendering ? (en ? 'CPU rendering' : 'CPU 渲染中') : pending ? (en ? 'Preview queued' : '预览已排队') : (en ? 'Generate preview' : '生成预览')}
    </Button>
    {error || latest?.error ? <small role="alert">{error || latest?.error}</small> : null}
    {pending ? <small role="status">{rendering ? (en ? 'Rendering in the background.' : '正在后台渲染。') : (en ? 'Runs after the next training update.' : '将在训练更新完成后执行。')}</small> : null}
  </span>
}
