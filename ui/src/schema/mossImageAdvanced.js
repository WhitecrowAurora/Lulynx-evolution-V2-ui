// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { netLora, when } from './schemaCommon.js';
import { S_SPEED_FLOW, S_ADV_DIT, S_VALIDATION } from './schemaFieldGroups.js';

const pick = (fields, keys) => fields.filter((field) => keys.includes(field.key));
const number = (key, label, value, min, step = 0.1) => ({ key, title: key, type: 'number', label, defaultValue: value, min, step });

export const MOSS_ADAPTER_FIELDS = netLora('networks.lora', 16, 16, 512, [], [
  'networks.tlora', 'networks.lora_fa', 'networks.vera', 'networks.flexrank_lora',
]).filter((field) => ![
  'enable_base_weight', 'base_weights', 'base_weights_multiplier',
].includes(field.key)).map((field) => field.key === 'dora_wd'
  ? { ...field, key: 'use_dora', title: 'use_dora' }
  : field);

export const MOSS_FLOW_FIELDS = [
  { key: 'loss_type', title: 'loss_type', type: 'select', label: '训练 Loss', defaultValue: 'l2', options: ['l2', 'l1', 'huber', 'smooth_l1', 'pseudo_huber'] },
  number('anima_sigmoid_scale', 'Sigmoid 尺度', 1, 0),
  number('discrete_flow_shift', '训练 Sigma Shift', 1, 0.01),
  number('flow_logit_mean', 'Logit 均值', 0),
  number('flow_logit_std', 'Logit 标准差', 1, 0),
  { key: 'moss_image_clean_end_enabled', title: 'moss_image_clean_end_enabled', type: 'boolean', label: '指定低噪声训练占比', defaultValue: false, desc: '控制训练中实际 Sigma 低于阈值的概率，保留两侧原分布形状。改变训练分布；需关闭 MixFlow、纯噪声插入和其他时间步采样策略。验证分布保持原设置。' },
  { ...number('moss_image_clean_end_share', '低噪声占比', 0.5, 0, 0.01), max: 1, visibleWhen: when('moss_image_clean_end_enabled', true) },
  { ...number('moss_image_clean_end_cutoff', '低噪声 Sigma 阈值', 0.5, 0.01, 0.01), max: 0.99, visibleWhen: when('moss_image_clean_end_enabled', true) },
  { key: 'mixflow_enabled', title: 'mixflow_enabled', type: 'boolean', label: 'MixFlow', defaultValue: false, desc: '训练时分离模型时间与输入插值；验证仍使用原 Sigma。' },
  { ...number('mixflow_gamma', 'MixFlow Gamma', 0, 0, 0.01), max: 1, visibleWhen: when('mixflow_enabled', true) },
];

export const MOSS_MEMORY_FIELDS = pick(S_SPEED_FLOW, [
  'cpu_offload_checkpointing', 'quant_train_mode', 'keep_w8_vram_prefer',
  'quant_train_convrot', 'layer_precision_policy', 'layer_precision_default',
  'layer_precision_rules_json', 'layer_precision_overrides_json',
  'weight_compression_enabled', 'weight_compression_target', 'weight_compression_format',
  'weight_compression_verify', 'quant_requantize_policy',
]).map((field) => {
  if (field.key === 'weight_compression_target') return { ...field, options: field.options.filter((option) => ['none', 'backbone'].includes(option.value)) };
  if (field.key === 'weight_compression_format') return { ...field, defaultValue: 'torchao_int8', options: field.options.filter((option) => !['fp8_scaled_e4m3', 'fp8_e4m3'].includes(option.value)) };
  return field;
});

export const MOSS_EMA_FIELDS = pick(S_ADV_DIT, [
  'ema_update_every', 'ema_update_after_step', 'ema_power', 'ema_inv_gamma', 'ema_reset_on_resume',
]).map((field) => ({ ...field, visibleWhen: when('ema_use_ema', true) }));
export const MOSS_VALIDATION_FIELDS = S_VALIDATION;
