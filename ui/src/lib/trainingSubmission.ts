// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { buildRunConfig } from '@/schema/schemaIndex.js'
import { flushTrainDraftsToDisk, useTrainConfigStore } from '@/stores/configStore'
import { addRunRecord } from '@/stores/historyStore'
import { stripModelCodePermission, type ModelCodePermission } from '@/lib/modelCodePermission'
import { buildRunOutcomeNotices, type RunOutcomeNotice } from '@/lib/runOutcomeNotices'

/** 一次点击只使用一个独立快照；后续编辑只影响下一次提交。 */
export async function submitTrainingDraft(
  confirmOverwrite: (message: string, name: string) => boolean,
  bypass: Record<string, unknown> | null,
  consumeModelCodePermission?: () => ModelCodePermission,
): Promise<{ typeId: string; notices: RunOutcomeNotice[] } | null> {
  const state = useTrainConfigStore.getState()
  // Consume before the first await; retries and cancelled submissions need fresh consent.
  const permission = consumeModelCodePermission?.()
  const snapshot = structuredClone({
    typeId: state.typeId,
    config: stripModelCodePermission(state.drafts[state.typeId] ?? {}),
    bypass,
  })
  const payload = stripModelCodePermission(structuredClone(buildRunConfig(snapshot.config, snapshot.typeId)))
  if (snapshot.typeId === 'aesthetic-scorer') {
    payload.allow_model_code = permission?.allow_model_code === true && permission.model_code_sources.length > 0
    payload.model_code_sources = payload.allow_model_code ? [...permission!.model_code_sources] : []
  }
  if (snapshot.bypass && snapshot.config.allow_unverified_dataset_start) {
    payload.dataset_validation_bypass = snapshot.bypass
  }
  // flush 同步捕获当前全部草稿后才等待 I/O；失败仍由自动保存兜底。
  try {
    await flushTrainDraftsToDisk()
  } catch {
    /* 草稿持久化失败不阻断训练提交。 */
  }
  const dir = String(payload.output_dir ?? '')
  const saveTo = String(payload.save_to ?? '')
  const name = String(payload.output_name ?? '')
  let overwriteAcknowledged = false
  if ((dir || saveTo) && name) {
    try {
      const conflict = unwrap<Record<string, unknown>>(
        await trainApi.checkOutputConflict(dir, name, {
          saveTo,
          resumePath: String(payload.resume_path ?? ''),
        }),
      )
      if ((conflict?.conflict === true || conflict?.exists === true) && conflict?.blocked !== false) {
        if (!confirmOverwrite(String(conflict.message || ''), name)) return null
        overwriteAcknowledged = true
      }
    } catch {
      /* 检查失败仍由后端的输出冲突策略处理，不额外授权覆盖。 */
    }
  }
  const request = overwriteAcknowledged ? { ...payload, output_collision_policy: 'overwrite' } : payload
  const response = unwrap(await trainApi.run(request))
  addRunRecord(snapshot.typeId, snapshot.config, response)
  return { typeId: snapshot.typeId, notices: buildRunOutcomeNotices(response) }
}
