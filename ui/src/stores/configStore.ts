import { rememberOptimizationChoice } from '../../../../lora-scripts-ui-main/ui/src/features/optimizationPreferences.js'
// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { create } from 'zustand'
import { trainApi, type TrainDraftsPayload } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { translate } from '@/i18n/useI18n'
import { toast } from '@/stores/toastStore'
import { isModelCodePermissionKey, stripModelCodePermission } from '@/lib/modelCodePermission'
import { getPerfModeConfig } from '@/stores/perfModeStore'

/* 训练配置草稿:按训练类型分 draft; localStorage + 磁盘双写 */

const LS_KEY = 'lx-train-drafts-v1'
const DISK_DEBOUNCE_MS = 900
const LS_DEBOUNCE_MS = 400

type TrainSchemaRuntime = {
  createDefaultConfig(typeId: string): Record<string, unknown>
  getFieldDefinition(key: string, typeId: string): { type?: string; [key: string]: unknown } | undefined
  normalizeDraftValue(field: { type?: string; [key: string]: unknown } | undefined, raw: unknown): unknown
}

let schemaRuntime: TrainSchemaRuntime | null = null

interface Persisted {
  typeId?: string
  updated_at?: number
  drafts?: Record<string, Record<string, unknown>>
}

function loadPersisted(): Persisted {
  try {
    return stripModelCodePermission(JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')) as Persisted
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
        drafts: stripModelCodePermission({ ...prev.drafts, ...state.drafts }),
      }),
    )
  } catch {
    /* 空间不足等,忽略 */
  }
}

function makeDraft(typeId: string, saved?: Record<string, unknown>): Record<string, unknown> {
  // 新 schema 字段拿默认值,已保存字段覆盖
  const draft = stripModelCodePermission({ ...(schemaRuntime?.createDefaultConfig(typeId) ?? {}), ...getPerfModeConfig(), ...(saved ?? {}) })
  // quant_train_mode 已从下拉(dequant/keep_w8 字符串)改为布尔开关。
  // 老草稿存的是字符串,直接沿用会被 Boolean() 判成 truthy(连 'dequant' 也是),
  // 导致开关误显示为开。这里把 legacy 字符串归一成布尔:仅 keep_w8 系为 true。
  const qtm = draft.quant_train_mode
  if (typeof qtm === 'string') {
    draft.quant_train_mode = qtm.trim().toLowerCase() === 'keep_w8'
  }
  return draft
}

/** TrainPage loads the full schema lazily and registers its synchronous helpers here. */
export function configureTrainSchema(runtime: TrainSchemaRuntime): void {
  schemaRuntime = runtime
  const state = useTrainConfigStore.getState()
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).map(([typeId, draft]) => [typeId, makeDraft(typeId, draft)]),
  )
  useTrainConfigStore.setState({ drafts })
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
  /** 磁盘草稿 merge(较新则覆盖 per-type，但保留请求期间修改的草稿) */
  mergeDiskDrafts(payload: TrainDraftsPayload, requestDrafts?: TrainConfigState['drafts']): void
  markDiskHydrated(): void
}

const persisted = loadPersisted()
const initialType = persisted.typeId || 'anima-lora'
// 默认占位类型不算本地选择；LS 和用户显式选择均优先于共享磁盘的 typeId。
let hasLocalTypeSelection = Boolean(persisted.typeId)

export const useTrainConfigStore = create<TrainConfigState>((set, get) => ({
  typeId: initialType,
  drafts: { [initialType]: makeDraft(initialType, persisted.drafts?.[initialType]) },
  schemaRev: 0,
  diskHydrated: false,
  setType(typeId) {
    hasLocalTypeSelection = true
    const { drafts } = get()
    if (!drafts[typeId]) {
      set({ typeId, drafts: { ...drafts, [typeId]: makeDraft(typeId, loadPersisted().drafts?.[typeId]) } })
    } else {
      set({ typeId })
    }
  },
  setValue(key, raw) {
    if (isModelCodePermissionKey(key)) return
    const { typeId, drafts } = get()
    const field = schemaRuntime?.getFieldDefinition(key, typeId)
    const value = stripModelCodePermission(schemaRuntime?.normalizeDraftValue(field, raw) ?? raw)
    rememberOptimizationChoice(key, value)
    set({ drafts: { ...drafts, [typeId]: { ...drafts[typeId], [key]: value } } })
  },
  applyValues(values) {
    const { typeId, drafts } = get()
    const nextDraft = { ...drafts[typeId] }
    for (const [key, raw] of Object.entries(stripModelCodePermission(values || {}))) {
      const field = schemaRuntime?.getFieldDefinition(key, typeId)
      nextDraft[key] = schemaRuntime?.normalizeDraftValue(field, raw) ?? raw
    }
    set({ drafts: { ...drafts, [typeId]: nextDraft } })
  },
  replaceDraft(config) {
    const { typeId, drafts } = get()
    set({ drafts: { ...drafts, [typeId]: makeDraft(typeId, config) } })
  },
  resetDraft() {
    const { typeId, drafts } = get()
    set({ drafts: { ...drafts, [typeId]: { ...makeDraft(typeId), ...getPerfModeConfig() } } })
  },
  bumpSchemaRev() {
    set({ schemaRev: get().schemaRev + 1 })
  },
  mergeDiskDrafts(payload, requestDrafts) {
    const diskDrafts = payload?.drafts
    if (!diskDrafts || typeof diskDrafts !== 'object') return
    const diskUpdated = Number(payload.updated_at) || 0
    const local = loadPersisted()
    const lsUpdated = Number(local.updated_at) || 0
    // 磁盘较新或 LS 无时间戳时,用磁盘覆盖已加载 type 的 bag
    if (diskUpdated < lsUpdated && lsUpdated > 0) {
      // 仍吸收 LS 没有的 type
      const { drafts } = get()
      const next = { ...drafts }
      let changed = false
      for (const [tid, bag] of Object.entries(diskDrafts)) {
        if (!next[tid] && !Object.hasOwn(local.drafts ?? {}, tid) && bag && typeof bag === 'object') {
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
      if (requestDrafts && drafts[tid] !== requestDrafts[tid]) continue
      if (bag && typeof bag === 'object') {
        next[tid] = makeDraft(tid, bag as Record<string, unknown>)
      }
    }
    if (requestDrafts && drafts[typeId] !== requestDrafts[typeId]) hasLocalTypeSelection = true
    const nextType =
      !hasLocalTypeSelection && payload.typeId && typeof payload.typeId === 'string' && next[payload.typeId]
        ? payload.typeId
        : typeId
    if (nextType === payload.typeId) hasLocalTypeSelection = true
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

/** 读取目标类型草稿而不切换当前类型；未访问类型仍优先使用本地保存值。 */
export function getTrainDraft(typeId: string): Record<string, unknown> {
  return useTrainConfigStore.getState().drafts[typeId] ?? makeDraft(typeId, loadPersisted().drafts?.[typeId])
}

let lsTimer: number | undefined
let diskTimer: number | undefined
let diskWriteFailedNotified = false
let suppressDiskWrite = false

useTrainConfigStore.subscribe((state, previous) => {
  if (state.drafts === previous.drafts && state.typeId === previous.typeId) return
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
          toast.warn(translate('draft.flush_fail'), 'DRAFT')
        }
      })
  }, DISK_DEBOUNCE_MS)
})

/** 启动时从磁盘 hydrate; 可在 TrainPage mount 调用一次 */
export async function hydrateTrainDraftsFromDisk(): Promise<void> {
  const requestDrafts = useTrainConfigStore.getState().drafts
  try {
    const resp = await trainApi.loadTrainDrafts()
    const data = unwrap<TrainDraftsPayload>(resp)
    if (data && typeof data === 'object') {
      // 只抑制 hydrate 本身的回写；等待网络期间的用户编辑仍需正常持久化。
      const previousSuppression = suppressDiskWrite
      suppressDiskWrite = true
      try {
        useTrainConfigStore.getState().mergeDiskDrafts(data, requestDrafts)
      } finally {
        suppressDiskWrite = previousSuppression
      }
    }
  } catch {
    /* 后端未起:仅 LS */
  } finally {
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
      drafts[nextType] = useTrainConfigStore.getState().drafts[nextType] || makeDraft(nextType)
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
