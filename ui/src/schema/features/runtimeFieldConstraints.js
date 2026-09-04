// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* 运行时字段约束 → 界面置灰 / 提示。
   数据随 /api/train/execution-profiles 的 field_constraints / option_constraints 过来,
   单一来源在 backend/core/execution/runtime_field_constraints.py —— 那张表同时供
   amd_runtime / mps_runtime 取 disabled_features 的文字,所以界面上写的就是训练时真会发生的事。
   三个界面分叉各持一份同样的实现(分叉是彼此独立的仓库,不抽公共模块),
   由 backend/smoke/functional/webui 的守卫钉住三份输出逐字相同。 */

import { getCurrentExecutionProfileId, pickLang } from './attentionCapabilities.js';

const FORCED = 'forced';

/* 只认逐字相同的运行时 id。findExecutionProfile 那条 standard 兜底对「判后端可用性」是对的
   (拿不到就按最保守的档算),对约束表却会反过来:把 ROCm 的理由悄悄换成 standard 的空表。 */
function exactProfile(profiles, config) {
  // profiles == null 表示还没拉到 / 请求失败 ⇒ 未知按中性处理,冷启动那几秒不许出提示。
  if (profiles == null) return null;
  const wanted = String(getCurrentExecutionProfileId(config));
  const list = Array.isArray(profiles) ? profiles : [];
  return list.find((profile) => String(profile?.id || '').trim().toLowerCase() === wanted) || null;
}

function pickText(row, lang) {
  if (!row || typeof row !== 'object') return '';
  return String(row[lang] || row.en || row.zh || '');
}

export function fieldConstraint(field, profiles, config = {}) {
  const key = field?.key;
  if (!key) return null;
  const row = exactProfile(profiles, config)?.field_constraints?.[key];
  const text = pickText(row, pickLang(config));
  if (!text) return null;
  return { effect: row.effect === FORCED ? FORCED : 'advisory', text };
}

export function optionConstraints(field, profiles, config = {}) {
  const key = field?.key;
  if (!key) return {};
  const table = exactProfile(profiles, config)?.option_constraints?.[key];
  if (!table || typeof table !== 'object') return {};
  const lang = pickLang(config);
  const out = {};
  for (const [value, row] of Object.entries(table)) {
    const text = pickText(row, lang);
    if (text) out[String(value)] = text;
  }
  return out;
}

/* 只有 forced 夺走控制权。advisory 走 runtimeAdvisoryNote —— mixed_precision 在 rocm-amd 上
   只有「请求 bf16 且实测 BF16 不可用」才降到 fp16,而 fp16 恰好是这条路线想要的档:置灰它
   等于把用户锁在选不了 fp16 的状态。同 configForm 里 keep*Editable 那条「永远留一条退出路径」。 */
export function runtimeForcedReason(field, profiles, config = {}) {
  const constraint = fieldConstraint(field, profiles, config);
  return constraint && constraint.effect === FORCED ? constraint.text : '';
}

export function runtimeAdvisoryNote(field, profiles, config = {}) {
  const constraint = fieldConstraint(field, profiles, config);
  return constraint && constraint.effect !== FORCED ? constraint.text : '';
}
