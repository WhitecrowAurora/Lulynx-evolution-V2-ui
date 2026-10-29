// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/**
 * 训练配置的必填规则 —— 与后端硬闸逐条对齐。
 *
 * 真源是 backend/core/runners/training.py 的 _default_native_training_launcher:
 *   扩散训练  required_fields=("train_data_dir", "output_dir")
 *   scorer 路 required_fields=("output_dir",)  + dataset/annotations 二选一
 * 模型路径不在路径契约的 required_fields 里(它允许仓库 id),但后端
 * configs_legacy_compat.validate() 会报「未指定底模路径」并拒绝训练,
 * 所以对界面而言同样是必填。
 *
 * 规则只对「schema 里真的存在的 key」生效。实验室四型(lab-distiller 与两个
 * few-step)走 /api/lulynx-lab/*,请求体契约和通用 /api/run 不同,字段名也对不上
 * —— 交集为空就自动不标必填,不需要在这里维护黑名单。
 */

/** 主模型权重:多数族用通用 key,MiniMax H3 用组件型专用 key。二者任填其一。 */
const MODEL_PATH_KEYS = ['pretrained_model_name_or_path', 'h3_transformer_path'] as const

/** 扩散训练的数据目录。 */
const DATASET_KEYS = ['train_data_dir'] as const

/** 美学评分模型吃标注文件而不是图片目录,二选一即可。 */
const SCORER_DATASET_KEYS = ['annotations', 'dataset'] as const

export function isScorerRoute(typeId: string, config: Record<string, unknown>): boolean {
  const id = String(typeId || '').trim().toLowerCase()
  const trainType = String(config.model_train_type || id).trim().toLowerCase()
  return id === 'aesthetic-scorer' || trainType === 'aesthetic-scorer'
}

/**
 * 必填字段分组。每组内「任填其一」即算满足;组间是与关系。
 * 每个成员都该打 `*` —— 它们是同一个决定的不同写入口。
 */
export function requiredGroupsFor(
  typeId: string,
  config: Record<string, unknown>,
  presentKeys: Iterable<string>,
): string[][] {
  const present = new Set(presentKeys)
  const keep = (group: readonly string[]) => group.filter((key) => present.has(key))

  const groups: string[][] = []
  if (isScorerRoute(typeId, config)) {
    const dataset = keep(SCORER_DATASET_KEYS)
    if (dataset.length) groups.push(dataset)
  } else {
    const dataset = keep(DATASET_KEYS)
    if (dataset.length) groups.push(dataset)
    const model = keep(MODEL_PATH_KEYS)
    if (model.length) groups.push(model)
  }
  const output = keep(['output_dir'])
  if (output.length) groups.push(output)
  return groups
}

function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  return String(value).trim().length > 0
}

/** 所有该打 `*` 的 key(取各组成员并集)。 */
export function requiredKeysFor(
  typeId: string,
  config: Record<string, unknown>,
  presentKeys: Iterable<string>,
): Set<string> {
  const keys = new Set<string>()
  for (const group of requiredGroupsFor(typeId, config, presentKeys)) {
    for (const key of group) keys.add(key)
  }
  return keys
}

/** 未满足的必填组(每组都为空)。空数组 = 必填项齐全。 */
export function missingRequiredGroups(
  typeId: string,
  config: Record<string, unknown>,
  presentKeys: Iterable<string>,
): string[][] {
  return requiredGroupsFor(typeId, config, presentKeys).filter(
    (group) => !group.some((key) => filled(config[key])),
  )
}

/** 未满足必填组里涉及的 key 平铺集合,便于把红框一次性点亮。 */
export function missingRequiredKeys(
  typeId: string,
  config: Record<string, unknown>,
  presentKeys: Iterable<string>,
): Set<string> {
  const keys = new Set<string>()
  for (const group of missingRequiredGroups(typeId, config, presentKeys)) {
    for (const key of group) keys.add(key)
  }
  return keys
}