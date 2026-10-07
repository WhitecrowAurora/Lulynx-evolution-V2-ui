// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePageEntrance } from '@/motion/useEntrance'
import { PageHead, Panel } from '@/components/layout'
import { Badge, Bar, Button, Dot, Empty } from '@/components/primitives'
import { Modal } from '@/components/overlay'
import { queueApi, type QueuePayload, type QueueRun, type TaskRecord } from '@/api/queueApi'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { applyConfigBag, extractRunRestorable } from '@/lib/applyConfigBag'
import {
  findRunRecord,
  hydrateRunHistoryFromDisk,
  type RunRecord,
} from '@/stores/historyStore'
import { useRouteStore } from '@/stores/routeStore'
import { toast } from '@/stores/toastStore'
import './queue.css'
import { useI18n } from '@/i18n/useI18n'

/* 队列/历史页:/api/tasks 聚合列表 + 终止/删除 + 本地历史参数复制 */

type Filter = 'all' | 'running' | 'completed' | 'failed'

const RUNNING_SET = new Set(['RUNNING', 'PENDING', 'QUEUED', 'STARTING'])

function statusTone(status: string): 'ok' | 'accent' | 'warn' | 'danger' | undefined {
  const s = status.toUpperCase()
  if (s === 'RUNNING') return 'ok'
  if (s === 'COMPLETED' || s === 'FINISHED') return 'accent'
  if (s === 'FAILED' || s === 'ERROR' || s === 'ORPHANED') return 'danger'
  if (s) return 'warn'
  return undefined
}

function taskId(task: TaskRecord): string {
  return String(task.task_id ?? task.id ?? '')
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

function matchFilter(task: TaskRecord, f: Filter): boolean {
  const s = String(task.status ?? '').toUpperCase()
  if (f === 'all') return true
  if (f === 'running') return RUNNING_SET.has(s)
  if (f === 'completed') return s === 'COMPLETED' || s === 'FINISHED'
  return s === 'FAILED' || s === 'ERROR' || s === 'ORPHANED'
}

const IMMUTABLE_QUEUE_FIELDS = new Set([
  'run_id', 'task_id', 'status', 'pid', 'launcher_pid', 'worker_pid', 'queued_at',
  'queue_position', 'queue_message', 'source_run_id', 'replay_kind', 'parent_run_id',
  'gpu_holder_id', 'process_create_time', 'runtime_owner', 'idempotency_key', 'ui_config_revision',
])

function queueRunId(run: QueueRun): string { return String(run.run_id ?? '') }

function QueueEditModal({ run, onClose, onSaved }: { run: QueueRun | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [revision, setRevision] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!run) return
    setRevision(null)
    setText('')
    let active = true
    void queueApi.editContext(queueRunId(run)).then((payload) => {
      if (!active) return
      setRevision(payload.revision)
      setText(JSON.stringify(payload.config ?? {}, null, 2))
    }).catch((error) => {
      if (active) toast.err((error as Error).message, t('queue.edit_fail'))
    })
    return () => { active = false }
  }, [run, t])

  const save = async () => {
    if (!run || revision == null) return
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch {
      toast.err(t('queue.edit_invalid_json'), t('queue.edit_fail'))
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.err(t('queue.edit_object_required'), t('queue.edit_fail'))
      return
    }
    const patch = Object.fromEntries(Object.entries(parsed).filter(([key]) => !IMMUTABLE_QUEUE_FIELDS.has(key)))
    setBusy(true)
    try {
      unwrap(await queueApi.edit(queueRunId(run), revision, patch))
      toast.info(t('queue.edit_saved'), 'QUEUE')
      onSaved()
      onClose()
    } catch (error) {
      toast.err((error as Error).message, t('queue.edit_fail'))
    } finally { setBusy(false) }
  }

  return (
    <Modal open={!!run} title={t('queue.edit_title', { id: run ? queueRunId(run) : '' })} onClose={onClose} width={720}>
      {run ? <>
        <p className="lx-queue-edit-note">{t('queue.edit_hint')}</p>
        <textarea className="lx-queue-config-editor" value={text} onChange={(event) => setText(event.target.value)} disabled={revision == null || busy} spellCheck={false} />
        <div className="lx-queue-modal-actions">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={revision == null || busy} onClick={() => void save()}>{busy ? t('common.loading') : t('common.save')}</Button>
        </div>
      </> : null}
    </Modal>
  )
}

function QueueWorkbenchPanel({ payload, onChanged }: { payload: QueuePayload | null; onChanged: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<QueueRun | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const queued = payload?.queued_runs ?? []
  const revision = Number(payload?.revision ?? 0)
  const currentId = String(payload?.current_run_id ?? '')
  const currentStatus = String(payload?.current_status ?? '').toLowerCase()

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= queued.length) return
    const ids = queued.map(queueRunId)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setBusy('reorder')
    try { unwrap(await queueApi.reorder(revision, ids)); onChanged() } catch (error) {
      toast.err((error as Error).message, t('queue.reorder_fail'))
    } finally { setBusy(null) }
  }

  const togglePause = async () => {
    if (!currentId) return
    setBusy('pause')
    try { unwrap(await (currentStatus === 'paused' ? queueApi.resume(currentId) : queueApi.pause(currentId))); onChanged() } catch (error) {
      toast.err((error as Error).message, t('queue.control_fail'))
    } finally { setBusy(null) }
  }

  return <>
    <Panel title={t('queue.workbench_title')} idx="00" panelId="QUEUE.WORKBENCH"
      right={currentId ? <Button size="sm" disabled={busy === 'pause'} onClick={() => void togglePause()}>{currentStatus === 'paused' ? t('queue.resume') : t('queue.pause')}</Button> : null}>
      {queued.length ? <ul className="lx-task-list">{queued.map((run, index) => {
        const id = queueRunId(run)
        const label = String(run.config_name ?? id)
        const eta = run.eta?.available ? `${Math.round(Number(run.eta.wait_seconds ?? 0))}s` : ''
        return <li className="lx-task-row lx-queue-workbench-row" key={id || index}>
          <span className="lx-queue-position">{index + 1}</span>
          <div className="lx-task-main"><b>{label}</b><span className="lx-num">{id} {eta ? `· ${t('queue.eta', { value: eta })}` : ''}</span>{run.queue_message ? <span>{String(run.queue_message)}</span> : null}</div>
          <div className="lx-queue-order-actions">
            <Button size="sm" disabled={busy === 'reorder' || index === 0} onClick={() => void move(index, -1)} aria-label={t('queue.move_up')}>↑</Button>
            <Button size="sm" disabled={busy === 'reorder' || index === queued.length - 1} onClick={() => void move(index, 1)} aria-label={t('queue.move_down')}>↓</Button>
          </div>
          <Button size="sm" disabled={busy != null} onClick={() => setEditing(run)}>{t('queue.edit')}</Button>
        </li>
      })}</ul> : <Empty title={t('queue.workbench_empty')} desc={t('queue.workbench_empty_desc')} />}
    </Panel>
    <QueueEditModal run={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
  </>
}

function TaskRow({ task, onDetail, onChanged }: {
  task: TaskRecord
  onDetail: (t: TaskRecord) => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  const id = taskId(task)
  const status = String(task.status ?? 'UNKNOWN').toUpperCase()
  const running = RUNNING_SET.has(status)
  const progress = Math.round(Number(task.progress ?? 0))
  const meta = task.metadata ?? {}
  const label = String(task.name ?? (meta as { config_name?: string }).config_name ?? id)

  const doTerminate = async () => {
    if (!window.confirm(t('queue.terminate_confirm', { label }))) return
    try {
      unwrap(await queueApi.terminate(id))
      toast.warn(t('queue.terminate_sent'), 'TERMINATE')
      onChanged()
    } catch (e) {
      toast.err((e as Error).message, t('queue.terminate_fail'))
    }
  }

  const doDelete = async () => {
    if (!window.confirm(t('queue.delete_confirm', { label }))) return
    try {
      unwrap(await queueApi.deleteTask(id))
      onChanged()
    } catch (e) {
      toast.err((e as Error).message, t('queue.delete_fail'))
    }
  }

  const doReplay = async () => {
    try {
      unwrap(await queueApi.replay(id, 'rerun'))
      toast.info(t('queue.replay_sent'), 'QUEUE')
      onChanged()
    } catch (e) {
      toast.err((e as Error).message, t('queue.replay_fail'))
    }
  }

  return (
    <li className="lx-task-row">
      <Dot tone={running ? 'ok' : statusTone(status) === 'danger' ? 'danger' : statusTone(status) === 'accent' ? 'accent' : 'idle'} pulse={running} />
      <div className="lx-task-main">
        <b>{label}</b>
        <span className="lx-num">
          {id || '--'} · {fmtTime(task.created_at)}
          {task.queue_position != null ? ` · ${t('queue.position', { n: task.queue_position })}` : ''}
        </span>
        {task.error ? <span className="lx-task-err">{String(task.error)}</span> : null}
      </div>
      {running && progress > 0 ? (
        <div className="lx-task-progress">
          <Bar value={progress} thin />
          <span className="lx-num">{progress}%</span>
        </div>
      ) : null}
      <Badge tone={statusTone(status)}>{status}</Badge>
      <div className="lx-task-actions">
        <Button size="sm" onClick={() => onDetail(task)}>{t('common.detail')}</Button>
        {running ? (
          <Button size="sm" variant="danger" onClick={() => void doTerminate()}>{t('queue.terminate')}</Button>
        ) : (
          <>
            {(status === 'COMPLETED' || status === 'FINISHED' || status === 'FAILED' || status === 'ERROR') ? <Button size="sm" onClick={() => void doReplay()}>{t('queue.replay')}</Button> : null}
            <Button size="sm" variant="danger" onClick={() => void doDelete()}>{t('common.delete')}</Button>
          </>
        )}
      </div>
    </li>
  )
}

function DetailModal({ task, onClose }: { task: TaskRecord | null; onClose: () => void }) {
  const { t } = useI18n()
  const navigate = useRouteStore((s) => s.navigate)
  const [busy, setBusy] = useState(false)
  const record: RunRecord | undefined = useMemo(() => {
    if (!task) return undefined
    return findRunRecord(taskId(task), String(task.name ?? ''))
  }, [task])

  const copyParams = async () => {
    if (!task) return
    setBusy(true)
    try {
      if (record?.config && Object.keys(record.config).length) {
        applyConfigBag({
          ok: true,
          typeId: record.typeId,
          schemaId: record.typeId,
          config: record.config,
          runId: record.id,
          name: record.name,
          source: 'history',
        })
        onClose()
        navigate('train')
        return
      }
      const id = taskId(task)
      if (!id) {
        toast.warn(t('queue.no_task_id'), 'PARAMS')
        return
      }
      const resp = await trainApi.runRestorableConfig(id)
      const bag = extractRunRestorable(resp, id)
      if (!applyConfigBag(bag)) return
      onClose()
      navigate('train')
    } catch (e) {
      toast.err((e as Error).message, 'PARAMS')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!task} title={t('queue.detail_title', { id: task ? String(task.name ?? taskId(task)) : '' })} onClose={onClose} width={640}>
      {task ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void copyParams()}>
              {busy
                ? t('common.loading')
                : record
                  ? t('queue.copy_params', { type: record.typeId })
                  : t('queue.backfill')}
            </Button>
            {!record ? (
              <p style={{ color: 'var(--lx-dim)', fontSize: 12, marginTop: 8 }}>
                {t('queue.no_local_snapshot')}
              </p>
            ) : null}
          </div>
          <pre className="lx-log" style={{ maxHeight: 380 }}>{JSON.stringify(task, null, 2)}</pre>
        </>
      ) : null}
    </Modal>
  )
}

export default function QueuePage() {
  const ref = usePageEntrance()
  const { t } = useI18n()
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [detail, setDetail] = useState<TaskRecord | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [workbench, setWorkbench] = useState<QueuePayload | null>(null)
  const refreshState = useRef({
    generation: 0,
    tasksInFlight: false,
    tasksQueued: false,
    workbenchInFlight: false,
    workbenchQueued: false,
    disposed: false,
  })

  useEffect(() => {
    void hydrateRunHistoryFromDisk()
  }, [])

  const refresh = async (invalidate = false) => {
    const state = refreshState.current
    if (state.disposed) return
    if (invalidate) state.generation += 1
    const generation = state.generation
    if (state.tasksInFlight) {
      state.tasksQueued = true
      return
    }
    state.tasksInFlight = true
    try {
      const data = unwrap<{ tasks?: TaskRecord[] }>(await queueApi.tasks())
      const list = [...(data?.tasks ?? [])]
      list.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
      if (state.disposed || generation !== state.generation) return
      setTasks(list)
    } catch {
      /* 后端未起,顶栏已示警 */
    } finally {
      state.tasksInFlight = false
      if (state.tasksQueued && !state.disposed) {
        state.tasksQueued = false
        void refresh()
      } else if (!state.disposed && generation === state.generation) {
        setLoaded(true)
      }
    }
  }

  const refreshWorkbench = async () => {
    const state = refreshState.current
    if (state.disposed) return
    const generation = state.generation
    if (state.workbenchInFlight) {
      state.workbenchQueued = true
      return
    }
    state.workbenchInFlight = true
    try {
      const payload = unwrap<QueuePayload>(await queueApi.workbench())
      if (state.disposed || generation !== state.generation) return
      setWorkbench(payload)
    } catch {
      if (!state.disposed && generation === state.generation) setWorkbench(null)
    } finally {
      state.workbenchInFlight = false
      if (state.workbenchQueued && !state.disposed) {
        state.workbenchQueued = false
        void refreshWorkbench()
      }
    }
  }

  useEffect(() => {
    void refresh()
    void refreshWorkbench()
    const t = window.setInterval(() => { void refresh(); void refreshWorkbench() }, 8000)
    return () => {
      window.clearInterval(t)
      const state = refreshState.current
      state.disposed = true
      state.generation += 1
      state.tasksQueued = false
      state.workbenchQueued = false
    }
  }, [])

  const refreshAll = () => { void refresh(true); void refreshWorkbench() }

  const doClear = async () => {
    if (!window.confirm(t('queue.clear_confirm'))) return
    try {
      unwrap(await queueApi.deleteAll())
      toast.info(t('queue.cleared'), 'CLEARED')
      refreshAll()
    } catch (e) {
      toast.err((e as Error).message, t('queue.clear_fail'))
    }
  }

  const shown = tasks.filter((t) => matchFilter(t, filter))
  const counts: Record<Filter, number> = {
    all: tasks.length,
    running: tasks.filter((t) => matchFilter(t, 'running')).length,
    completed: tasks.filter((t) => matchFilter(t, 'completed')).length,
    failed: tasks.filter((t) => matchFilter(t, 'failed')).length,
  }
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: t('common.all') },
    { id: 'running', label: t('common.running_queued') },
    { id: 'completed', label: t('common.completed') },
    { id: 'failed', label: t('common.failed') },
  ]

  return (
    <div ref={ref}>
      <PageHead
        idx="03 — QUEUE"
        tag="MISSION ARCHIVE"
        lines={[{ text: 'QUEUE &' }, { text: 'HISTORY_', outline: true }]}
        sub={t('queue.sub', { running: counts.running, total: tasks.length })}
      />

      <QueueWorkbenchPanel payload={workbench} onChanged={refreshAll} />

      <Panel
        title={t('queue.records_title')}
        idx="01"
        panelId="TASKS.ARCHIVE"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={['lx-filter-btn', filter === f.id ? 'on' : ''].filter(Boolean).join(' ')}
                onClick={() => setFilter(f.id)}
              >
                {f.label} <i>{counts[f.id]}</i>
              </button>
            ))}
            <Button size="sm" onClick={() => void doClear()}>{t('queue.clear_records')}</Button>
          </div>
        }
      >
        {shown.length ? (
          <ul className="lx-task-list">
            {shown.map((t, i) => (
              <TaskRow key={taskId(t) || i} task={t} onDetail={setDetail} onChanged={refreshAll} />
            ))}
          </ul>
        ) : (
          <Empty
            title={loaded ? t('queue.empty_title') : t('common.loading')}
            desc={loaded ? t('queue.empty_desc') : undefined}
          />
        )}
      </Panel>

      <DetailModal task={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
