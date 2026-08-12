// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { TRAINING_TYPES } from '@/schema/schemaIndex.js'
import { useTrainConfigStore } from '@/stores/configStore'
import { toast } from '@/stores/toastStore'
import { translate } from '@/i18n/useI18n'

export interface RestorableBag {
  ok: boolean
  schemaId?: string
  typeId?: string
  config: Record<string, unknown>
  runId?: string
  name?: string
  reason?: string
  source?: string
}

function knownTrainingType(id: string): boolean {
  return TRAINING_TYPES.some((t) => t.id === id && !t.disabled)
}

/** 将 restorable bag 灌入 train draft(可换 type) */
export function applyConfigBag(bag: RestorableBag, opts: { toastTag?: string } = {}): boolean {
  if (!bag.ok || !bag.config || !Object.keys(bag.config).length) {
    toast.warn(
      bag.reason === 'raw_config_unavailable' ? translate('restore.no_raw') : translate('restore.none'),
      opts.toastTag || 'PARAMS',
    )
    return false
  }
  const sid = String(bag.schemaId || bag.typeId || '').trim()
  const st = useTrainConfigStore.getState()
  if (sid && knownTrainingType(sid) && sid !== st.typeId) {
    st.setType(sid)
  } else if (sid && !knownTrainingType(sid)) {
    toast.warn(translate('restore.type_fallback', { id: sid }), opts.toastTag || 'PARAMS')
  }
  useTrainConfigStore.getState().replaceDraft(bag.config)
  const label = bag.name || bag.runId || sid || translate('restore.config_fallback')
  toast.ok(translate('restore.filled', { label }), opts.toastTag || 'PARAMS')
  return true
}

/** 解析 GET /api/runs/:id/restorable_config 响应 */
export function extractRunRestorable(raw: unknown, fallbackId = ''): RestorableBag {
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const data =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root
  const config =
    data.config && typeof data.config === 'object' && !Array.isArray(data.config)
      ? (data.config as Record<string, unknown>)
      : {}
  const ok = data.ok === true && Object.keys(config).length > 0
  return {
    ok,
    schemaId: String(data.schema_id || data.schemaId || data.typeId || ''),
    typeId: String(data.schema_id || data.typeId || ''),
    config,
    runId: String(data.run_id || data.runId || fallbackId),
    reason: String(data.reason || (ok ? '' : 'unavailable')),
    source: String(data.source || 'runs'),
  }
}
