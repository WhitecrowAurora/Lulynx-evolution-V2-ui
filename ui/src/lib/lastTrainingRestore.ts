// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { createDefaultConfig } from '@/schema/schemaIndex.js'
import { isPathEmptyForAutofill } from '@/lib/modelPathMatch'

/** Mirrors backend last_training_query.build_resume_offer (P0-A). */
export interface ResumeOffer {
  available: boolean
  offerable: boolean
  show_banner: boolean
  hint: string
  suggested_resume: string | null
  resume_path: string | null
  run_status: string | null
  checkpoint_count: number
  run_id: string | null
  schema_id: string | null
}

export interface RestorableLastTraining {
  ok: boolean
  source: 'last-training' | 'saved_params' | 'none'
  schemaId: string
  config: Record<string, unknown>
  runId: string
  reason?: string
  /** Only present for last-training source when backend attaches it. */
  resumeOffer?: ResumeOffer | null
  suggestedResume?: string | null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function nonEmptyConfig(bag: unknown): Record<string, unknown> | null {
  const r = asRecord(bag)
  if (!r) return null
  return Object.keys(r).length ? r : null
}

function extractResumeOffer(data: Record<string, unknown>): ResumeOffer | null {
  const offer = asRecord(data.resume_offer)
  if (!offer) return null
  const strOrNull = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s ? s : null
  }
  return {
    available: offer.available === true,
    offerable: offer.offerable === true,
    show_banner: offer.show_banner === true,
    hint: String(offer.hint || 'none'),
    suggested_resume: strOrNull(offer.suggested_resume),
    resume_path: strOrNull(offer.resume_path),
    run_status: strOrNull(offer.run_status),
    checkpoint_count: Number(offer.checkpoint_count || 0) || 0,
    run_id: strOrNull(offer.run_id),
    schema_id: strOrNull(offer.schema_id),
  }
}

/** 从 last-training / saved_params 原始响应抽出可灌入草稿的 bag */
export function extractFromLastTrainingPayload(raw: unknown): RestorableLastTraining {
  const root = asRecord(raw) || {}
  // 兼容信封与裸 payload
  const data = asRecord(root.data) || root
  const has = data.has_last_training === true
  const schemaId = String(data.schema_id || data.training_type || data.typeId || '').trim()
  const restorable = nonEmptyConfig(data.restorable_config)
  const config = restorable || nonEmptyConfig(data.config)
  const resumeOffer = extractResumeOffer(data)
  const suggestedResume =
    strOrEmpty(data.suggested_resume) ||
    resumeOffer?.suggested_resume ||
    resumeOffer?.resume_path ||
    null
  if (has && config) {
    return {
      ok: true,
      source: 'last-training',
      schemaId,
      config,
      runId: String(data.run_id || ''),
      resumeOffer,
      suggestedResume,
    }
  }
  if (has && !config) {
    return {
      ok: false,
      source: 'last-training',
      schemaId,
      config: {},
      runId: String(data.run_id || ''),
      reason: String(data.error || 'raw_config_unavailable'),
      resumeOffer,
      suggestedResume,
    }
  }
  return {
    ok: false,
    source: 'none',
    schemaId: '',
    config: {},
    runId: '',
    reason: 'no_last_training',
    resumeOffer,
    suggestedResume: null,
  }
}

function strOrEmpty(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

export function extractFromSavedParamsPayload(raw: unknown): RestorableLastTraining {
  const root = asRecord(raw) || {}
  const data = asRecord(root.data) || root
  if (!Object.keys(data).length) {
    return { ok: false, source: 'none', schemaId: '', config: {}, runId: '', reason: 'empty_saved_params' }
  }
  // 嵌套 { schema_id, config } 或扁平参数袋
  const nested = nonEmptyConfig(data.config)
  const schemaId = String(data.schema_id || data.training_type || data.typeId || nested?.schema_id || '').trim()
  const config = nested || data
  // 去掉元字段,避免污染 draft
  const cleaned = { ...config }
  for (const k of ['schema_id', 'training_type', 'typeId', 'has_last_training', 'run_id', 'normalized_config']) {
    delete cleaned[k]
  }
  if (!Object.keys(cleaned).length) {
    return { ok: false, source: 'saved_params', schemaId, config: {}, runId: '', reason: 'empty_config' }
  }
  return { ok: true, source: 'saved_params', schemaId, config: cleaned, runId: String(data.run_id || '') }
}

export async function fetchRestorableLastTraining(): Promise<RestorableLastTraining> {
  try {
    const resp = await trainApi.lastTraining()
    const fromLast = extractFromLastTrainingPayload(resp)
    if (fromLast.ok) return fromLast
    // last 有记录但无 raw → 仍尝试 saved_params 回落
  } catch {
    /* 后端未起或路由不可达 */
  }
  try {
    const resp = await trainApi.savedParams()
    const unwrapped = unwrap(resp)
    return extractFromSavedParamsPayload(unwrapped)
  } catch {
    return { ok: false, source: 'none', schemaId: '', config: {}, runId: '', reason: 'fetch_failed' }
  }
}

const KEY_PATH_HINTS = [
  'pretrained_model_name_or_path',
  'vae',
  'qwen3',
  'train_data_dir',
  'dataset_dir',
  'output_dir',
  'output_name',
  'network_weights',
]

/** 草稿是否仍近似默认(可静默 seed) */
export function isDraftNearDefault(typeId: string, draft: Record<string, unknown>): boolean {
  const defaults = createDefaultConfig(typeId) as Record<string, unknown>
  let meaningfulDiff = 0
  for (const [k, v] of Object.entries(draft || {})) {
    if (k.startsWith('_')) continue
    const d = defaults[k]
    if (v === d) continue
    if (typeof v === 'string' && typeof d === 'string' && v.trim() === String(d).trim()) continue
    // 路径类:占位/空不算用户意图
    if (typeof v === 'string' && KEY_PATH_HINTS.some((h) => k.includes(h) || k === h)) {
      if (isPathEmptyForAutofill(v, { key: k, defaultValue: d })) continue
    }
    if (v == null || v === '') continue
    meaningfulDiff += 1
    if (meaningfulDiff >= 3) return false
  }
  // 关键路径仍空/占位 → 更像默认
  for (const key of KEY_PATH_HINTS) {
    if (!(key in (defaults || {})) && draft[key] == null) continue
    const cur = draft[key]
    const def = defaults[key]
    if (cur != null && !isPathEmptyForAutofill(cur, { key, defaultValue: def }) && cur !== def) {
      // 已有真实路径,若其它改动少仍可能 seed? 计划:关键路径非空则不算 near-default
      return false
    }
  }
  return meaningfulDiff < 3
}
