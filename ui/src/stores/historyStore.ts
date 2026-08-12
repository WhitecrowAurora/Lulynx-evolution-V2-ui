// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* 运行历史:提交时保存 draft 快照,供队列/监控「复制参数」。
   localStorage + 磁盘双写(assets/ui_state/run_history),cap 40。 */

import { request } from '@/api/transport'
import { unwrap } from '@/api/transport'

const LS_KEY = 'lx-run-history-v1'
const CAP = 40
const DISK_DEBOUNCE_MS = 900

export interface RunRecord {
  /** 后端返回的 run/task id(可能为空,匹配时兜底用 name) */
  id: string
  name: string
  typeId: string
  at: number
  config: Record<string, unknown>
}

export interface RunHistoryPayload {
  version?: number
  updated_at?: number
  records?: RunRecord[]
}

function loadLocal(): RunRecord[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as RunRecord[]
    return Array.isArray(arr) ? arr.slice(0, CAP) : []
  } catch {
    return []
  }
}

function saveLocal(records: RunRecord[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records.slice(0, CAP)))
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(records.slice(0, Math.floor(CAP / 2))))
    } catch {
      /* ignore */
    }
  }
}

function sanitizeRecord(raw: unknown): RunRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const config = r.config && typeof r.config === 'object' && !Array.isArray(r.config) ? (r.config as Record<string, unknown>) : {}
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    typeId: String(r.typeId ?? r.type_id ?? ''),
    at: Number(r.at) || 0,
    config: { ...config },
  }
}

/** 按 id 优先去重合并,新在前,cap */
export function mergeHistoryRecords(primary: RunRecord[], secondary: RunRecord[]): RunRecord[] {
  const out: RunRecord[] = []
  const seen = new Set<string>()
  for (const rec of [...primary, ...secondary]) {
    if (!rec) continue
    const key = rec.id ? `id:${rec.id}` : `name:${rec.name}:${rec.at}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rec)
    if (out.length >= CAP) break
  }
  return out
}

let diskTimer: number | undefined
let diskHydrated = false

function scheduleDiskWrite(records: RunRecord[]) {
  if (typeof window === 'undefined') return
  window.clearTimeout(diskTimer)
  diskTimer = window.setTimeout(() => {
    const body: RunHistoryPayload = {
      version: 1,
      updated_at: Date.now(),
      records: records.slice(0, CAP),
    }
    void request('/api/run_history', { method: 'PUT', body: JSON.stringify(body) }).catch(() => {
      /* 后端未起:仅 LS */
    })
  }, DISK_DEBOUNCE_MS)
}

/** 提交成功后记录;runResponse 里能挖到 run_id/task_id 就带上 */
export function addRunRecord(typeId: string, config: Record<string, unknown>, runResponse: unknown) {
  const resp = runResponse as Record<string, unknown> | null
  const id = String(resp?.run_id ?? resp?.task_id ?? resp?.id ?? '')
  const name = String(config.output_name ?? config.config_name ?? typeId)
  const records = loadLocal().filter((r) => !(id && r.id === id))
  records.unshift({ id, name, typeId, at: Date.now(), config: { ...config } })
  const next = records.slice(0, CAP)
  saveLocal(next)
  scheduleDiskWrite(next)
}

/** 按任务 id 或名称匹配本地记录 */
export function findRunRecord(taskId?: string, name?: string): RunRecord | undefined {
  const records = loadLocal()
  if (taskId) {
    const hit = records.find((r) => r.id && r.id === taskId)
    if (hit) return hit
  }
  if (name) {
    const hit = records.find((r) => r.name && r.name === name)
    if (hit) return hit
  }
  return undefined
}

export function listRunRecords(): RunRecord[] {
  return loadLocal()
}

/** 启动时磁盘 merge(较新或 LS 空时吸收);可在 Queue/App mount 调一次 */
export async function hydrateRunHistoryFromDisk(): Promise<void> {
  if (diskHydrated) return
  diskHydrated = true
  try {
    const resp = await request('/api/run_history')
    const data = unwrap<RunHistoryPayload>(resp)
    const diskRecords = Array.isArray(data?.records)
      ? data!.records!.map(sanitizeRecord).filter((x): x is RunRecord => Boolean(x))
      : []
    if (!diskRecords.length) return
    const local = loadLocal()
    const diskAt = Number(data?.updated_at) || 0
    const localMax = local.reduce((m, r) => Math.max(m, r.at || 0), 0)
    // 磁盘较新或本地空 → 磁盘优先;否则本地优先再补磁盘缺的
    const merged =
      !local.length || diskAt >= localMax
        ? mergeHistoryRecords(diskRecords, local)
        : mergeHistoryRecords(local, diskRecords)
    saveLocal(merged)
  } catch {
    /* 仅 LS */
  }
}
