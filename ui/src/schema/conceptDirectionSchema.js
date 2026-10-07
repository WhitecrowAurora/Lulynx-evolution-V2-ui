import { when } from './schemaCommon.js';

const enabled = when('concept_direction_enabled', true);
const field = (name, type, label, defaultValue, desc, extra = {}) => ({
  key: `concept_direction_${name}`, type, label, defaultValue, desc,
  title: `concept_direction_${name}`, visibleWhen: enabled, ...extra,
});

const section = {
  id: 'concept-direction',
  tab: 'training',
  title: '概念方向训练 · Concept Direction',
  description: '适用于 SD1.5 / SDXL 标准 LoRA。使用前请将训练范围设为仅 UNet，保留已加载且冻结的文本编码器（live TE），并关闭文本编码器输出缓存及其磁盘缓存。每个触发步会额外执行 4 次 UNet 前向，增加训练时间与显存需求；可提高步间隔降低触发频率。',
  fields: [
    field('enabled', 'boolean', '启用概念方向训练', false,
      '通过正向与负向描述学习概念差异。默认关闭；关闭后保留已填写内容。', { visibleWhen: undefined }),
    field('pairs', 'concept_direction_pairs', '概念对', '',
      '正向描述希望增强的概念，负向描述对应的对照；每对两侧都需填写。可添加多对，建议每对只改变一个概念。'),
    field('weight', 'number', '概念损失权重', 1.0,
      '概念方向损失在总损失中的权重；0 表示方向项不计入总损失。', { min: 0, step: 0.1 }),
    field('guidance_scale', 'number', '方向引导强度', 1.0,
      '控制正负概念预测差异的强度；0 为零引导。', { min: 0, step: 0.1 }),
    field('timestep_range', 'string', '采样时间步范围', '',
      '留空使用全部时间步；输入“起点,终点”，如 200,800，包含起点、不包含终点。',
      { placeholder: '留空使用全部时间步，例如 200,800' }),
    field('neutral_reg', 'number', '中性正则强度', 0.0,
      '让负向提示词下的预测保持接近底模，减少对照概念偏移；0 表示关闭。', { min: 0, step: 0.1 }),
    field('every_n_steps', 'number', '触发步间隔', 1,
      '每隔多少步计算一次概念方向损失；1 为每步。增大间隔可降低额外计算成本。', { min: 1, step: 1 }),
  ],
};

const animaSection = {
  ...section,
  description: '实验功能：适用于 Anima 标准 LoRA、faithful forward，需冻结 Qwen3 文本编码器与 LLM adapter；允许使用文本缓存。现有短训尚未证明稳定的概念方向收益。每个触发步会额外执行 4 次 DiT 前向，增加训练时间与显存需求；可提高步间隔降低触发频率。',
};

export function withConceptDirection(sections, typeId) {
  const source = sections.filter((item) => item.id !== section.id);
  if (!['sd-lora', 'sdxl-lora', 'anima-lora'].includes(typeId)) return source.length === sections.length ? sections : source;
  const trainingIndex = source.findIndex((item) => item.id === 'training-settings');
  const index = trainingIndex < 0 ? source.length : trainingIndex + 1;
  return [...source.slice(0, index), typeId === 'anima-lora' ? animaSection : section, ...source.slice(index)];
}
