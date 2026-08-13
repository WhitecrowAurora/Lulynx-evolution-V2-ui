// MiniMax H3 keeps its audio/video and guidance-preserving contract separate
// from the image-only DiT schemas so unsupported distillation fields cannot leak in.
import { sec, when } from './schemaCommon.js';
import { S_LR_DIT, S_LR_FT_DIT, S_SAVE, S_TRAIN } from './schemaFieldGroups.js';

const H3_CHECKPOINT_OPTIONS = [
  { value: 'unsloth', label: 'Unsloth（推荐）' },
  { value: 'selective', label: 'Selective' },
  { value: 'full', label: 'Full recompute' },
];

function getMiniMaxH3CheckpointOptions(config = {}) {
  const swapEnabled = Number(config.h3_blocks_to_swap || 0) > 0;
  return H3_CHECKPOINT_OPTIONS.map((option) => (
    swapEnabled && option.value !== 'unsloth'
      ? { ...option, disabled: true, disabledReason: 'Block Swap 开启时不可用' }
      : option
  ));
}

const H3_SAVE_FIELDS = S_SAVE
  .filter((field) => !['merge_export', 'export_comfy_int8_base', 'export_comfy_int8_engine'].includes(field.key))
  .map((field) => {
    if (field.key === 'output_name') return { ...field, defaultValue: 'minimax-h3-lora' };
    if (field.key === 'output_dir') return { ...field, defaultValue: './output/minimax-h3' };
    return field;
  });

const H3_TRAIN_FIELDS = S_TRAIN(10).filter((field) => field.key !== 'gradient_checkpointing');
const H3_LR_FIELDS = S_LR_DIT.map((field) => (
  ['learning_rate', 'unet_lr'].includes(field.key)
    ? { ...field, defaultValue: '1e-5' }
    : field
));

const modelFields = (typeId) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'h3_partition', type: 'select', label: 'H3 分区', title: 'h3_partition', desc: 'FL2VA pruned 是当前低显存训练默认权重。', defaultValue: 'fl2va_pruned', options: [
    { value: 'fl2va_pruned', label: 'FL2VA Pruned（推荐）' },
    { value: 'fl2va', label: 'FL2VA Full' },
    { value: 'ref2va_pruned', label: 'Ref2VA Pruned' },
    { value: 'ref2va', label: 'Ref2VA Full' },
  ] },
  { key: 'h3_transformer_path', type: 'file', pickerType: 'model-file', label: 'H3 Transformer', title: 'h3_transformer_path', desc: 'MiniMax H3 Transformer 单文件权重。', defaultValue: '' },
  { key: 'h3_text_encoder_path', type: 'file', pickerType: 'model-file', label: 'Qwen3-VL 文本编码器', title: 'h3_text_encoder_path', desc: 'H3 使用的 Qwen3-VL 32B 文本编码器权重。', defaultValue: '' },
  { key: 'h3_video_vae_path', type: 'file', pickerType: 'model-file', label: 'H3 Video VAE', title: 'h3_video_vae_path', desc: 'H3 视频 VAE 权重。', defaultValue: '' },
  { key: 'h3_audio_vae_path', type: 'file', pickerType: 'model-file', label: 'H3 Audio VAE', title: 'h3_audio_vae_path', desc: 'H3 音频 VAE 权重。', defaultValue: '' },
];

const expansionFields = [
  { key: 'h3_depth_expansion_enabled', type: 'boolean', label: '扩展 Transformer 深度', title: 'h3_depth_expansion_enabled', desc: '交错复制 H3 block，并将新增层的输出投影置零为恒等残差。保存完整扩展底座。', defaultValue: false },
  { key: 'h3_depth_expansion_target_layers', type: 'number', label: '目标层数', title: 'h3_depth_expansion_target_layers', desc: '扩层后的 H3 Transformer block 总数。', defaultValue: 64, min: 2, step: 1, visibleWhen: when('h3_depth_expansion_enabled', true) },
  { key: 'h3_depth_expansion_train_scope', type: 'select', label: '训练范围', title: 'h3_depth_expansion_train_scope', desc: '选择只训练新增层、同时训练外围模块，或训练全部参数。', defaultValue: 'new_layers', visibleWhen: when('h3_depth_expansion_enabled', true), options: [
    { value: 'new_layers', label: '只训练新增层' },
    { value: 'new_layers_periphery', label: '新增层 + 外围模块' },
    { value: 'all', label: '全部参数' },
  ] },
];

const flowFields = [
  { key: 'h3_cfg_preservation_enabled', type: 'boolean', label: 'CFG 保真训练', title: 'h3_cfg_preservation_enabled', desc: '用无梯度 unconditional 分支恢复 raw conditional 目标，避免常规微调逐步解蒸馏；默认使用已验证的常数 CFG。', defaultValue: true },
  { key: 'h3_cfg_scale', type: 'number', label: 'CFG 强度', title: 'h3_cfg_scale', desc: 'H3 CFG 保真训练推荐值为 4。', defaultValue: 4.0, min: 1, max: 16, step: 0.1, visibleWhen: when('h3_cfg_preservation_enabled', true) },
  { key: 'h3_timestep_shift', type: 'number', label: '视频训练 Shift', title: 'h3_timestep_shift', desc: '训练 timestep 分布；12 对齐默认推理，8 可加强细节但可能削弱运动结构。', defaultValue: 12.0, min: 0.1, step: 0.1 },
  { key: 'h3_image_timestep_shift', type: 'number', label: '图片训练 Shift', title: 'h3_image_timestep_shift', desc: '单帧图片使用独立 timestep shift。', defaultValue: 1.0, min: 0.1, step: 0.1 },
  { key: 'h3_video_sigma_shift', type: 'number', label: '模型视频 Sigma 映射', title: 'h3_video_sigma_shift', desc: 'H3 checkpoint 固有视频映射，通常保持 12。', defaultValue: 12.0, min: 0.1, step: 0.1 },
  { key: 'h3_audio_sigma_shift', type: 'number', label: '模型音频 Sigma 映射', title: 'h3_audio_sigma_shift', desc: 'H3 checkpoint 固有音频映射，通常保持 3。', defaultValue: 3.0, min: 0.1, step: 0.1 },
  { key: 'h3_audio_loss_weight', type: 'number', label: '音频损失权重', title: 'h3_audio_loss_weight', desc: '音频样本存在时相对视频损失的权重；0 表示忽略音频损失。', defaultValue: 1.0, min: 0, step: 0.1 },
];

const datasetFields = [
  { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '原始素材 / H3 数据目录', title: 'train_data_dir', desc: '可选择图片或视频与同名 caption 的原始目录；已有 cache 时也可直接读取。', defaultValue: './output/lulynx' },
  { key: 'resolution', type: 'string', label: '训练分辨率', title: 'resolution', desc: '宽,高；16GB 显存建议先从 512,512 验证。', defaultValue: '512,512' },
  { key: 'caption_extension', type: 'string', label: 'Caption 扩展名', title: 'caption_extension', defaultValue: '.txt' },
  { key: 'h3_frame_count', type: 'number', label: '训练帧数', title: 'h3_frame_count', desc: '每个训练 clip 的帧数；39 适合低显存链路验证。', defaultValue: 39, min: 1, step: 1 },
  { key: 'h3_fps', type: 'number', label: '训练 FPS', title: 'h3_fps', desc: '音视频时间轴使用的帧率。', defaultValue: 24, min: 1, max: 60, step: 1 },
  { key: 'h3_tokenizer_path', type: 'folder', pickerType: 'folder', label: 'Qwen3-VL Processor 目录', title: 'h3_tokenizer_path', desc: '包含 tokenizer/config/processor 小文件；留空时从文本编码器同级模型目录自动解析。', defaultValue: '' },
  { key: 'h3_cache_build_enabled', type: 'boolean', label: '自动构建 H3 Cache', title: 'h3_cache_build_enabled', desc: 'cache 缺失时由真实 Qwen3-VL、Video VAE 和可选 Audio VAE 自动生成。', defaultValue: true },
  { key: 'h3_cache_dir', type: 'folder', pickerType: 'folder', label: 'H3 Cache 输出目录', title: 'h3_cache_dir', desc: '留空时写入素材目录下的 .h3_cache。', defaultValue: '', visibleWhen: when('h3_cache_build_enabled', true) },
  { key: 'h3_cache_rebuild', type: 'boolean', label: '重建已有 Cache', title: 'h3_cache_rebuild', desc: '忽略已有样本并重新编码。', defaultValue: false, visibleWhen: when('h3_cache_build_enabled', true) },
  { key: 'h3_cache_include_audio', type: 'boolean', label: '编码音频 Cache', title: 'h3_cache_include_audio', desc: '读取视频内嵌或同名侧挂音轨，裁齐视频 clip 后编码为 40 Hz 双声道 latent。', defaultValue: false, visibleWhen: when('h3_cache_build_enabled', true) },
  { key: 'h3_cache_max_pixels', type: 'number', label: 'Cache 最大像素数', title: 'h3_cache_max_pixels', desc: '编码前按像素预算等比缩放并对齐 H3 网格。', defaultValue: 262144, min: 1024, step: 1024, visibleWhen: when('h3_cache_build_enabled', true) },
  { key: 'h3_cache_max_samples', type: 'number', label: 'Cache 样本上限', title: 'h3_cache_max_samples', desc: '0 表示处理目录内全部有效样本。', defaultValue: 0, min: 0, step: 1, visibleWhen: when('h3_cache_build_enabled', true) },
  { key: 'dataloader_num_workers', type: 'number', label: 'DataLoader 线程数', title: 'dataloader_num_workers', desc: 'Windows 首次验证建议为 0。', defaultValue: 0, min: 0 },
];

const adapterFields = [
  { key: 'network_module', type: 'hidden', defaultValue: 'networks.lora' },
  { key: 'network_dim', type: 'number', label: 'Rank (Dim)', title: 'network_dim', defaultValue: 16, min: 1 },
  { key: 'network_alpha', type: 'number', label: 'Alpha', title: 'network_alpha', defaultValue: 16, min: 1 },
  { key: 'network_dropout', type: 'number', label: 'Dropout', title: 'network_dropout', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA', title: 'network_weights', desc: '可选的已有 H3 LoRA 权重。', defaultValue: '' },
];

const memoryFields = [
  { key: 'mixed_precision', type: 'select', label: '混合精度', title: 'mixed_precision', defaultValue: 'bf16', options: ['bf16', 'fp16', 'no'] },
  { key: 'h3_cache_latents', type: 'boolean', label: '缓存音视频 Latent', title: 'h3_cache_latents', desc: '预编码 Video/Audio VAE 输出，减少训练时显存与重复计算。', defaultValue: true },
  { key: 'h3_cache_text_encoder_outputs', type: 'boolean', label: '缓存文本编码器输出', title: 'h3_cache_text_encoder_outputs', desc: '预编码 conditional 与 unconditional 文本张量。', defaultValue: true },
  { key: 'h3_blocks_to_swap', type: 'number', label: '交换 Block 数', title: 'h3_blocks_to_swap', desc: '将 H3 block 交换到 CPU；16GB 默认交换 48 个。', defaultValue: 48, min: 0, max: 48, step: 1 },
  { key: 'h3_block_swap_strategy', type: 'select', label: 'Block Swap 策略', title: 'h3_block_swap_strategy', desc: 'Async 是 16GB 实测默认；Pipeline 会增加约 0.75GB reserved，当前没有吞吐收益。', defaultValue: 'async', options: [
    { value: 'async', label: 'Async（推荐）' },
    { value: 'pipeline', label: 'Pipeline（实验）' },
    { value: 'sync', label: 'Sync' },
    { value: 'auto', label: 'Auto' },
  ] },
  { key: 'h3_int8_gemm_mode', type: 'select', label: 'INT8 GEMM 模式', title: 'h3_int8_gemm_mode', desc: 'Oracle 是速度与数值默认；W8A16 可再省约 1.55GB reserved，但本机实测慢约 46%。', defaultValue: 'oracle', options: [
    { value: 'oracle', label: 'Oracle（推荐）' },
    { value: 'w8a16', label: 'W8A16 低显存' },
    { value: 'pure_torch', label: 'Pure Torch（实验）' },
    { value: 'auto', label: 'Auto' },
  ] },
  { key: 'h3_preserve_lora_master_dtype', type: 'boolean', label: 'FP32 LoRA Master', title: 'h3_preserve_lora_master_dtype', desc: '保持 LoRA 参数为 FP32，避免 BF16 小更新被量化吞掉；主干仍为 BF16/INT8。', defaultValue: true },
  { key: 'h3_checkpoint_mode', type: 'select', label: '激活检查点模式', title: 'h3_checkpoint_mode', desc: 'Block Swap 开启时必须使用 Unsloth；Full/Selective 仅适合所有 block 常驻 GPU 的诊断。', defaultValue: 'unsloth', options: getMiniMaxH3CheckpointOptions },
  { key: 'h3_activation_offload_min_tensor_mb', type: 'number', label: '激活卸载阈值 (MB)', title: 'h3_activation_offload_min_tensor_mb', desc: '只卸载达到该大小的保存张量。', defaultValue: 10.0, min: 0, step: 1 },
];

const common = (typeId, finetune) => [
  sec('model-settings', 'model', finetune ? 'MiniMax H3 全参微调' : 'MiniMax H3 模型', finetune ? '训练完整 H3 Transformer，或扩展深度后只训练新增层。' : 'H3 FL2VA 音视频 LoRA 所需的四个组件。', [...modelFields(typeId), ...(finetune ? expansionFields : [])]),
  sec('h3-flow-settings', 'training', 'H3 CFG 保真目标', '保持原生引导蒸馏能力，不加载 training adapter。', flowFields),
  sec('dataset-settings', 'dataset', 'H3 音视频数据', '优先使用预缓存的 latent 与文本编码器输出。', datasetFields),
  ...(finetune ? [] : [sec('adapter-settings', 'network', 'H3 LoRA', '仅训练 H3 主干注意力与前馈投影，不修改原生蒸馏适配器。', adapterFields)]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', finetune ? S_LR_FT_DIT : H3_LR_FIELDS),
  sec('training-settings', 'training', '训练参数', '', H3_TRAIN_FIELDS),
  sec('save-settings', 'model', '保存设置', '', H3_SAVE_FIELDS.map((field) => (
    field.key === 'output_name'
      ? { ...field, defaultValue: finetune ? 'minimax-h3-expanded' : 'minimax-h3-lora' }
      : field
  ))),
  sec('h3-memory-settings', 'speed', 'H3 低显存运行时', '缓存、Block Swap 与激活检查点共用 H3 原生运行时。', memoryFields),
];

export const MINIMAX_H3_LORA_SECTIONS = common('minimax-h3-lora', false);
export const MINIMAX_H3_FT_SECTIONS = common('minimax-h3-finetune', true);
