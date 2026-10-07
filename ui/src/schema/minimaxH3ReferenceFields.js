import { oneOf } from './schemaCommon.js';

const visibleWhen = oneOf('h3_partition', ['ref2va', 'ref2va_pruned']);
const field = (key, type, label, defaultValue, extra = {}) => ({
  key, type, label, title: key, defaultValue, visibleWhen, ...extra,
});

export const H3_REFERENCE_FIELDS = [
  field('fp_1f_enabled', 'boolean', '启用 Ref2VA 单帧训练', false,
    { desc: 'Ref2VA 图像训练需要启用此项，并提供参考清单；当前仅支持单帧目标。' }),
  field('fp_1f_task', 'select', '单帧任务', 'ref2va', { options: ['ref2va'] }),
  field('h3_ref2va_manifest_path', 'file', 'Ref2VA 参考清单', '',
    { pickerType: 'file', desc: '选择包含目标图、参考图和提示词的 h3_ref2va_auxiliary_v1 JSON 清单。' }),
];

export const H3_REFERENCE_TEACHER_FIELDS = [
  field('h3_teacher_matching', 'boolean', 'Ref2VA Teacher 训练', false,
    { desc: 'Teacher 使用清单中的额外参考图，Student 学习其预测。每条样本需提供 teacher_references；启用后使用 Teacher 目标。' }),
  field('h3_teacher_conditions', 'select', 'Teacher 参考条件', 'ref', { options: ['ref'] }),
  field('h3_teacher_condition_sigma_min', 'number', 'Teacher 噪声区间下限', 0,
    { min: 0, max: 1, step: 0.01, desc: '区间内使用额外参考；区间外使用 Student 条件的底模预测。' }),
  field('h3_teacher_condition_sigma_max', 'number', 'Teacher 噪声区间上限', 1,
    { min: 0, max: 1, step: 0.01 }),
];

export const h3PreviewFields = (finetune) => [
  field('preview_device', 'select', '预览设备', 'gpu', {
    options: finetune ? ['gpu', 'off'] : ['gpu', 'cpu', 'off'],
    desc: 'GPU 在训练更新后生成；CPU 保存当步普通 LoRA 快照后在后台生成，每次只运行一个任务。',
  }),
  field('sample_every', 'number', '每 N 步预览（0 关闭定时）', 0, { min: 0, step: 1 }),
  field('sample_every_n_epochs', 'number', '每 N 轮预览（0 关闭定时）', 0, { min: 0, step: 1 }),
  field('sample_at_first', 'boolean', '训练前预览', false,
    { desc: '需同时启用步数或轮次定时预览。手动预览在训练监控页发起。' }),
  field('sample_steps', 'number', '预览采样步数', 4, { min: 1, step: 1 }),
  field('sample_seed', 'number', '预览种子', 0, { step: 1 }),
  field('h3_preview_cache_index', 'number', '预览样本序号（从 0 开始）', 0,
    { min: 0, step: 1, desc: '使用该缓存样本的参考图与提示条件，输出尺寸跟随缓存。' }),
  field('h3_preview_cfg', 'number', '预览 CFG', 1, { min: 1, max: 16, step: 0.1 }),
  field('h3_preview_condition_clean_t', 'number', '参考条件保留强度', 0.999,
    { min: 0, max: 1, step: 0.001 }),
];
