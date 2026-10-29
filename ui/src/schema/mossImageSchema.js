// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { sec, when } from './schemaCommon.js';
import { blockWeightCacheFields } from './weightCacheFields.js';
import { S_LR_DIT, S_LR_FT_DIT, S_SAVE, S_TRAIN, S_PREVIEW, S_EXECUTION_BACKEND, S_COMPILE_EXPERT, S_SYSTEM_ENV } from './schemaFieldGroups.js';
import { MOSS_ADAPTER_FIELDS, MOSS_FLOW_FIELDS, MOSS_MEMORY_FIELDS, MOSS_EMA_FIELDS, MOSS_VALIDATION_FIELDS } from './mossImageAdvanced.js';

const number = (key, label, value, min = 0, step = 1) => ({ key, title: key, type: 'number', label, defaultValue: value, min, step });
const flag = (key, label, value = false) => ({ key, title: key, type: 'boolean', label, defaultValue: value });
const folder = (key, label) => ({ key, title: key, type: 'folder', pickerType: 'folder', label, defaultValue: '' });

const preview = S_PREVIEW.filter((field) => !['preview_component_residency', 'ephemeral_preview_pipeline'].includes(field.key)).map((field) => {
  if (field.key === 'preview_device') return { ...field, defaultValue: 'gpu', options: ['gpu', 'off'], desc: 'DiT 使用训练设备；文本编码器与 VAE 在 CPU 编码和解码。' };
  if (field.key === 'sample_cfg') return { ...field, defaultValue: 3 };
  if (field.key === 'sample_steps') return { ...field, defaultValue: 30 };
  if (field.key === 'sample_sampler') return { ...field, defaultValue: 'euler', options: ['euler'] };
  return field;
});

function sections(finetune) {
  const type = finetune ? 'moss-image-finetune' : 'moss-image-lora';
  return [
    sec('model-settings', 'model', 'MOSS-Image', '', [
      { key: 'model_train_type', type: 'hidden', defaultValue: type },
      { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', title: 'pretrained_model_name_or_path', label: '模型目录或 Transformer 权重', defaultValue: '' },
      folder('moss_image_text_encoder_path', 'Qwen3.5 文本编码器目录（可选）'),
      folder('moss_image_tokenizer_path', 'Tokenizer / Processor 目录（可选）'),
      folder('moss_image_processor_path', '视觉 Processor 目录（可选）'),
      folder('moss_image_vae_path', 'FLUX.2 VAE 目录（可选）'),
      { key: 'moss_image_comfy_int8_weights_rotated', type: 'select', label: 'INT8 权重旋转', title: 'moss_image_comfy_int8_weights_rotated', defaultValue: '', options: [{ value: '', label: '跟随权重元数据' }, { value: true, label: '反转 ConvRot' }, { value: false, label: '不反转' }] },
    ]),
    sec('dataset-settings', 'dataset', '图像与条件缓存', '使用同名图片与 caption；缓存与训练共用同一文本编码和 latent 布局。', [
      folder('train_data_dir', '训练素材目录'),
      { key: 'resolution', type: 'string', label: '训练分辨率', title: 'resolution', defaultValue: '1024,1024' },
      { key: 'caption_extension', type: 'string', label: 'Caption 扩展名', title: 'caption_extension', defaultValue: '.txt' },
      flag('cache_latents', '缓存 Latent', true),
      flag('cache_text_encoder_outputs', '缓存文本条件', true),
      number('moss_image_max_text_length', '最大文本长度', 4096, 1),
      { ...flag('moss_image_auto_json', 'Caption 转为原生布局 JSON'), desc: '纯本地包装为 summary/items JSON；已手写 JSON 只做规范化与画布边界校验。' },
      { ...flag('moss_image_prompt_upsample', 'LLM 上采样 Caption'), desc: '构建缓存时用视觉模型逐图生成带 bbox 的布局 JSON；严格失败，复用 caption_llm_* 凭据。' },
      { key: 'moss_image_prompt_upsampler_model_id', type: 'string', title: 'moss_image_prompt_upsampler_model_id', label: '上采样模型 ID（留空用 caption_llm_model）', defaultValue: '', visibleWhen: when('moss_image_prompt_upsample', true) },
      flag('moss_image_edit_mode', '参考图编辑训练'),
      { key: 'moss_image_reference_manifest', type: 'file', pickerType: 'file', title: 'moss_image_reference_manifest', label: '参考图清单 JSON', defaultValue: '', visibleWhen: when('moss_image_edit_mode', true) },
      flag('moss_image_isolate_references', '隔离参考图注意力'),
      number('moss_image_reference_max_pixels', '参考图最大像素数', 1048576, 256, 256),
      number('moss_image_vision_max_pixels', '视觉条件最大像素数', 147456, 4096, 256),
      number('dataloader_num_workers', 'DataLoader 进程数', 0),
    ]),
    ...(!finetune ? [sec('network-settings', 'network', 'LoRA', '', [
      ...MOSS_ADAPTER_FIELDS,
      { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 Adapter', title: 'network_weights', defaultValue: '' },
    ])] : []),
    sec('optimizer-settings', 'optimizer', '学习率与优化器', '', finetune ? S_LR_FT_DIT : S_LR_DIT),
    sec('training-settings', 'training', '训练参数', '', [
      ...S_TRAIN(10), number('seed', '训练种子', 42),
      { key: 'moss_image_timestep_sampling', type: 'select', title: 'moss_image_timestep_sampling', label: 'Sigma 分布', defaultValue: 'uniform', options: ['uniform', 'sigmoid', 'shift', 'logit_normal', 'logsnr'] },
      ...MOSS_FLOW_FIELDS,
      number('first_timestep_chance', '纯噪声时间步概率', 0, 0, 0.01),
      flag('ema_use_ema', 'EMA'), number('ema_decay', 'EMA 衰减', 0.999, 0, 0.0001),
      ...MOSS_EMA_FIELDS,
    ]),
    sec('moss-memory-settings', 'speed', '显存与计算', '', [
      { key: 'mixed_precision', type: 'select', title: 'mixed_precision', label: '混合精度', defaultValue: 'bf16', options: ['bf16', 'fp16', 'no'] },
      { key: 'moss_image_block_residency', type: 'select', title: 'moss_image_block_residency', label: 'DiT 块驻留', defaultValue: 'block_offload', options: ['resident', 'block_offload'] },
      number('moss_image_block_offload_gpu_slots', 'GPU 块槽位', 2, 1),
      number('moss_image_block_offload_prefetch_depth', '预取深度', 1),
      flag('moss_image_block_offload_pin_memory', '锁页内存'),
      ...(!finetune ? blockWeightCacheFields('moss_image_block_residency') : []),
      { ...flag('model_fused_qkv', '合并 QKV 投影'), desc: '标准 LoRA 的冻结底座可合并；DoRA 与全参投影保留原执行路径。' },
      ...(!finetune ? MOSS_MEMORY_FIELDS : MOSS_MEMORY_FIELDS.filter((field) => field.key === 'cpu_offload_checkpointing')),
    ]),
    sec('validation-settings', 'advanced', '验证与时间步诊断', '', MOSS_VALIDATION_FIELDS),
    sec('compile-settings', 'speed', '编译设置', '', [
      ...S_EXECUTION_BACKEND.filter((field) => !field.key.startsWith('thunder_')).map((field) => field.key === 'execution_backend'
        ? { ...field, options: (config) => field.options(config).filter((option) => option.value !== 'thunder') }
        : field),
      ...S_COMPILE_EXPERT.filter((field) => field.key !== 'compile_anima_full_core_enabled'),
    ]),
    sec('preview-settings', 'preview', '训练预览', '', [
      ...preview, number('moss_image_sample_shift', '采样 Shift', 5, 0.01, 0.1),
      { key: 'moss_image_preview_target', type: 'string', title: 'moss_image_preview_target', label: '预览参考组（目标图片相对路径）', defaultValue: '', desc: '留空使用参考图清单第一组。', visibleWhen: when('moss_image_edit_mode', true) },
    ]),
    sec('save-settings', 'model', '保存与恢复', '', S_SAVE.map((field) => field.key === 'output_name' ? { ...field, defaultValue: type } : field)),
    sec('system-settings', 'advanced', '系统设置', '', S_SYSTEM_ENV),
  ];
}

export const MOSS_IMAGE_LORA_SECTIONS = sections(false);
export const MOSS_IMAGE_FT_SECTIONS = sections(true);
