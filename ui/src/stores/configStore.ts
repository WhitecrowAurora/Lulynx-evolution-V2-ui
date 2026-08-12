// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { create } from 'zustand'
import { createDefaultConfig, getFieldDefinition, normalizeDraftValue } from '@/schema/schemaIndex.js'
import { trainApi, type TrainDraftsPayload } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { translate } from '@/i18n/useI18n'

/* 训练配置草稿:按训练类型分 draft; localStorage + 磁盘双写 */

const LS_KEY = 'lx-train-drafts-v1'
const DISK_DEBOUNCE_MS = 900
const LS_DEBOUNCE_MS = 400

interface Persisted {
  typeId?: string
  updated_at?: number
  drafts?: Record<string, Record<string, unknown>>
}

function loadPersisted(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Persisted
  } catch {
    return {}
  }
}

function writeLocal(state: { typeId: string; drafts: Record<string, Record<string, unknown>> }) {
  try {
    const prev = loadPersisted()
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        typeId: state.typeId,
        updated_at: Date.now(),
        drafts: { ...prev.drafts, ...state.drafts },
      }),
    )
  } catch {
    /* 空间不足等,忽略 */
  }
}

function makeDraft(typeId: string, saved?: Record<string, unknown>): Record<string, unknown> {
  // 新 schema 字段拿默认值,已保存字段覆盖
  return { ...createDefaultConfig(typeId), ...(saved ?? {}) }
}

interface TrainConfigState {
  typeId: string
  drafts: Record<string, Record<string, unknown>>
  /** applyBackendConfigOptions 修改 schema 后 bump,驱动依赖 schema 的组件重渲染 */
  schemaRev: number
  /** 磁盘 hydrate 完成标记(供 autofill 等后置步骤) */
  diskHydrated: boolean
  setType(typeId: string): void
  setValue(key: string, raw: unknown): void
  applyValues(values: Record<string, unknown>): void
  replaceDraft(config: Record<string, unknown>): void
  resetDraft(): void
  bumpSchemaRev(): void
  /** 磁盘草稿 merge(较新则覆盖 per-type) */
  mergeDiskDrafts(payload: TrainDraftsPayload): void
  markDiskHydrated(): void
}

const persisted = loadPersisted()
const initialType = persisted.typeId || 'anima-lora'

export const useTrainConfigStore = create<TrainConfigState>((set, get) => ({
  typeId: initialType,
  drafts: { [initialType]: makeDraft(initialType, persisted.drafts?.[initialType]) },
  schemaRev: 0,
  diskHydrated: false,
  setType(typeId) {
    const { drafts } = get()
    if (!drafts[typeId]) {
      set({ typeId, drafts: { ...drafts, [typeId]: makeDraft(typeId, loadPersisted().drafts?.[typeId]) } })
    } else {
      set({ typeId })
    }
  },
  setValue(key, raw) {
    const { typeId, drafts } = get()
    const field = getFieldDefinition(key, typeId)
    const value = normalizeDraftValue(field, raw)
    set({ drafts: { ...drafts, [typeId]: { ...drafts[typeId], [key]: value } } })
  },
  applyValues(values) {
    const { typeId, drafts } = get()
    const nextDraft = { ...drafts[typeId] }
    for (const [key, raw] of Object.entries(values || {})) {
      nextDraft[key] = normalizeDraftValue(getFieldDefinition(key, typeId), raw)
    }
    set({ drafts: { ...drafts, [typeId]: nextDraft } })
  },
  replaceDraft(config) {
    const { typeId, drafts } = get()
    set({ drafts: { ...drafts, [typeId]: makeDraft(typeId, config) } })
  },
  resetDraft() {
    const { typeId, drafts } = get()
    set({ drafts: { ...drafts, [typeId]: createDefaultConfig(typeId) } })
  },
  bumpSchemaRev() {
    set({ schemaRev: get().schemaRev + 1 })
  },
  mergeDiskDrafts(payload) {
    const diskDrafts = payload?.drafts
    if (!diskDrafts || typeof diskDrafts !== 'object') return
    const diskUpdated = Number(payload.updated_at) || 0
    const lsUpdated = Number(loadPersisted().updated_at) || 0
    // 磁盘较新或 LS 无时间戳时,用磁盘覆盖已加载 type 的 bag
    if (diskUpdated < lsUpdated && lsUpdated > 0) {
      // 仍吸收 LS 没有的 type
      const { drafts } = get()
      const next = { ...drafts }
      let changed = false
      for (const [tid, bag] of Object.entries(diskDrafts)) {
        if (!next[tid] && bag && typeof bag === 'object') {
          next[tid] = makeDraft(tid, bag as Record<string, unknown>)
          changed = true
        }
      }
      if (changed) set({ drafts: next })
      return
    }
    const { drafts, typeId } = get()
    const next = { ...drafts }
    for (const [tid, bag] of Object.entries(diskDrafts)) {
      if (bag && typeof bag === 'object') {
        next[tid] = makeDraft(tid, bag as Record<string, unknown>)
      }
    }
    const nextType =
      payload.typeId && typeof payload.typeId === 'string' && (next[payload.typeId] || diskDrafts[payload.typeId])
        ? payload.typeId
        : typeId
    if (!next[nextType]) {
      next[nextType] = makeDraft(nextType, diskDrafts[nextType] as Record<string, unknown> | undefined)
    }
    set({ typeId: nextType, drafts: next })
    writeLocal({ typeId: nextType, drafts: next })
  },
  markDiskHydrated() {
    set({ diskHydrated: true })
  },
}))

/** 当前类型草稿(不存在时惰性建立由 setType 保证;这里兜底返回空对象) */
export function useDraft(): Record<string, unknown> {
  return useTrainConfigStore((s) => s.drafts[s.typeId]) ?? {}
}

let lsTimer: number | undefined
let diskTimer: number | undefined
let diskWriteFailedNotified = false
let suppressDiskWrite = false

useTrainConfigStore.subscribe((state) => {
  window.clearTimeout(lsTimer)
  lsTimer = window.setTimeout(() => {
    writeLocal(state)
  }, LS_DEBOUNCE_MS)

  if (suppressDiskWrite) return
  window.clearTimeout(diskTimer)
  diskTimer = window.setTimeout(() => {
    const snapshot = useTrainConfigStore.getState()
    const body: TrainDraftsPayload = {
      version: 1,
      typeId: snapshot.typeId,
      updated_at: Date.now(),
      drafts: snapshot.drafts,
    }
    void trainApi
      .saveTrainDrafts(body)
      .catch(() => {
        if (!diskWriteFailedNotified) {
          diskWriteFailedNotified = true
          // 动态 import 避免 store↔toast 循环;失败静默也可
          import('@/stores/toastStore')
            .then(({ toast }) => toast.warn(translate('draft.flush_fail'), 'DRAFT'))
            .catch(() => {})
        }
      })
  }, DISK_DEBOUNCE_MS)
})

/** 启动时从磁盘 hydrate; 可在 TrainPage mount 调用一次 */
export async function hydrateTrainDraftsFromDisk(): Promise<void> {
  try {
    suppressDiskWrite = true
    const resp = await trainApi.loadTrainDrafts()
    const data = unwrap<TrainDraftsPayload>(resp)
    if (data && typeof data === 'object') {
      useTrainConfigStore.getState().mergeDiskDrafts(data)
    }
  } catch {
    /* 后端未起:仅 LS */
  } finally {
    suppressDiskWrite = false
    useTrainConfigStore.getState().markDiskHydrated()
  }
}

function draftsPayloadNow(): TrainDraftsPayload {
  const snapshot = useTrainConfigStore.getState()
  return {
    version: 1,
    typeId: snapshot.typeId,
    updated_at: Date.now(),
    drafts: snapshot.drafts,
  }
}

/** 立即写盘(取消 debounce);失败抛错给调用方 toast */
export async function flushTrainDraftsToDisk(): Promise<void> {
  window.clearTimeout(diskTimer)
  window.clearTimeout(lsTimer)
  const body = draftsPayloadNow()
  writeLocal({ typeId: body.typeId || 'anima-lora', drafts: body.drafts || {} })
  await trainApi.saveTrainDrafts(body)
  diskWriteFailedNotified = false
}

/**
 * 清当前 type 草稿为 schema 默认,并 DELETE 磁盘该 type。
 * 与 RESET 区分:RESET 只改内存(仍会 debounce 写默认 bag)。
 */
export async function clearCurrentTypeDraftOnDisk(): Promise<void> {
  const { typeId, resetDraft } = useTrainConfigStore.getState()
  window.clearTimeout(diskTimer)
  suppressDiskWrite = true
  try {
    resetDraft()
    // LS:去掉该 type 键,避免下次 hydrate 又捞回
    try {
      const prev = loadPersisted()
      const drafts = { ...(prev.drafts || {}) }
      delete drafts[typeId]
      const nextType = useTrainConfigStore.getState().typeId
      drafts[nextType] = useTrainConfigStore.getState().drafts[nextType] || createDefaultConfig(nextType)
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ typeId: nextType, updated_at: Date.now(), drafts }),
      )
    } catch {
      /* ignore */
    }
    await trainApi.clearTrainDrafts(typeId)
  } finally {
    suppressDiskWrite = false
  }
}
