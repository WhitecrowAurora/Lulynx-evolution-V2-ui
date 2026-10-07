// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useState } from 'react'
import { monitorApi, type TrainingPreviewItem, type TrainingPreviewPayload } from '@/api/monitorApi'
import { ApiError } from '@/api/transport'
import { Panel } from '@/components/layout'
import { Button } from '@/components/primitives'
import { useI18n } from '@/i18n/useI18n'
import { ManualPreviewButton } from './ManualPreviewButton'

const PAGE_SIZE = 24
const POLL_MS = 5000
const TERMINAL = new Set([
  'completed', 'finished', 'succeeded', 'failed', 'orphaned', 'stopped',
  'terminated', 'cancelled', 'canceled', 'error',
])

function isTerminal(status: string) {
  return TERMINAL.has(status.trim().toLowerCase())
}

function PreviewImage({ item, taskId, unavailable }: {
  item: TrainingPreviewItem; taskId: string; unavailable: string
}) {
  const [failed, setFailed] = useState(false)
  const [url, setUrl] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let ownedUrl = ''
    setFailed(false)
    setUrl('')
    void monitorApi.previewImage(taskId, item.name, item.mtime, controller.signal)
      .then(blob => {
        if (controller.signal.aborted) return
        ownedUrl = URL.createObjectURL(blob)
        setUrl(ownedUrl)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => {
      controller.abort()
      if (ownedUrl) URL.revokeObjectURL(ownedUrl)
    }
  }, [taskId, item.name, item.mtime])
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <a href={url || undefined} target="_blank" rel="noreferrer" aria-label={item.name}>
        {failed ? (
          <span role="status" style={{ display: 'block', padding: 24 }}>{unavailable}</span>
        ) : url ? (
          <img src={url} alt={item.name} loading="lazy" decoding="async"
            onError={() => setFailed(true)}
            style={{ width: '100%', height: 220, objectFit: 'contain', background: 'var(--lx-bg)' }} />
        ) : <span role="status" style={{ display: 'block', height: 220 }}>…</span>}
      </a>
      <figcaption style={{ padding: '8px 0', overflowWrap: 'anywhere', fontSize: 11 }}>
        <div>{item.name}</div>
        <small style={{ color: 'var(--lx-dim)' }}>
          {item.step >= 0 ? `STEP ${item.step} ` : ''}
          {item.epoch >= 0 ? `EPOCH ${item.epoch} ` : ''}
          {item.sample >= 0 ? `SAMPLE ${item.sample}` : ''}
        </small>
      </figcaption>
    </figure>
  )
}

export function TrainingPreviewPanel({ taskId, runStatus }: { taskId: string; runStatus: string }) {
  const { language } = useI18n()
  const en = language === 'en'
  const [cursor, setCursor] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState<{
    taskId: string; cursor: number; payload: TrainingPreviewPayload
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const payload = taskId.trim() && page?.taskId === taskId && page.cursor === cursor ? page.payload : null

  useEffect(() => {
    if (!taskId.trim()) {
      setPage(null)
      setBusy(false)
      setMissing(false)
      setError('')
      return
    }
    const controller = new AbortController()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setMissing(false)
    setError('')

    const load = async () => {
      if (disposed) return
      setBusy(true)
      let terminal = isTerminal(runStatus)
      try {
        const result = await monitorApi.previews(taskId, cursor, PAGE_SIZE, controller.signal)
        if (disposed || controller.signal.aborted) return
        terminal ||= isTerminal(result.status)
        if ((result.pending_cpu_previews ?? 0) > 0) terminal = false
        setPage({ taskId, cursor, payload: result })
        setMissing(false)
        setError('')
      } catch (cause) {
        if (disposed || controller.signal.aborted) return
        const notFound = cause instanceof ApiError && cause.status === 404
        setMissing(notFound)
        setError(notFound ? '' : cause instanceof Error ? cause.message : String(cause))
        if (notFound) setPage(null)
      } finally {
        if (!disposed) {
          setBusy(false)
          // Schedule after the request settles: never overlap polling requests.
          if (!terminal) timer = setTimeout(() => { void load() }, POLL_MS)
        }
      }
    }
    void load()
    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [taskId, runStatus, cursor, refresh])

  const items = payload?.items ?? []
  return (
    <Panel title={en ? 'Training previews' : '训练预览'} idx="PV" panelId="OUTPUT.PREVIEW"
      className="lx-cfg-section"
      right={<><ManualPreviewButton taskId={taskId} status={payload?.status || runStatus}
        result={payload?.preview_request} en={en} onRequested={() => setRefresh(n => n + 1)} />
      <Button size="sm" disabled={busy || !taskId.trim()} onClick={() => setRefresh(n => n + 1)}>
        {en ? 'Refresh' : '刷新'}
      </Button></>}>
      {error ? <p role="alert">{en ? 'Preview request failed: ' : '预览读取失败：'}{error}</p> : null}
      {missing ? <p role="status">{en ? 'Previews are not available for this run yet.' : '该训练记录暂未提供预览。'}</p> : null}
      {!missing && !items.length ? (
        <p role="status" style={{ color: 'var(--lx-dim)', padding: '20px 0' }}>
          {!taskId.trim() ? (en ? 'Select a training run to view previews.' : '请选择训练记录以查看预览。')
            : busy ? (en ? 'Loading previews…' : '正在加载预览…')
            : (en ? 'No preview images yet.' : '暂无预览图片。')}
        </p>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
        {items.map(item => <PreviewImage key={`${taskId}:${item.name}:${item.mtime}:${refresh}`}
          item={item} taskId={taskId} unavailable={en ? 'Image unavailable' : '图片暂不可用'} />)}
      </div>
      {payload ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Button size="sm" disabled={busy || cursor === 0} onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}>
            {en ? 'Previous' : '上一页'}
          </Button>
          <span style={{ color: 'var(--lx-dim)', fontSize: 11 }}>
            {payload.total ? cursor + 1 : 0}–{cursor + items.length} / {payload.total}
          </span>
          <Button size="sm" disabled={busy || !payload.has_more} onClick={() => setCursor(payload.next_cursor)}>
            {en ? 'Next' : '下一页'}
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}
