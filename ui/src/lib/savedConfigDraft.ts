// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { TRAINING_TYPES, createDefaultConfig } from '@/schema/schemaIndex.js'
import { getTrainDraft, useTrainConfigStore } from '@/stores/configStore'
import { translate } from '@/i18n/useI18n'
import type { SavedConfigBundle } from './savedConfigIo'

/** 同一目标完成身份解析、覆盖确认及应用；取消前不切型、不写任一草稿。 */
export function applySavedConfigDraft(bundle: SavedConfigBundle): string | null {
  const state = useTrainConfigStore.getState()
  const target = bundle.schema_id || bundle.typeId || state.typeId
  const type = TRAINING_TYPES.find((item) => item.id === target && !item.disabled)
  if (!type) throw new Error(translate('presets.unknown_type', { type: target }))
  const defaults = createDefaultConfig(target) as Record<string, unknown>
  const edited = Object.entries(getTrainDraft(target)).some(([key, value]) =>
    !key.startsWith('_') && JSON.stringify(value) !== JSON.stringify(defaults[key]),
  )
  if (target !== state.typeId || edited) {
    if (!window.confirm(translate('presets.overwrite_confirm', { name: bundle.name, type: type.label || target }))) {
      return null
    }
  }
  if (target !== state.typeId) state.setType(target)
  useTrainConfigStore.getState().replaceDraft(bundle.config)
  return target
}
