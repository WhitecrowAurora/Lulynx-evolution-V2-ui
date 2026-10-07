// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// ================================================================
// schemaFieldGroups.js — 训练 Schema 共享字段组 + 跨族 Section 模板
// 这里集中所有被「2 个以上训练族」复用的 S_* 字段数组,以及跨族共享的
// section/field 构造器(概念编辑 / Finetune / ControlNet / Textual Inversion)。
// 各族 schema 文件(animaSchema / sdxlSchema / otherSchemas)从这里 spread 复用。
//
// 命名沿用历史(如 S_SPEED_SDXL / S_LULYNX_SDXL / ANIMA_BLOCK_RESIDENCY_FIELDS)——
// 名字标示语义来源,但它们实际被多个族消费,故归入公共组件库,勿据名误判归属:
//   · S_SPEED_SDXL / S_SPEED_SD15 被共享的 conceptEditSections 同时消费
//   · ANIMA_BLOCK_RESIDENCY_FIELDS 同时被 anima-lora 与 flux-finetune 消费
//   · S_LULYNX_SDXL 被 sdxl / anima / flux-ft / newbie 消费
// 依赖方向:schemaCommon → 本文件 → 各族文件 → schemaIndex(单向,无环)。
// ================================================================
import { OPTIMIZER_SPECIFIC_FIELDS } from './features/optimizerParams.js';
import { HUB_STATE_SAVE_FIELDS } from './hubStateFields.js';
import { LTX23_AUDIO_FIELDS } from './ltx23AudioFields.js';
import { S_CONCEPT_EDIT_CURRICULUM } from './schemaFrontierGroups.js';
import {
  when, all, oneOf, sec, netLora,
  swapEnabled, nonResidentBlockMode, lycorisNetworkSelected,
  schedulerOptions, ALL_SCHEDULERS, ALL_OPTIMIZERS, TARGET_LORA_OPTIMIZERS,
  OPTIMIZER_BACKEND_OPTIONS, OPTIMIZER_BACKEND_OPTIONS_FINETUNE, ADVANCED_OPTIMIZER_STRATEGY_OPTIONS,
  ACCELERATION_PROFILE_OPTIONS, COMPILE_RUNTIME_OPTIONS, WINDOW_ATTENTION_BACKEND_OPTIONS,
  DATA_TRANSFER_PROFILE_MODE_OPTIONS, LOSS_PRECISION_OPTIONS,
  COMPILE_SHAPE_STRATEGY_OPTIONS, COMPILE_TARGET_STRATEGY_OPTIONS,
  CACHED_COLLATE_MODE_OPTIONS, DATA_BACKEND_OPTIONS, CHECKPOINT_POLICY_OPTIONS,
  LORA_RECOMPUTE_OPTIONS, DIT_BLOCK_RESIDENCY_OPTIONS,
  PCIE_TRANSFER_FORMAT_FIELD, sparseSwapFields, pcieDeltaCacheField, pcieDeltaCacheModeFields, vortexRuntimeFields,
  FUSED_PROJECTION_MEMORY_MODE_OPTIONS, BLOCK_SWAP_STRATEGY_OPTIONS,
  SAFEGUARD_GRADIENT_SCAN_OPTIONS, IMAGE_DECODE_BACKEND_OPTIONS,
} from './schemaCommon.js';

// 专家模式且顶栏 TurboCore(CUDA) 关闭时才显示优化器后端 / Lulynx Triton。
// turbocore_enabled 由 optimizerToggle 同步进 config。
const expertAndNotTurboCore = (config) => (
  config.performance_expert_mode === true
  && !config.turbocore_enabled
);

const sageattnBackendSelected = (c) => {
  const ab = String(c.attention_backend || 'auto').trim().toLowerCase();
  return ab === 'sageattn' || c.sageattn === true;
};

const executionBackendIs = (value) => (config) => (
  String(config.execution_backend || 'optimized').trim().toLowerCase().replaceAll('-', '_') === value
);
const LEGACY_BACKEND_FIELD_HIDDEN = () => false;

// quant_train_mode 已从下拉(dequant/keep_w8)改为布尔开关(开=keep_w8)。
// 兼容老草稿里的字符串值,布尔 true 或 legacy 'keep_w8' 均视为开启。
const isKeepW8Mode = (value) => value === true
  || String(value ?? '').trim().toLowerCase() === 'keep_w8';

// value 必须与后端 core/contracts/execution_backend.py 的 EXECUTION_BACKENDS 逐字一致，
// 否则 executionBackendIs() 门控的 compile/thunder 子字段会永久隐藏。
export const EXECUTION_BACKEND_OPTIONS = [
  { value: 'optimized', label: '优化运行时（默认）' },
  { value: 'eager', label: 'eager（不做图编译）' },
  { value: 'thunder', label: 'Thunder（推荐的编译后端）' },
  { value: 'torch_compile', label: 'torch.compile' }
];
// torch.compile 子项：UI 用 dynamo_backend（后端 alias → torch_compile_backend），并补 mode。
const TORCH_COMPILE_MODE_OPTIONS = [
  { value: 'default', label: 'default（推荐）' },
  { value: 'reduce-overhead', label: 'reduce-overhead（降启动开销）' },
  { value: 'max-autotune', label: 'max-autotune（稳态最快，首次最慢）' }
];
const torchCompileExtras = () => [
  { key: 'dynamo_backend', type: 'select', label: 'torch.compile 后端', title: 'dynamo_backend', desc: '写入 torch_compile_backend。', defaultValue: 'inductor', options: ['eager', 'aot_eager', 'inductor', 'cudagraphs'], visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_mode', type: 'select', label: 'torch.compile 模式', title: 'torch_compile_mode', desc: '传给 torch.compile(mode=)。', defaultValue: 'default', options: TORCH_COMPILE_MODE_OPTIONS, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_dynamic', type: 'boolean', label: 'torch.compile dynamic', title: 'torch_compile_dynamic', desc: '允许动态 shape。（更稳）。', defaultValue: false, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_fullgraph', type: 'boolean', label: 'torch.compile fullgraph', title: 'torch_compile_fullgraph', desc: '要求整图无 graph break。失败则回退。', defaultValue: false, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_scope', type: 'select', label: 'torch.compile 作用域', title: 'torch_compile_scope', desc: '空=跟随 runtime', defaultValue: '', options: [
    { value: '', label: '默认（跟随 runtime）' },
    { value: 'per_block', label: 'per_block' },
    { value: 'full', label: 'full' }
  ], visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_allow_full_with_per_block', type: 'boolean', label: '允许 full+per_block 混用', title: 'torch_compile_allow_full_with_per_block', desc: '高级：full 与 per_block 策略并存时不拦截。', defaultValue: false, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_fallback_enabled', type: 'boolean', label: 'Compile 失败回退', title: 'torch_compile_fallback_enabled', desc: '开启时编译失败回退 eager 并打 warning 日志；关闭后编译失败将直接报错（fail-fast）而非静默回退。', defaultValue: true, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'torch_compile_first_step_timeout', type: 'number', label: '首步编译超时 (s)', title: 'torch_compile_first_step_timeout', desc: '首步编译超时秒数；0=禁用', defaultValue: 300, min: 0, step: 10, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'compile_probe_enabled', type: 'boolean', label: 'Compile Probe', title: 'compile_probe_enabled', desc: '编译前先做短 probe；不达标则回退。', defaultValue: true, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'compile_probe_steps', type: 'number', label: 'Probe 步数', title: 'compile_probe_steps', desc: 'probe 采样步数', defaultValue: 3, min: 1, step: 1, visibleWhen: all(executionBackendIs('torch_compile'), when('compile_probe_enabled', true)) },
  { key: 'compile_probe_max_vram_increase_ratio', type: 'number', label: 'Probe 显存涨幅上限', title: 'compile_probe_max_vram_increase_ratio', desc: '相对基线显存涨幅超过该比例则判定 probe 失败。', defaultValue: 0.15, min: 0, step: 0.01, visibleWhen: all(executionBackendIs('torch_compile'), when('compile_probe_enabled', true)) },
  { key: 'compile_probe_min_speedup_ratio', type: 'number', label: 'Probe 最低加速比', title: 'compile_probe_min_speedup_ratio', desc: '稳态加速低于该比例则回退', defaultValue: 0.03, min: 0, step: 0.01, visibleWhen: all(executionBackendIs('torch_compile'), when('compile_probe_enabled', true)) },
  { key: 'compile_contract_strict', type: 'boolean', label: 'Compile 严格契约', title: 'compile_contract_strict', desc: '训练前强制路由安全门。默认开启', defaultValue: true, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'compile_static_shape_drop_last', type: 'boolean', label: '静态 shape 丢弃尾批', title: 'compile_static_shape_drop_last', desc: '静态 compile 需要固定 batch 时丢弃不完整 batch。', defaultValue: true, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'compile_require_cache_first', type: 'boolean', label: '要求 cache-first', title: 'compile_require_cache_first', desc: '静态/full compile 路线要求 latent/文本已缓存。', defaultValue: true, visibleWhen: executionBackendIs('torch_compile') }
];

export const S_EXECUTION_BACKEND = [
  { key: 'execution_backend', type: 'select', label: '训练执行后端', title: 'execution_backend', desc: '默认优化运行时不做图编译；需要编译时优先选择 Thunder。', defaultValue: 'optimized', options: EXECUTION_BACKEND_OPTIONS },
  { key: 'execution_backend_allow_fallback', type: 'boolean', label: '执行后端失败自动回退', title: 'execution_backend_allow_fallback', desc: 'Thunder/torch.compile 不可用或不安全时回退到优化运行时。', defaultValue: true, visibleWhen: oneOf('execution_backend', ['thunder', 'torch_compile']) },
  { key: 'compile_runtime', type: 'select', label: 'Compile 运行策略', title: 'compile_runtime', desc: 'torch.compile 运行时路径。', defaultValue: 'off', options: COMPILE_RUNTIME_OPTIONS, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'compile_cache_enabled', type: 'boolean', label: 'Compile 缓存', title: 'compile_cache_enabled', desc: '启用 torch.compile 图缓存，跨 run 复用编译结果。', defaultValue: true, visibleWhen: executionBackendIs('torch_compile') },
  { key: 'compile_cache_root', type: 'string', label: 'Compile 缓存目录', title: 'compile_cache_root', desc: '编译缓存根目录（相对输出或绝对路径）。', defaultValue: 'backend/cache/compile', visibleWhen: all(executionBackendIs('torch_compile'), when('compile_cache_enabled', true)) },
  { key: 'compile_cache_reuse', type: 'boolean', label: '复用 Compile 缓存', title: 'compile_cache_reuse', desc: '允许从磁盘复用已有编译缓存', defaultValue: true, visibleWhen: all(executionBackendIs('torch_compile'), when('compile_cache_enabled', true)) },
  { key: 'compile_cache_prewarm', type: 'boolean', label: 'Compile 缓存预热', title: 'compile_cache_prewarm', desc: '训练前主动预热编译缓存。', defaultValue: false, visibleWhen: all(executionBackendIs('torch_compile'), when('compile_cache_enabled', true)) },
  { key: 'thunder_jit_executors', type: 'select', label: 'Thunder 执行器', title: 'thunder_jit_executors', desc: 'nvFuser + SDPA 是推荐组合；torchcompile executor 仅实验使用。', defaultValue: 'nvfuser,sdpa', options: [
    { value: 'nvfuser,sdpa', label: 'nvfuser + sdpa' }
  ], visibleWhen: executionBackendIs('thunder') },
  { key: 'thunder_jit_cache_enabled', type: 'boolean', label: 'Thunder 编译缓存', title: 'thunder_jit_cache_enabled', desc: '按模型、dtype、rank、shape、执行器与 RNG 契约隔离缓存。', defaultValue: true, visibleWhen: executionBackendIs('thunder') },
  { key: 'thunder_jit_cache_root', type: 'string', label: 'Thunder 缓存目录', title: 'thunder_jit_cache_root', desc: 'Thunder 编译缓存根目录。', defaultValue: 'backend/cache/compile', visibleWhen: all(executionBackendIs('thunder'), when('thunder_jit_cache_enabled', true)) },
  { key: 'thunder_jit_warmup_enabled', type: 'boolean', label: 'Thunder 预编译', title: 'thunder_jit_warmup_enabled', desc: '训练前执行代表 shape 的 warmup。', defaultValue: false, visibleWhen: executionBackendIs('thunder') },
  { key: 'thunder_jit_progress_enabled', type: 'boolean', label: 'Thunder 编译进度', title: 'thunder_jit_progress_enabled', desc: '显示编译、缓存命中与局部回退状态。', defaultValue: true, visibleWhen: executionBackendIs('thunder') },
  { key: 'thunder_jit_enabled', type: 'boolean', label: '旧版 Thunder 开关', title: 'thunder_jit_enabled', desc: '仅保留旧配置迁移。', defaultValue: false, visibleWhen: LEGACY_BACKEND_FIELD_HIDDEN },
  { key: 'torch_compile', type: 'boolean', label: '旧版 torch.compile 开关', title: 'torch_compile', desc: '仅保留旧配置迁移。', defaultValue: false, visibleWhen: LEGACY_BACKEND_FIELD_HIDDEN },
  ...torchCompileExtras()
];

// --- compile expert knobs (peeled from S_DIT_PERFORMANCE_EXPERT; mount via compile-settings) ---
export const S_COMPILE_EXPERT = [
  { key: '__ui_group_compile_expert_collapsed', type: 'ui_group', label: '高级 Compile 策略已收起', desc: '收起态的折叠组占位，展开后逐项配置 torch.compile 高级编译策略。', visibleWhen: when('performance_expert_mode', false) },
  { key: 'compile_shape_strategy', type: 'select', label: 'Compile Shape 策略', title: 'compile_shape_strategy', desc: 'compile 输入 shape 策略', defaultValue: 'auto', options: COMPILE_SHAPE_STRATEGY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'compile_target_strategy', type: 'select', label: 'Compile Target 策略', title: 'compile_target_strategy', desc: 'auto 按模块能力探测', defaultValue: 'auto', options: COMPILE_TARGET_STRATEGY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'compile_inductor_tuning', type: 'select', label: 'Inductor 融合调优', title: 'compile_inductor_tuning', desc: 'torch.compile inductor 融合与自动调优策略', defaultValue: 'off', options: ['off', 'epilogue', 'max_autotune', 'aggressive'], visibleWhen: all(when('performance_expert_mode', true), executionBackendIs('torch_compile')) },
  { key: 'compile_anima_full_core_enabled', type: 'boolean', label: 'Anima Full-Core Compile', title: 'compile_anima_full_core_enabled', desc: '将整个 Anima DiT 编译为单图（非逐块）', defaultValue: false, visibleWhen: all(when('performance_expert_mode', true), executionBackendIs('torch_compile')) },
  { key: 'torch_compile_block_indices', type: 'string', label: 'Compile Block 索引', title: 'torch_compile_block_indices', desc: 'per_block 模式下仅编译指定 block，如 "0,3,5-8"；留空=全部 block。', defaultValue: '', visibleWhen: all(when('performance_expert_mode', true), executionBackendIs('torch_compile')) },
  { key: 'activation_memory_budget', type: 'number', label: '激活显存预算', title: 'activation_memory_budget', desc: 'AOT partitioner 重计算上限 (0,1]；0=关闭。梯度检查点开启时跳过。', defaultValue: 0, min: 0, max: 1, step: 0.05, visibleWhen: when('performance_expert_mode', true) },
  { key: 'sdpa_backend_policy', type: 'select', label: 'SDPA 后端策略', title: 'sdpa_backend_policy', desc: 'attention 解析为 SDPA 时选用的 kernel 策略。', defaultValue: 'cutlass', options: [
    { value: 'auto', label: 'auto' },
    { value: 'cutlass', label: 'cutlass' },
    { value: 'flash', label: 'flash' },
    { value: 'cudnn', label: 'cudnn' },
    { value: 'math', label: 'math' }
  ], visibleWhen: when('performance_expert_mode', true) },
  { key: 'sageattn_drift_check_interval', type: 'number', label: 'SageAttn 漂移检测间隔', title: 'sageattn_drift_check_interval', desc: '每 N 步对比 SageAttn 与 SDPA 输出；0=关闭。', defaultValue: 0, min: 0, step: 1, visibleWhen: all(when('performance_expert_mode', true), sageattnBackendSelected) },
  { key: 'sageattn_drift_threshold', type: 'number', label: 'SageAttn 漂移阈值', title: 'sageattn_drift_threshold', desc: '相对误差超过该阈值时触发 warning 或 fallback。', defaultValue: 0.01, min: 0, step: 0.001, visibleWhen: all(when('performance_expert_mode', true), sageattnBackendSelected, (c) => Number(c.sageattn_drift_check_interval || 0) > 0) },
  { key: 'sageattn_drift_fallback', type: 'select', label: 'SageAttn 漂移回退', title: 'sageattn_drift_fallback', desc: 'warn=仅日志；fallback_sdpa=切换为 SDPA。', defaultValue: 'warn', options: [
    { value: 'warn', label: 'warn（仅警告）' },
    { value: 'fallback_sdpa', label: 'fallback_sdpa（回退 SDPA）' }
  ], visibleWhen: all(when('performance_expert_mode', true), sageattnBackendSelected, (c) => Number(c.sageattn_drift_check_interval || 0) > 0) }
];

// --- module offload single source (CORE/EXPERT + MEMORY shell for sequential/VAE) ---
export const S_MODULE_OFFLOAD_CORE = [
  // 后端 master 是 module_offload_enabled；子项必须挂在真父键上
  { key: 'module_offload_enabled', type: 'boolean', label: '模块级 Offload', desc: '按比例让冻结的 Linear / Conv 模块常驻 CPU', defaultValue: false },
  { key: 'module_offload_ratio', type: 'number', label: '模块 Offload 比例', desc: '0-100，参与 offload 的可管理模块占比（不是目标显存占比）。', defaultValue: 0, min: 0, max: 100, visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_backbone_ratio', type: 'number', label: '主干覆盖比例', desc: '可选 0-100；留空则继承总比例。', defaultValue: '', min: 0, max: 100, visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_text_encoder_ratio', type: 'number', label: '文本编码器覆盖比例', desc: '可选 0-100；留空则继承总比例。', defaultValue: '', min: 0, max: 100, visibleWhen: when('module_offload_enabled', true) }
];

export const S_MODULE_OFFLOAD_EXPERT = [
  ...S_MODULE_OFFLOAD_CORE,
  { key: 'module_offload_enhanced', type: 'boolean', label: '增强模块 Offload', desc: '使用增强的模块 offload 策略（更智能的调度）。', defaultValue: false, visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_profile', type: 'select', label: 'Module Offload 配置', desc: '预设的 offload 策略', defaultValue: 'balanced', options: [
    { value: 'balanced', label: 'Balanced (平衡)' },
    { value: 'aggressive', label: 'Aggressive (激进省显存)' },
    { value: 'conservative', label: 'Conservative (保守快速)' }
], visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_profile_enabled', type: 'boolean', label: '启用 Offload Profile', desc: '启用预设的 offload 配置（vs 手动配置）。', defaultValue: true, visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_min_param_mb', type: 'number', label: 'Offload 最小参数大小（MB）', desc: '只有参数大于此值的模块才会被 offload（避免小模块频繁传输的开销）。', defaultValue: 10, min: 1, step: 1, visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_include_patterns', type: 'textarea', label: 'Offload 包含模式', desc: '要 offload 的模块名称模式（逗号分隔）。', defaultValue: '', visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_exclude_patterns', type: 'textarea', label: 'Offload 排除模式', desc: '不要 offload 的模块名称模式（逗号分隔）。', defaultValue: '', visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_prefetch_enabled', type: 'boolean', label: '启用 Offload 预取', desc: '提前预取下一个要用的模块（减少等待时间）。', defaultValue: true, visibleWhen: when('module_offload_enabled', true) },
  { key: 'module_offload_prefetch_mode', type: 'select', label: 'Offload 预取模式', desc: 'experimental=实验性预取（当前唯一支持的模式）。', defaultValue: 'experimental', options: [
    { value: 'experimental', label: 'Experimental (实验性)' }
], visibleWhen: all(when('module_offload_enabled', true), when('module_offload_prefetch_enabled', true)) },
  { key: 'module_offload_verify_state', type: 'boolean', label: '验证 Offload 状态', desc: '每次传输后验证模块状态正确性（会降低性能）。', defaultValue: false, visibleWhen: when('module_offload_enabled', true) }
];

// 极端内存模式：把冻结底座的权威副本放到磁盘 mmap，用 IO 换 RAM。
// 挂在 module_offload_enabled 下，因为落盘层就是搭在模块 offload 上的，
// 单开落盘而不开 module offload 没有任何东西可落。
export const S_EXTREME_MEMORY = [
  { key: 'tiered_residency_spill_enabled', type: 'boolean', label: '极端内存模式（磁盘换内存）', desc: '把冻结底座权重的权威副本放到磁盘，用 IO 换 RAM。给加不起内存条的小内存机器用；步时会变慢（实测 anima 约 1.9 倍）。', defaultValue: false, visibleWhen: when('module_offload_enabled', true) },
  { key: 'tiered_residency_spill_root', type: 'text', label: '落盘目录', desc: '留空 = 系统临时目录。强烈建议指到 NVMe SSD；机械盘或 U 盘上这条路必然负收益。', defaultValue: '', visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_allow_backbone', type: 'boolean', label: '允许底座落盘', desc: '开启后 DiT 主干块才会真正落盘——这是省 RAM 的大头。关闭时只有 VAE / 文本编码器落盘，省不了多少。仅对冻结权重生效。', defaultValue: false, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_active_eviction', type: 'boolean', label: '主动踢出内存页', desc: '权重拷进显存后立刻把对应的内存页还给系统，而不是等系统自己回收。这是"宁可频繁读磁盘也不让系统写页面文件"的关键开关，也是保护 SSD 寿命的那一步。', defaultValue: false, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_page_lookahead', type: 'number', label: '预读提前块数', desc: '提前几个块开始把内存页读回来。缺页是 4KB 且同步的，不预读的话一个块要缺页几万次。', defaultValue: 2, min: 0, max: 8, step: 1, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true), when('tiered_residency_spill_active_eviction', true)) },
  { key: 'tiered_residency_spill_allow_text_encoders', type: 'boolean', label: '允许文本编码器落盘', desc: '默认开。文本编码器读得少，落盘代价低。', defaultValue: true, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_allow_vae', type: 'boolean', label: '允许 VAE 落盘', desc: '默认开。VAE 只在编解码时用到，落盘代价低。', defaultValue: true, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_prefer_copy', type: 'boolean', label: '强制自写副本（慢盘模型）', desc: '默认关。关闭时优先直接映射原始模型文件里逐位相同的那段，省掉开场那次全量写盘。如果模型在慢盘、而落盘目录在快盘，打开它：宁可开场写一次到快盘，也别让每个块都从慢盘读。', defaultValue: false, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_min_free_gb', type: 'number', label: '磁盘保留空间（GB）', desc: '落盘后至少要留这么多空闲空间，不够就回落到内存而不是把盘写满。', defaultValue: 4, min: 0, max: 512, step: 1, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) },
  { key: 'tiered_residency_spill_cleanup', type: 'boolean', label: '训练结束清理落盘文件', desc: '关掉会留下几 GB 落盘文件；只有排查问题时才需要关。', defaultValue: true, visibleWhen: all(when('module_offload_enabled', true), when('tiered_residency_spill_enabled', true)) }
];

// VAE 分块。单独成组：除了「内存与 Offload」，anima 各训练类型的「速度优化」页也要用它。
export const S_VAE_TILING = [
  { key: 'vae_tiling', type: 'boolean', label: 'VAE 分块', desc: 'VAE 分块解码。anima 预览实测：解码峰值 2123 → 1033 MB（省 2.05×），代价是 1.16× 解码时间。显存紧张时建议打开。', defaultValue: false }
];

// vae_slicing 的默认值必须与后端保持 true。它按 batch 维切开逐张过 VAE，所以 batch=1 时
// 是彻底的 no-op（实测峰值逐 MiB 相同），batch>1 才省显存；4070 Ti SUPER / 1024px / bf16
// 实测 batch=4 编码峰值 6343 → 1738 MiB、解码 8391 → 2650 MiB，代价是编码 +4.5%（解码反而
// 更快，大块分配的压力没了）。batch=8 不开时解码峰值 16609 MiB 越过 16 GiB 卡会走驱动换页。
export const S_VAE_MEMORY = [
  { key: 'vae_slicing', type: 'boolean', label: 'VAE 切片', desc: 'VAE 编码/解码时按 batch 切开逐张处理（省显存）。batch=1 是位级无操作；batch=4 干净卡实测省 4.6～5.7 GiB 峰值，编码略慢、解码稳定快约两成，合计净快约 220ms/批。', defaultValue: true },
  ...S_VAE_TILING
];

export const S_MEMORY_OFFLOAD = [
  { key: 'enable_sequential_cpu_offload', type: 'boolean', label: '启用顺序 CPU Offload', desc: '将模型组件顺序 offload 到 CPU，仅在需要时加载到', defaultValue: false },
  ...S_MODULE_OFFLOAD_EXPERT,
  ...S_EXTREME_MEMORY,
  { key: 'cpu_offload_checkpointing_mode', type: 'select', label: 'CPU Offload Checkpointing 模式', desc: '梯度检查点与 CPU offload 结合模式', defaultValue: 'none', options: [
    { value: 'none', label: 'None (不结合)' },
    { value: 'auto', label: 'Auto (自动)' },
    { value: 'full', label: 'Full (完整 offload)' }
] },
  { key: 'cpu_offload_checkpointing_pool_gb', type: 'number', label: 'CPU Offload Checkpointing 池大小（GB）', desc: 'CPU 端用于存储检查点的内存池大小。', defaultValue: 4, min: 1, max: 64, step: 1, visibleWhen: (c) => c.cpu_offload_checkpointing_mode && c.cpu_offload_checkpointing_mode !== 'none' },
  ...S_VAE_MEMORY
];

// ================================================================
// 共享字段组 S_*
// ================================================================
export const S_LOSS_AWARE_LR = [
  { key: 'loss_scheduler_ema_alpha', type: 'number', label: 'Loss 平滑系数', title: 'loss_scheduler_ema_alpha', desc: '用 EMA 平滑原始 loss，避免单个 batch', defaultValue: 0.1, min: 0, max: 1, step: 0.01, visibleWhen: oneOf('lr_scheduler', ['loss_gated_cosine', 'loss_weighted_annealed_cosine']) },
  { key: 'loss_scheduler_min_delta', type: 'number', label: '有效下降阈值', title: 'loss_scheduler_min_delta', desc: 'EMA loss 至少下降这么多才算“仍在变好”。', defaultValue: 0.0005, min: 0, step: 0.00001, visibleWhen: oneOf('lr_scheduler', ['loss_gated_cosine', 'loss_weighted_annealed_cosine']) },
  { key: 'loss_scheduler_relative_delta', type: 'number', label: '相对下降阈值', title: 'loss_scheduler_relative_delta', desc: '按最佳 EMA loss 的比例判断有效下降。', defaultValue: 0.001, min: 0, max: 1, step: 0.0001, visibleWhen: oneOf('lr_scheduler', ['loss_gated_cosine', 'loss_weighted_annealed_cosine']) },
  { key: 'loss_scheduler_patience', type: 'number', label: '平台期等待步数', title: 'loss_scheduler_patience', desc: '连续多少个 optimizer step 没有有效下降后，才继续推进余弦相位。', defaultValue: 8, min: 1, step: 1, visibleWhen: oneOf('lr_scheduler', ['loss_gated_cosine', 'loss_weighted_annealed_cosine']) },
  { key: 'loss_scheduler_cooldown', type: 'number', label: '冷却步数', title: 'loss_scheduler_cooldown', desc: '刚出现有效下降后，先忽略多少步平台期判断，减少来回抖动。', defaultValue: 0, min: 0, step: 1, visibleWhen: oneOf('lr_scheduler', ['loss_gated_cosine', 'loss_weighted_annealed_cosine']) },
  { key: 'loss_scheduler_max_hold_steps', type: 'number', label: '最长锁定步数', title: 'loss_scheduler_max_hold_steps', desc: '连续不推进余弦相位的最大步数', defaultValue: 0, min: 0, step: 1, visibleWhen: oneOf('lr_scheduler', ['loss_gated_cosine', 'loss_weighted_annealed_cosine']) },
  { key: 'loss_scheduler_late_gamma', type: 'number', label: '后期 Loss 权重曲线', title: 'loss_scheduler_late_gamma', desc: '仅用于 Loss 加权退火余弦', defaultValue: 2.0, min: 0.01, step: 0.1, visibleWhen: when('lr_scheduler', 'loss_weighted_annealed_cosine') },
  { key: 'loss_scheduler_lock_weight_threshold', type: 'number', label: '锁定权重阈值', title: 'loss_scheduler_lock_weight_threshold', desc: '仅用于 Loss 加权退火余弦', defaultValue: 0.7, min: 0, max: 1, step: 0.05, visibleWhen: when('lr_scheduler', 'loss_weighted_annealed_cosine') },
  { key: 'loss_scheduler_min_advance_ratio', type: 'number', label: '最小推进速度', title: 'loss_scheduler_min_advance_ratio', desc: '仅用于 Loss 加权退火余弦', defaultValue: 0.25, min: 0, max: 1, step: 0.05, visibleWhen: when('lr_scheduler', 'loss_weighted_annealed_cosine') }
];

export const S_DIT_PERFORMANCE_EXPERT = [
  { key: 'performance_expert_mode', type: 'boolean', label: '性能专家模式', title: 'performance_expert_mode', desc: '启用高级性能选项（TurboCore 优化器加速、Native 优化器等）。', defaultValue: false },
  { key: 'acceleration_profile', type: 'select', label: '模型加速档位', title: 'acceleration_profile', desc: '按当前模型族做加速预检与档位建议', defaultValue: 'off', options: ACCELERATION_PROFILE_OPTIONS },
  { key: 'experimental_attention_profile_enabled', type: 'boolean', label: 'Sliding Window Attention', title: 'experimental_attention_profile_enabled', desc: '窗口注意力。auto 会优先尊重启动器/预检解析后的 attention', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'experimental_attention_profile_window', type: 'number', label: '窗口大小', title: 'experimental_attention_profile_window', desc: '每个 token 可关注的历史窗口大小。', defaultValue: 100, min: 10, visibleWhen: all(when('performance_expert_mode', true), when('experimental_attention_profile_enabled', true)) },
  { key: 'experimental_attention_profile_backend', type: 'select', label: '窗口注意力后端', title: 'experimental_attention_profile_backend', desc: 'auto 优先使用启动器/预检传入的 attention 参数', defaultValue: 'auto', options: WINDOW_ATTENTION_BACKEND_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), when('experimental_attention_profile_enabled', true)) },
  { key: 'experimental_attention_profile_torch_max_tokens', type: 'number', label: 'Torch 回退最大 Token', title: 'experimental_attention_profile_torch_max_tokens', desc: '防止纯 PyTorch O(n²) fallback 在长序列误跑。', defaultValue: 2048, min: 128, visibleWhen: all(when('performance_expert_mode', true), when('experimental_attention_profile_enabled', true), when('experimental_attention_profile_backend', 'torch_fallback')) },
  { key: 'data_transfer_profile_enabled', type: 'boolean', label: '数据传输 Profiling', title: 'data_transfer_profile_enabled', desc: '采样 CPU/GPU tensor 传输耗时。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'data_transfer_profile_mode', type: 'select', label: '传输计时模式', title: 'data_transfer_profile_mode', desc: 'event 使用 CUDA events 延迟同步', defaultValue: 'event', options: DATA_TRANSFER_PROFILE_MODE_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), when('data_transfer_profile_enabled', true)) },
  { key: 'data_transfer_profile_window', type: 'number', label: '传输采样窗口', title: 'data_transfer_profile_window', desc: '每累计多少次传输输出一次汇总', defaultValue: 50, min: 1, visibleWhen: all(when('performance_expert_mode', true), when('data_transfer_profile_enabled', true)) },
  { key: 'loss_precision', type: 'select', label: 'Loss 精度策略', title: 'loss_precision', desc: 'fp32_loss 保持当前稳定路径', defaultValue: 'fp32_loss', options: LOSS_PRECISION_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'cached_collate_mode', type: 'select', label: '缓存数据 Collate', title: 'cached_collate_mode', desc: '仅影响 Anima/Newbie cache-first 数据集。', defaultValue: 'auto', options: CACHED_COLLATE_MODE_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'data_backend', type: 'select', label: '数据后端', title: 'data_backend', desc: 'auto/caption 当前继续走 CaptionDataset', defaultValue: 'auto', options: DATA_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'prefetch_factor', type: 'number', label: 'DataLoader 预取批次', title: 'prefetch_factor', desc: 'DataLoader 预取的 batch 数量。', defaultValue: 2, min: 1, max: 8, step: 1, visibleWhen: when('performance_expert_mode', true) },
  { key: 'checkpoint_policy', type: 'select', label: 'Checkpoint 策略', title: 'checkpoint_policy', desc: '梯度检查点策略（auto/full/offloaded/selective）', defaultValue: 'auto', options: CHECKPOINT_POLICY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'stochastic_depth_enabled', type: 'boolean', label: '随机深度训练', title: 'stochastic_depth_enabled', desc: '训练时随机跳过部分 DiT block 以加速训练并提供正则化效果。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'stochastic_depth_survival_prob', type: 'number', label: '随机深度保留概率', title: 'stochastic_depth_survival_prob', desc: '每层被保留（不跳过）的概率', defaultValue: 0.8, min: 0.5, max: 1.0, step: 0.05, visibleWhen: all(when('performance_expert_mode', true), when('stochastic_depth_enabled', true)) },
  { key: 'stochastic_depth_decay', type: 'boolean', label: '随机深度随层衰减', title: 'stochastic_depth_decay', desc: '开启后深层 block 更容易被跳过；关闭则各层用同一保留概率。', defaultValue: true, visibleWhen: all(when('performance_expert_mode', true), when('stochastic_depth_enabled', true)) },
  { key: 'stochastic_depth_min_blocks_kept', type: 'number', label: '最少保留 Block 数', title: 'stochastic_depth_min_blocks_kept', desc: '始终保留前 N 个 block，防止网络过浅导致训练不稳。', defaultValue: 4, min: 0, step: 1, visibleWhen: all(when('performance_expert_mode', true), when('stochastic_depth_enabled', true)) }
];

// ── Gradient Release / Optimizer State Paging（显存卫生）──────────────────────
export const S_GRADIENT_RELEASE = [
  { key: 'gradient_release_enabled', type: 'boolean', label: '梯度释放', title: 'gradient_release_enabled', desc: '按参数释放梯度以降低峰值梯度显存。', defaultValue: true },
  { key: 'gradient_release_mode', type: 'select', label: '梯度释放模式', title: 'gradient_release_mode', desc: '反向完成即释放梯度的模式，降低显存峰值（full/compatible 分档）。', defaultValue: 'compatible', options: [
    { value: 'compatible', label: 'compatible' }
  ], visibleWhen: when('gradient_release_enabled', true) },
  { key: 'gradient_release_grad_clip_mode', type: 'select', label: '梯度裁剪模式', title: 'gradient_release_grad_clip_mode', desc: 'exact=精确全局范数裁剪但会降低显存优化(gas=1时+183MB,gas=4时+91MB); per_param=按参数裁剪保留显存优化但为近似全局范数; report_only=仅报告范数不裁剪', defaultValue: 'exact', options: [
    { value: 'exact', label: 'exact（精确，默认）' },
    { value: 'per_param', label: 'per_param（省显存，近似）' },
    { value: 'report_only', label: 'report_only（仅报告）' }
  ], visibleWhen: when('gradient_release_enabled', true) },
  { key: 'gradient_release_downgrade_reason', type: 'string', label: '梯度释放降级原因', title: 'gradient_release_downgrade_reason', desc: '只读：后端自动降级时写入原因（通常为空）。', defaultValue: '', visibleWhen: when('gradient_release_enabled', true) }
];

export const S_OPTIMIZER_STATE_PAGING = [
  { key: 'optimizer_state_paging_enabled', type: 'boolean', label: '优化器状态分页', title: 'optimizer_state_paging_enabled', desc: '大优化器状态张量在 step 间停泊到 CPU。', defaultValue: false },
  { key: 'optimizer_state_paging_min_tensor_mb', type: 'number', label: '分页最小张量 (MB)', title: 'optimizer_state_paging_min_tensor_mb', desc: '仅分页大于该体积的状态张量', defaultValue: 1.0, min: 0, step: 0.5, visibleWhen: when('optimizer_state_paging_enabled', true) },
  { key: 'optimizer_state_paging_storage_device', type: 'select', label: '状态驻留设备', title: 'optimizer_state_paging_storage_device', desc: 'CPU=在 step 间释放状态显存；参数设备=保持原 optimizer 驻留。', defaultValue: 'cpu', options: [{ value: 'cpu', label: 'CPU' }, { value: 'param_device', label: '参数设备' }], visibleWhen: when('optimizer_state_paging_enabled', true) },
  { key: 'optimizer_state_paging_storage_dtype', type: 'select', label: '状态驻留精度', title: 'optimizer_state_paging_storage_dtype', desc: '只压缩 CPU 驻留副本；step 前恢复原计算精度。', defaultValue: 'preserve', options: [{ value: 'preserve', label: '保持原精度' }, { value: 'bf16', label: 'BF16' }, { value: 'fp16', label: 'FP16' }, { value: 'fp32', label: 'FP32' }], visibleWhen: when('optimizer_state_paging_enabled', true) },
  { key: 'optimizer_state_paging_pin_memory', type: 'boolean', label: '分页 pin_memory', title: 'optimizer_state_paging_pin_memory', desc: '使用持久 pinned CPU mirror 与独立 CUDA copy stream。', defaultValue: false, visibleWhen: when('optimizer_state_paging_enabled', true) },
  { key: 'blockwise_fused_optimizers', type: 'boolean', label: '优化器状态分块分页', title: 'blockwise_fused_optimizers', desc: '把优化器状态分页的粒度降到每次一个 block：step 期只有当前 block 的 optimizer state 回到参数设备，峰值从全模型 state 降到单个 block（8 block 骨干实测 12.5%），数学逐位不变（分批靠临时置空其余梯度，不换优化器）。需先开「优化器状态分页」且驻留设备为 CPU；跨 param group 归约的优化器（如 Prodigy）会自动退回整份换入。', defaultValue: false, visibleWhen: when('optimizer_state_paging_enabled', true) }
];

// AutoProdigy 子项：optimizer_type 选 AutoProdigy 时显示
const autoProdigySelected = (cfg) => {
  const key = String(cfg.optimizer_type || '').trim().toLowerCase();
  return key === 'autoprodigy' || key === 'auto_prodigy';
};
export const S_AUTO_PRODIGY = [
  { key: 'auto_prodigy_profile', type: 'select', label: 'AutoProdigy 档位', title: 'auto_prodigy_profile', desc: 'safe/balanced/aggressive 预设', defaultValue: 'balanced', options: [
    { value: 'safe', label: 'safe' },
    { value: 'balanced', label: 'balanced' },
    { value: 'aggressive', label: 'aggressive' },
    { value: 'custom', label: 'custom' }
  ], visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_d0', type: 'number', label: 'AutoProdigy d0', title: 'auto_prodigy_d0', desc: '初始步长估计', defaultValue: 1e-6, min: 0, step: 1e-7, visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_d_coef', type: 'number', label: 'AutoProdigy d_coef', title: 'auto_prodigy_d_coef', desc: 'd 系数，影响自适应学习率大小', defaultValue: 1.0, min: 0, step: 0.1, visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_growth_rate', type: 'number', label: 'AutoProdigy growth_rate', title: 'auto_prodigy_growth_rate', desc: 'd 增长上限倍率', defaultValue: 1.02, min: 1, step: 0.01, visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_max_update_rms_ratio', type: 'number', label: 'AutoProdigy max update RMS', title: 'auto_prodigy_max_update_rms_ratio', desc: '更新 RMS 相对权重上限', defaultValue: 0.01, min: 0, step: 0.001, visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_damping', type: 'number', label: 'AutoProdigy damping', title: 'auto_prodigy_damping', desc: '阻尼系数', defaultValue: 1.0, min: 0, step: 0.1, visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_beta3', type: 'number', label: 'AutoProdigy beta3', title: 'auto_prodigy_beta3', desc: '第三动量系数', defaultValue: 0.99, min: 0, max: 0.9999, step: 0.01, visibleWhen: autoProdigySelected },
  { key: 'auto_prodigy_safeguard_warmup', type: 'boolean', label: 'AutoProdigy 预热保护', title: 'auto_prodigy_safeguard_warmup', desc: '预热阶段保护自适应步长', defaultValue: true, visibleWhen: autoProdigySelected }
];

export const ANIMA_BLOCK_RESIDENCY_FIELDS = [
  { key: 'lora_activation_recompute_mode', type: 'select', label: 'LoRA 分支重算', title: 'lora_activation_recompute_mode', desc: '降低原生 DiT LoRA 反传激活峰值。', defaultValue: 'auto', options: LORA_RECOMPUTE_OPTIONS },
  { key: 'anima_block_residency', type: 'select', label: 'Anima Block Offload', title: 'anima_block_residency', desc: '冻结 DiT 权重放 CPU 内存降低显存；resident 优先速度。', defaultValue: 'resident', options: DIT_BLOCK_RESIDENCY_OPTIONS },
  { key: 'anima_block_residency_min_params', type: 'number', label: 'Anima Offload 最小参数量', title: 'anima_block_residency_min_params', desc: '只托管参数量达到该阈值的冻结 Linear。0 表示不过滤。', defaultValue: 0, min: 0, visibleWhen: nonResidentBlockMode('anima_block_residency') },
  { key: 'anima_vram_optimizer', type: 'boolean', label: '显存优化器', title: 'anima_vram_optimizer', desc: 'Anima packed/varlen 显存优化意图。仅在 FlashAttention 2 后端下可用；开启后会请求 packed varlen attention，并自动采用最省显存的 checkpointing。', defaultValue: false, requiresAttentionBackend: 'flash2' },
  { key: 'anima_block_checkpointing', type: 'boolean', label: 'Anima 梯度检查点（分块重算）', title: 'anima_block_checkpointing', desc: '降低反传激活显存占用；会增加重算时间。', defaultValue: false },
  { key: 'anima_block_checkpointing_mode', type: 'select', label: 'Checkpointing 模式', title: 'anima_block_checkpointing_mode', desc: 'block 整块重算最省显存；selective 显存略高但重算更快。', defaultValue: 'block', options: ['block', 'selective'], visibleWhen: when('anima_block_checkpointing', true) },
  { key: 'anima_block_checkpointing_interval', type: 'number', label: 'Checkpointing 间隔', title: 'anima_block_checkpointing_interval', desc: '每 N 个 DiT block 设一个检查点。', defaultValue: 1, min: 1, max: 8, step: 1, visibleWhen: when('anima_block_checkpointing', true) },
  { key: 'anima_block_prefetch', type: 'boolean', label: 'Anima Block 预取', title: 'anima_block_prefetch', desc: '训练时提前把后续 Transformer block 搬入 GPU，掩盖 CPU→GPU 搬运延迟。', defaultValue: false, visibleWhen: nonResidentBlockMode('anima_block_residency') },
  { key: 'anima_block_prefetch_depth', type: 'number', label: 'Anima 预取深度', title: 'anima_block_prefetch_depth', desc: '向前预取几个 block', defaultValue: 1, min: 1, max: 8, step: 1, visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('anima_block_prefetch', true)) },
  { key: 'anima_block_prefetch_mode', type: 'select', label: 'Anima 预取模式', title: 'anima_block_prefetch_mode', desc: 'Block 预取的调度模式，控制搬运与计算的重叠方式。', defaultValue: 'original', options: [
    { value: 'original', label: 'original（固定深度）' },
    { value: 'adaptive', label: 'adaptive（自适应）' }
  ], visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('anima_block_prefetch', true)) },
  { key: 'anima_block_offload_enabled', type: 'boolean', label: 'Anima Block LRU Offload', title: 'anima_block_offload_enabled', desc: '按 block 的 LRU 换出：只保留活跃 block 在显存，其余换到内存；与 anima_block_residency=streaming_offload 互斥。', defaultValue: false, visibleWhen: nonResidentBlockMode('anima_block_residency') },
  { key: 'anima_block_offload_gpu_slots', type: 'number', label: 'LRU GPU 槽位数', title: 'anima_block_offload_gpu_slots', desc: '同时保留在 GPU 上的 block 数（当前 block 加最近用过的若干个，按 LRU 淘汰）。', defaultValue: 3, min: 1, max: 16, step: 1, visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('anima_block_offload_enabled', true)) },
  { key: 'anima_block_offload_prefetch_depth', type: 'number', label: 'LRU 预取深度', title: 'anima_block_offload_prefetch_depth', desc: '前向/反向各异步预取 N 个 block。', defaultValue: 1, min: 0, max: 8, step: 1, visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('anima_block_offload_enabled', true)) },
  { ...PCIE_TRANSFER_FORMAT_FIELD, visibleWhen: nonResidentBlockMode('anima_block_residency') },
  ...vortexRuntimeFields('anima_block_residency'),
  pcieDeltaCacheField('anima_block_residency'),
  ...pcieDeltaCacheModeFields('anima_block_residency'),
  ...sparseSwapFields('anima_block_residency'),
  { key: 'activation_compression_enabled', type: 'boolean', label: '激活压缩', title: 'activation_compression_enabled', desc: '压缩激活降低显存占用', defaultValue: false },
  { key: 'activation_compression_dtype', type: 'select', label: '激活压缩精度', title: 'activation_compression_dtype', desc: 'fp16/bf16 较稳；fp8_e4m3 显存减半但有损。', defaultValue: 'fp16', options: ['fp16', 'bf16', 'fp8_e4m3'], visibleWhen: when('activation_compression_enabled', true) },
  { key: 'activation_compression_min_tensor_mb', type: 'number', label: '激活压缩最小体积 MB', title: 'activation_compression_min_tensor_mb', desc: '只压缩达到该体积的激活张量，小张量不值得压。', defaultValue: 1.0, min: 0, step: 0.5, visibleWhen: when('activation_compression_enabled', true) },
  { key: 'activation_cpu_offload_enabled', type: 'boolean', label: '激活 CPU Offload', title: 'activation_cpu_offload_enabled', desc: '大激活搬到 CPU 内存降低显存。可与 interval>1 组合。', defaultValue: false },
  { key: 'activation_cpu_offload_min_tensor_mb', type: 'number', label: 'Offload 最小体积 MB', title: 'activation_cpu_offload_min_tensor_mb', desc: '只卸载达到该体积的激活', defaultValue: 1.0, min: 0, step: 0.5, visibleWhen: when('activation_cpu_offload_enabled', true) },
  { key: 'activation_cpu_offload_pool_gb', type: 'number', label: 'Offload Pinned 池 GB', title: 'activation_cpu_offload_pool_gb', desc: 'CPU pinned 内存池大小。', defaultValue: 1.0, min: 0.1, step: 0.1, visibleWhen: when('activation_cpu_offload_enabled', true) },
  // Progressive full finetune / rematerializable（Anima 专家；default-off）
  { key: 'anima_progressive_full_finetune_enabled', type: 'boolean', label: '渐进式全参解冻', title: 'anima_progressive_full_finetune_enabled', desc: '按 schedule 逐步解冻 DiT block 做 full', defaultValue: false },
  { key: 'anima_progressive_full_finetune_schedule', type: 'string', label: '渐进解冻 schedule', title: 'anima_progressive_full_finetune_schedule', desc: '例：0:24-27,100:16-27,200:all', defaultValue: '', visibleWhen: when('anima_progressive_full_finetune_enabled', true) },
  { key: 'anima_progressive_full_finetune_default', type: 'string', label: '渐进解冻默认范围', title: 'anima_progressive_full_finetune_default', desc: 'schedule 未命中时的默认 block 范围，如 all。', defaultValue: 'all', visibleWhen: when('anima_progressive_full_finetune_enabled', true) },
  { key: 'anima_rematerializable_block_enabled', type: 'boolean', label: '可重物化 Block', title: 'anima_rematerializable_block_enabled', desc: 'profile-only 原型：可重物化 block', defaultValue: false },
  { key: 'anima_rematerializable_block_mode', type: 'select', label: '可重物化模式', title: 'anima_rematerializable_block_mode', desc: '当前仅 profile_only。', defaultValue: 'profile_only', options: [{ value: 'profile_only', label: 'profile_only' }], visibleWhen: when('anima_rematerializable_block_enabled', true) }
];

// Krea-2 block/layer offload 全套（仅 krea2-lora 挂载）
export const KREA2_OFFLOAD_FIELDS = [
  { key: 'krea2_block_residency', type: 'select', label: 'Krea2 Block 驻留', title: 'krea2_block_residency', desc: '常驻 GPU 的 Krea2 Transformer block 数量，其余驻 CPU 按需换入。', defaultValue: 'block_offload', options: [
    { value: 'resident', label: 'resident（全驻留 GPU）' },
    { value: 'block_offload', label: 'block_offload（自适应卸载）' },
    // 下方 krea2_layer_offload_* 全组以此值为可见性锚点；缺了它那组字段永久隐藏。
    { value: 'layer_offload', label: 'layer_offload（逐层卸载）' }
  ]},
  { key: 'krea2_block_offload_min_param_mb', type: 'number', label: 'Block Offload 最小参数 MB', title: 'krea2_block_offload_min_param_mb', desc: '小于该体积的 block 不 offload。', defaultValue: 100.0, min: 0, step: 1, visibleWhen: when('krea2_block_residency', 'block_offload') },
  { key: 'krea2_block_offload_gpu_slots', type: 'number', label: 'Block Offload GPU 槽位', title: 'krea2_block_offload_gpu_slots', desc: '同时保留在 GPU 的 block 数。', defaultValue: 4, min: 1, max: 32, step: 1, visibleWhen: when('krea2_block_residency', 'block_offload') },
  { key: 'krea2_block_offload_prefetch_depth', type: 'number', label: 'Block Offload 预取深度', title: 'krea2_block_offload_prefetch_depth', desc: '异步预取后续 block 数', defaultValue: 2, min: 0, max: 8, step: 1, visibleWhen: when('krea2_block_residency', 'block_offload') },
  { key: 'krea2_block_offload_pin_memory', type: 'boolean', label: 'Block Offload Pin Memory', title: 'krea2_block_offload_pin_memory', desc: 'CPU 侧 pinned 缓冲，加速 H2D。', defaultValue: true, visibleWhen: when('krea2_block_residency', 'block_offload') },
  { key: 'krea2_resident_block_count', type: 'number', label: '常驻 Block 数', title: 'krea2_resident_block_count', desc: '始终留在 GPU 的 block 数；0=按策略自动。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.krea2_block_residency !== 'resident' },
  { key: 'krea2_layer_offload_ratio', type: 'number', label: 'Layer Offload 比例 %', title: 'krea2_layer_offload_ratio', desc: '参与 layer offload 的比例。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_layer_offload_min_param_mb', type: 'number', label: 'Layer Offload 最小参数 MB', title: 'krea2_layer_offload_min_param_mb', desc: '小于该体积不 offload', defaultValue: 0.0, min: 0, step: 0.5, visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_layer_offload_prefetch_depth', type: 'number', label: 'Layer Offload 预取深度', title: 'krea2_layer_offload_prefetch_depth', desc: 'layer 路径预取深度', defaultValue: 1, min: 0, max: 8, step: 1, visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_layer_offload_pin_memory', type: 'boolean', label: 'Layer Offload Pin Memory', title: 'krea2_layer_offload_pin_memory', desc: 'layer 路径是否 pin CPU 缓冲。', defaultValue: false, visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_layer_offload_resident_ratio', type: 'number', label: 'Layer 常驻比例 %', title: 'krea2_layer_offload_resident_ratio', desc: '始终驻留 GPU 的层比例', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_layer_offload_include_patterns', type: 'string', label: 'Layer Offload 包含模式', title: 'krea2_layer_offload_include_patterns', desc: '逗号分隔模块名模式，默认 blocks.*。', defaultValue: 'blocks.*', visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_layer_offload_exclude_patterns', type: 'string', label: 'Layer Offload 排除模式', title: 'krea2_layer_offload_exclude_patterns', desc: '逗号分隔排除模式', defaultValue: '', visibleWhen: when('krea2_block_residency', 'layer_offload') },
  { key: 'krea2_block_offload_ratio', type: 'number', label: 'Block Offload 比例 %', title: 'krea2_block_offload_ratio', desc: '参与 block offload 的比例（0–100）。100 表示尽可能多 block 走 offload。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('krea2_block_residency', 'block_offload') }
];

// FLUX.2 Klein block offload（仅 flux2-lora；无 layer_offload / vram_preset）
// 默认 slots=4 / prefetch=3 / pin=true（16G@1024 真机验证）；低显存可降 slots。
export const FLUX2_OFFLOAD_FIELDS = [
  { key: 'flux2_block_residency', type: 'select', label: 'FLUX.2 Block 驻留', title: 'flux2_block_residency', desc: '常驻 GPU 的 FLUX.2 Transformer block 数量，其余驻 CPU 按需换入。', defaultValue: 'block_offload', options: [
    { value: 'resident', label: 'resident（全驻留 GPU）' },
    { value: 'block_offload', label: 'block_offload（自适应卸载）' }
  ]},
  { key: 'flux2_block_offload_min_param_mb', type: 'number', label: 'Block Offload 最小参数 MB', title: 'flux2_block_offload_min_param_mb', desc: '小于该体积的 block 不 offload。', defaultValue: 50.0, min: 0, step: 1, visibleWhen: when('flux2_block_residency', 'block_offload') },
  { key: 'flux2_block_offload_gpu_slots', type: 'number', label: 'Block Offload GPU 槽位', title: 'flux2_block_offload_gpu_slots', desc: '同时保留在 GPU 的 block 数。', defaultValue: 4, min: 1, max: 32, step: 1, visibleWhen: when('flux2_block_residency', 'block_offload') },
  { key: 'flux2_block_offload_prefetch_depth', type: 'number', label: 'Block Offload 预取深度', title: 'flux2_block_offload_prefetch_depth', desc: '异步预取后续 block 数。默认 3（与 slots=4 配对）。', defaultValue: 3, min: 0, max: 8, step: 1, visibleWhen: when('flux2_block_residency', 'block_offload') },
  { key: 'flux2_block_offload_pin_memory', type: 'boolean', label: 'Block Offload Pin Memory', title: 'flux2_block_offload_pin_memory', desc: 'CPU 侧 pinned 缓冲，加速 H2D', defaultValue: true, visibleWhen: when('flux2_block_residency', 'block_offload') },
  { key: 'flux2_block_offload_ratio', type: 'number', label: 'Block Offload 比例 %', title: 'flux2_block_offload_ratio', desc: '参与 block offload 的比例（0–100）。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('flux2_block_residency', 'block_offload') }
];

// Boogu-Image block offload（默认 resident / Layer Offload OFF，对齐 RunComfy）
// Z-Image block offload (default block_offload for large DiT)
export const ZIMAGE_OFFLOAD_FIELDS = [
  { key: 'zimage_block_residency', type: 'select', label: 'Z-Image Block 驻留', title: 'zimage_block_residency', desc: '常驻 GPU 的 Z-Image Transformer block 数量，其余驻 CPU 按需换入。', defaultValue: 'block_offload', options: [
    { value: 'resident', label: 'resident（全驻留 GPU）' },
    { value: 'block_offload', label: 'block_offload（自适应卸载）' }
  ]},
  { key: 'zimage_block_offload_min_param_mb', type: 'number', label: 'Block Offload 最小参数 MB', title: 'zimage_block_offload_min_param_mb', desc: '小于该参数量 block 不 offload。', defaultValue: 50.0, min: 0, step: 1, visibleWhen: when('zimage_block_residency', 'block_offload') },
  { key: 'zimage_block_offload_gpu_slots', type: 'number', label: 'Block Offload GPU 槽位', title: 'zimage_block_offload_gpu_slots', desc: '同时驻留在 GPU 的 block 数。', defaultValue: 4, min: 1, max: 32, step: 1, visibleWhen: when('zimage_block_residency', 'block_offload') },
  { key: 'zimage_block_offload_prefetch_depth', type: 'number', label: 'Block Offload 预取深度', title: 'zimage_block_offload_prefetch_depth', desc: '异步预取后续 block 数', defaultValue: 2, min: 0, max: 8, step: 1, visibleWhen: when('zimage_block_residency', 'block_offload') },
  { key: 'zimage_block_offload_pin_memory', type: 'boolean', label: 'Block Offload Pin Memory', title: 'zimage_block_offload_pin_memory', desc: 'CPU 侧 pinned 缓存，加速 H2D。', defaultValue: true, visibleWhen: when('zimage_block_residency', 'block_offload') },
  { key: 'zimage_block_offload_ratio', type: 'number', label: 'Block Offload 比例 %', title: 'zimage_block_offload_ratio', desc: '参与 block offload 的比例（0–100）。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('zimage_block_residency', 'block_offload') }
];

export const WAN22_OFFLOAD_FIELDS = [
  { key: 'wan22_block_residency', type: 'select', label: 'Wan2.2 Block 驻留', title: 'wan22_block_residency', desc: '常驻 GPU 的 Wan2.2 Transformer block 数量，其余驻 CPU 按需换入。', defaultValue: 'block_offload', options: [
    { value: 'resident', label: 'resident' },
    { value: 'block_offload', label: 'block_offload' }
  ]},
  { key: 'wan22_block_offload_ratio', type: 'number', label: 'Block Offload 比例 %', title: 'wan22_block_offload_ratio', desc: '参与 offload 的 block 比例（0-100）。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('wan22_block_residency', 'block_offload') },
  { key: 'wan22_block_offload_min_param_mb', type: 'number', label: 'Block Offload 最小参数 MB', title: 'wan22_block_offload_min_param_mb', desc: '小于该参数量 block 不 offload。', defaultValue: 50.0, min: 0, step: 1, visibleWhen: when('wan22_block_residency', 'block_offload') },
  { key: 'wan22_block_offload_gpu_slots', type: 'number', label: 'Block Offload GPU 槽位', title: 'wan22_block_offload_gpu_slots', desc: '同时驻留在 GPU 的 block 数。', defaultValue: 4, min: 1, max: 32, step: 1, visibleWhen: when('wan22_block_residency', 'block_offload') },
  { key: 'wan22_block_offload_prefetch_depth', type: 'number', label: 'Block Offload 预取深度', title: 'wan22_block_offload_prefetch_depth', desc: '异步预取后续 block 数量', defaultValue: 2, min: 0, max: 8, step: 1, visibleWhen: when('wan22_block_residency', 'block_offload') },
  { key: 'wan22_block_offload_pin_memory', type: 'boolean', label: 'Block Offload Pin Memory', title: 'wan22_block_offload_pin_memory', desc: 'CPU 侧 pinned 缓存，加速 H2D。', defaultValue: true, visibleWhen: when('wan22_block_residency', 'block_offload') }
];

export const LTX23_OFFLOAD_FIELDS = [
  { key: 'ltx23_block_residency', type: 'select', label: 'LTX-2.x Block 驻留', title: 'ltx23_block_residency', desc: '22B 建议 block_offload', defaultValue: 'block_offload', options: [
    { value: 'resident', label: 'resident' },
    { value: 'block_offload', label: 'block_offload' }
  ]},
  { key: 'ltx23_block_offload_ratio', type: 'number', label: 'Block Offload 比例 %', title: 'ltx23_block_offload_ratio', desc: '参与 offload 的 block 比例（0-100）。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('ltx23_block_residency', 'block_offload') },
  { key: 'ltx23_block_offload_min_param_mb', type: 'number', label: 'Block Offload 最小参数 MB', title: 'ltx23_block_offload_min_param_mb', desc: '小于该参数量 block 不 offload。', defaultValue: 50.0, min: 0, step: 1, visibleWhen: when('ltx23_block_residency', 'block_offload') },
  { key: 'ltx23_block_offload_gpu_slots', type: 'number', label: 'Block Offload GPU 槽位', title: 'ltx23_block_offload_gpu_slots', desc: '22B 建议 2', defaultValue: 2, min: 1, max: 32, step: 1, visibleWhen: when('ltx23_block_residency', 'block_offload') },
  { key: 'ltx23_block_offload_prefetch_depth', type: 'number', label: 'Block Offload 预取深度', title: 'ltx23_block_offload_prefetch_depth', desc: '异步预取后续 block 数量', defaultValue: 1, min: 0, max: 8, step: 1, visibleWhen: when('ltx23_block_residency', 'block_offload') },
  { key: 'ltx23_block_offload_pin_memory', type: 'boolean', label: 'Block Offload Pin Memory', title: 'ltx23_block_offload_pin_memory', desc: 'CPU 侧 pinned 缓存，加速 H2D。', defaultValue: true, visibleWhen: when('ltx23_block_residency', 'block_offload') }
];

export const BOOGU_OFFLOAD_FIELDS = [
  { key: 'boogu_block_residency', type: 'select', label: 'Boogu Block 驻留', title: 'boogu_block_residency', desc: '默认 resident（Layer Offload 关闭，全部 block 常驻显存）；block_offload 在内存与显存之间流式搬运。', defaultValue: 'resident', options: [
    { value: 'resident', label: 'resident（全驻留 GPU）' },
    { value: 'block_offload', label: 'block_offload（OOM 再开）' }
  ] },
  { key: 'native_resume_save_precision', type: 'select', label: 'Native Resume 保存精度', title: 'native_resume_save_precision', desc: '原生续训伴生文件默认使用 FP32；FP16/BF16 可减小文件。', defaultValue: 'float', options: ['float', 'fp16', 'bf16'] },
  { key: 'boogu_block_offload_ratio', type: 'number', label: 'Block Offload 比例 %', title: 'boogu_block_offload_ratio', desc: '参与 offload 的 block 比例（0-100）。', defaultValue: 100, min: 0, max: 100, step: 1, visibleWhen: when('boogu_block_residency', 'block_offload') },
  { key: 'boogu_block_offload_min_param_mb', type: 'number', label: 'Block Offload 最小参数 MB', title: 'boogu_block_offload_min_param_mb', desc: '小于该体积的 block 不 offload。', defaultValue: 50.0, min: 0, step: 1, visibleWhen: when('boogu_block_residency', 'block_offload') },
  { key: 'boogu_block_offload_gpu_slots', type: 'number', label: 'Block Offload GPU 槽位', title: 'boogu_block_offload_gpu_slots', desc: '同时保留在 GPU 的 block 数。', defaultValue: 4, min: 1, max: 32, step: 1, visibleWhen: when('boogu_block_residency', 'block_offload') },
  { key: 'boogu_block_offload_prefetch_depth', type: 'number', label: 'Block Offload 预取深度', title: 'boogu_block_offload_prefetch_depth', desc: '异步预取后续 block 数', defaultValue: 2, min: 0, max: 8, step: 1, visibleWhen: when('boogu_block_residency', 'block_offload') },
  { key: 'boogu_block_offload_pin_memory', type: 'boolean', label: 'Block Offload Pin Memory', title: 'boogu_block_offload_pin_memory', desc: 'CPU 侧 pinned 缓冲', defaultValue: true, visibleWhen: when('boogu_block_residency', 'block_offload') }
];

// 缓存 DataLoader 策略（cache-first 路线）
export const S_CACHED_DATALOADER = [
  { key: 'cached_dataloader_auto_policy', type: 'boolean', label: '缓存 DataLoader 自动策略', title: 'cached_dataloader_auto_policy', desc: '缓存路线自动调 workers/prefetch', defaultValue: true },
  { key: 'cached_dataloader_workers', type: 'string', label: '缓存 DataLoader workers', title: 'cached_dataloader_workers', desc: 'auto 或显式整数', defaultValue: 'auto', visibleWhen: when('cached_dataloader_auto_policy', false) },
  { key: 'cached_dataloader_prefetch_factor', type: 'string', label: '缓存 prefetch_factor', title: 'cached_dataloader_prefetch_factor', desc: 'auto 或显式整数', defaultValue: 'auto', visibleWhen: when('cached_dataloader_auto_policy', false) },
  { key: 'cached_dataloader_pin_memory', type: 'string', label: '缓存 pin_memory', title: 'cached_dataloader_pin_memory', desc: 'auto / true / false。', defaultValue: 'auto', visibleWhen: when('cached_dataloader_auto_policy', false) }
];

// 量化 / QLoRA / bitsandbytes
// rank_comp 是量化的附属档：没有量化就没有可回补的残差。
const RANK_COMP_ON = (c) => Boolean((c.quantization_enabled || c.training_quantization_enabled) && c.rank_comp_enabled)

export const S_QUANTIZATION = [
  { key: 'quantization_enabled', type: 'boolean', label: '训练量化 (QLoRA 等)', title: 'quantization_enabled', desc: '对底模启用量化加载（如 qlora_nf4）。', defaultValue: false },
  // 白名单见后端 quantization/quantization_config.py：{qlora_nf4,int8,fp8}。
  // 真正的 FP4 开关是下方独立字段 bnb_4bit_quant_type，不是这里。
  { key: 'quantization_type', type: 'select', label: '量化类型', title: 'quantization_type', desc: '量化后端类型', defaultValue: 'qlora_nf4', options: [
    { value: 'qlora_nf4', label: 'qlora_nf4' },
    { value: 'int8', label: 'int8' }
  ], visibleWhen: when('quantization_enabled', true) },
  { key: 'quantization_offload_optimizer_states', type: 'boolean', label: '量化时 offload 优化器状态', title: 'quantization_offload_optimizer_states', desc: '省显存，略慢', defaultValue: false, visibleWhen: when('quantization_enabled', true) },
  { key: 'quantization_target_suffixes', type: 'string', label: '量化目标后缀', title: 'quantization_target_suffixes', desc: '逗号分隔模块后缀；空=默认策略', defaultValue: '', visibleWhen: when('quantization_enabled', true) },
  // 覆盖率修正把 anima 从 28.1% 提到 84.2%、newbie 从 0.0% 提到 89.3%。
  // 这一档只给"要接着复现旧 NF4 产物"的人，默认关——旧行为是静默失效不是设计。
  { key: 'quantization_legacy_target_tables', type: 'boolean', label: '沿用旧版量化目标表', title: 'quantization_legacy_target_tables', desc: '退回覆盖率修正之前的后缀表，只为复现旧产物；新训练不要开（anima 少量化 56 个百分点的参数，newbie 等于没量化）', defaultValue: false, visibleWhen: (c) => c.quantization_enabled || c.training_quantization_enabled },
  { key: 'training_quantization_enabled', type: 'boolean', label: '训练量化别名开关', title: 'training_quantization_enabled', desc: '与 quantization_enabled', defaultValue: false },
  { key: 'training_quantization_type', type: 'select', label: '训练量化类型（别名）', title: 'training_quantization_type', desc: '兼容字段', defaultValue: 'qlora_nf4', options: [
    { value: 'qlora_nf4', label: 'qlora_nf4' }
  ], visibleWhen: when('training_quantization_enabled', true) },
  { key: 'bnb_4bit_compute_dtype', type: 'select', label: 'bnb 4bit 计算精度', title: 'bnb_4bit_compute_dtype', desc: 'bitsandbytes 计算 dtype。', defaultValue: 'bfloat16', options: ['bfloat16', 'float16', 'float32'], visibleWhen: (c) => c.quantization_enabled || c.training_quantization_enabled },
  { key: 'bnb_4bit_quant_type', type: 'select', label: 'bnb 4bit 量化类型', title: 'bnb_4bit_quant_type', desc: 'nf4 / fp4', defaultValue: 'nf4', options: ['nf4', 'fp4'], visibleWhen: (c) => c.quantization_enabled || c.training_quantization_enabled },
  { key: 'bnb_4bit_use_double_quant', type: 'boolean', label: 'bnb 双重量化', title: 'bnb_4bit_use_double_quant', desc: '二次量化压缩量化常量', defaultValue: true, visibleWhen: (c) => c.quantization_enabled || c.training_quantization_enabled },
  { key: 'bnb_4bit_quant_storage', type: 'select', label: 'bnb 量化存储类型', title: 'bnb_4bit_quant_storage', desc: '量化权重存储 dtype', defaultValue: 'uint8', options: ['uint8', 'float16', 'bfloat16'], visibleWhen: (c) => c.quantization_enabled || c.training_quantization_enabled },
  // 低秩精度回补：4bit 基座存残差 W-up@down，前向由冻结低秩分支补回主奇异方向。
  // 必须配合量化使用（单开无标的），所以整族都挂在量化开关下。
  { key: 'rank_comp_enabled', type: 'boolean', label: '低秩精度回补', title: 'rank_comp_enabled', desc: '4bit 量化误差用冻结低秩分支补回；显存代价 r16 约 0.4% 主干', defaultValue: false, visibleWhen: (c) => c.quantization_enabled || c.training_quantization_enabled },
  { key: 'rank_comp_rank', type: 'number', label: '回补秩', title: 'rank_comp_rank', desc: '越大越准也越占显存。r16 削误差约 32%，r64 约 65%', defaultValue: 16, min: 1, step: 1, visibleWhen: RANK_COMP_ON },
  { key: 'rank_comp_refine_iters', type: 'number', label: '交替精化轮数', title: 'rank_comp_refine_iters', desc: '低秩与量化残差交替拟合的轮数；2 轮后收益递减', defaultValue: 2, min: 0, step: 1, visibleWhen: RANK_COMP_ON },
  { key: 'rank_comp_oversample', type: 'number', label: 'rSVD 过采样', title: 'rank_comp_oversample', desc: '随机 SVD 的额外采样列数，提高小奇异值精度', defaultValue: 8, min: 0, step: 1, visibleWhen: RANK_COMP_ON },
  { key: 'rank_comp_niter', type: 'number', label: 'rSVD 幂迭代', title: 'rank_comp_niter', desc: '随机 SVD 的子空间迭代次数', defaultValue: 4, min: 0, step: 1, visibleWhen: RANK_COMP_ON },
  { key: 'rank_comp_activation_weighted', type: 'boolean', label: '激活加权回补', title: 'rank_comp_activation_weighted', desc: '按每通道激活能量加权分解，最小化输出误差而非权重误差；实测再削约 16 个百分点。需要训练缓存在场，取不到会自动降级', defaultValue: false, visibleWhen: RANK_COMP_ON },
  { key: 'rank_comp_calibration_batches', type: 'number', label: '校准样本数', title: 'rank_comp_calibration_batches', desc: '激活加权用多少个缓存样本估通道能量', defaultValue: 8, min: 1, step: 1, visibleWhen: (c) => RANK_COMP_ON(c) && c.rank_comp_activation_weighted },
  { key: 'rank_comp_calibration_ridge', type: 'number', label: '校准 ridge', title: 'rank_comp_calibration_ridge', desc: '相对平均能量的正则项，避免零方差通道把逆打成 inf', defaultValue: 0.001, min: 0, step: 0.001, visibleWhen: (c) => RANK_COMP_ON(c) && c.rank_comp_activation_weighted },
  { key: 'rank_comp_target_suffixes', type: 'string', label: '回补目标后缀', title: 'rank_comp_target_suffixes', desc: '逗号分隔模块后缀；空=沿用该架构的量化目标表', defaultValue: '', visibleWhen: RANK_COMP_ON },
  { key: 'rank_comp_export_sidecar', type: 'boolean', label: '导出回补 sidecar', title: 'rank_comp_export_sidecar', desc: '另存 *.rank_comp.safetensors；不写进 LoRA（否则加载到未量化基座上会画坏）', defaultValue: false, visibleWhen: RANK_COMP_ON }
];

// UNet 条件适配器字段（仅 SD 系历史路径；Anima 请用 anima-controlnet）
export const S_LLLITE = [
  { key: 'lllite_cond_emb_dim', type: 'number', label: '条件嵌入维 (UNet)', title: 'lllite_cond_emb_dim', desc: 'UNet 条件图像 embedding 维度。', defaultValue: 32, min: 1, step: 1 },
  { key: 'lllite_mlp_dim', type: 'number', label: 'MLP 瓶颈维 (UNet)', title: 'lllite_mlp_dim', desc: 'UNet adapter 瓶颈宽度。', defaultValue: 64, min: 1, step: 1 },
  { key: 'lllite_dropout', type: 'number', label: '条件 Dropout (UNet)', title: 'lllite_dropout', desc: 'UNet adapter 路径 dropout。', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'lllite_skip_input_blocks', type: 'boolean', label: '跳过 Input Blocks (UNet)', title: 'lllite_skip_input_blocks', desc: '不向 UNet input blocks 注入。', defaultValue: false },
  { key: 'lllite_skip_output_blocks', type: 'boolean', label: '跳过 Output Blocks (UNet)', title: 'lllite_skip_output_blocks', desc: '不向 UNet output blocks 注入（默认跳过）。', defaultValue: true }
];

// Anima ControlNet 网络字段（DiT 条件适配器；与 EasyControl 不同）
export const S_ANIMA_CONTROLNET = [
  { key: 'anima_controlnet_weights', type: 'file', pickerType: 'model-file', label: '已有 ControlNet 权重', title: 'anima_controlnet_weights', desc: '留空从头训练；可加载社区可读布局的 Anima', defaultValue: '' },
  { key: 'anima_controlnet_cond_emb_dim', type: 'number', label: '条件嵌入维', title: 'anima_controlnet_cond_emb_dim', desc: '共享条件嵌入维度', defaultValue: 32, min: 1, step: 1 },
  { key: 'anima_controlnet_cond_dim', type: 'number', label: '条件主干宽度', title: 'anima_controlnet_cond_dim', desc: '条件图像编码器中间通道宽', defaultValue: 64, min: 2, step: 2 },
  { key: 'anima_controlnet_cond_resblocks', type: 'number', label: '条件 ResBlock 数', title: 'anima_controlnet_cond_resblocks', desc: '条件主干残差块数量；0 关闭', defaultValue: 1, min: 0, step: 1 },
  { key: 'anima_controlnet_use_aspp', type: 'boolean', label: '启用多尺度 ASPP', title: 'anima_controlnet_use_aspp', desc: '对 depth/分割等全局结构更有帮助；线稿可关。', defaultValue: false },
  { key: 'anima_controlnet_mlp_dim', type: 'number', label: '适配器瓶颈维', title: 'anima_controlnet_mlp_dim', desc: '每层 down/mid/up 与 FiLM 隐宽。', defaultValue: 64, min: 1, step: 1 },
  { key: 'anima_controlnet_target_layers', type: 'select', label: '注入层', title: 'anima_controlnet_target_layers', desc: '挂到 DiT 哪些 Linear。', defaultValue: 'self_attn_q', options: [
    { value: 'self_attn_q', label: 'self_attn_q（最轻）' },
    { value: 'self_attn_qkv', label: 'self_attn_qkv' },
    { value: 'self_attn_qkv_cross_q', label: 'self_attn_qkv + cross_q' },
    { value: 'self_attn_q_pre,mlp_fc1_pre', label: 'Q + MLP fc1' }
  ] },
  { key: 'anima_controlnet_dropout', type: 'number', label: '适配器 Dropout', title: 'anima_controlnet_dropout', desc: '训练时 mid 后 dropout。', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'anima_controlnet_multiplier', type: 'number', label: '适配器倍率', title: 'anima_controlnet_multiplier', desc: '条件残差整体倍率', defaultValue: 1.0, min: 0, step: 0.05 },
  { key: 'anima_controlnet_export_compat', type: 'boolean', label: '导出社区可读布局', title: 'anima_controlnet_export_compat', desc: '默认开启：保存为社区可读 safetensors 键布局。', defaultValue: true }
];

export const VRAM_AUTO_ENHANCE_FIELDS = [
  { key: 'vram_auto_enhance_enabled', type: 'boolean', label: '爆显存防护', title: 'vram_auto_enhance_enabled', desc: '默认开启。显存不够时自动把 DiT 常驻策略降到 offload、必要时打开 Block Checkpointing；预检里会提前告诉你要改哪几项。关掉则完全按你自己的设置跑。', defaultValue: true },
  { key: 'enhanced_protection_mode', type: 'boolean', label: '增强防护模式', title: 'enhanced_protection_mode', desc: '开启后允许自动提升 PCIe 传输格式到 FP8。', defaultValue: false, visibleWhen: when('vram_auto_enhance_enabled', true) },
  // VRAM Smart Sensing：独立 master（后端默认 true）；子项挂 sensing 自身，不绑 auto_enhance
  { key: 'vram_smart_sensing_enabled', type: 'boolean', label: '显存智能感知', title: 'vram_smart_sensing_enabled', desc: '监测训练速度变慢并提示/触发候选策略。默认开启；可单独关闭。', defaultValue: true },
  { key: 'vram_smart_sensing_baseline_steps', type: 'number', label: '智能感知基线步数', title: 'vram_smart_sensing_baseline_steps', desc: '建立平均速度基线的步数', defaultValue: 50, min: 5, step: 5, visibleWhen: when('vram_smart_sensing_enabled', true) },
  { key: 'vram_smart_sensing_slowdown_ratio', type: 'number', label: '智能感知变慢阈值', title: 'vram_smart_sensing_slowdown_ratio', desc: '慢多少倍才提示。1.5 表示慢 50%。', defaultValue: 1.5, min: 1.05, step: 0.05, visibleWhen: when('vram_smart_sensing_enabled', true) },
  { key: 'vram_smart_sensing_window_steps', type: 'number', label: '智能感知窗口步数', title: 'vram_smart_sensing_window_steps', desc: '判断变慢时使用的滑动窗口长度', defaultValue: 5, min: 1, step: 1, visibleWhen: when('vram_smart_sensing_enabled', true) },
  { key: 'vram_smart_sensing_streaming_enabled', type: 'boolean', label: '智能感知流式候选', title: 'vram_smart_sensing_streaming_enabled', desc: '允许把流式 offload 列为候选策略。', defaultValue: true, visibleWhen: when('vram_smart_sensing_enabled', true) },
  { key: 'vram_smart_sensing_sparse_swap_enabled', type: 'boolean', label: '智能感知稀疏交换候选', title: 'vram_smart_sensing_sparse_swap_enabled', desc: '允许把稀疏交换列为候选策略', defaultValue: true, visibleWhen: when('vram_smart_sensing_enabled', true) },
  { key: 'vram_smart_sensing_delta_cache_enabled', type: 'boolean', label: '智能感知 Delta/Cache 候选', title: 'vram_smart_sensing_delta_cache_enabled', desc: '只读候选识别，不分配缓存', defaultValue: false, visibleWhen: when('vram_smart_sensing_enabled', true) }
];

export const S_SAVE = [
  { key: 'output_name', type: 'string', label: '模型保存名称', title: 'output_name', desc: '输出文件名（不含扩展名），中间 checkpoint 自动追加 -步数 后缀。', defaultValue: 'lulynx_' },
  { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '模型保存文件夹', title: 'output_dir', desc: '模型/LoRA 产物输出文件夹，中间 checkpoint 按步数命名。', defaultValue: './output' },
  { key: 'save_model_as', type: 'select', label: '保存格式', title: 'save_model_as', desc: '模型保存格式（LoRA/dense 容器；不是 Comfy INT8）', defaultValue: 'safetensors', options: ['safetensors', 'pt', 'ckpt'] },
  { key: 'save_precision', type: 'select', label: '保存精度', title: 'save_precision', desc: 'LoRA/合并 dense 精度。auto=跟随底座/混合精度；INT8/FP8 底座 dequant 后仍输出高精度（非 Comfy INT8 适配器）', defaultValue: 'auto', options: [
    { value: 'auto', label: '自动（跟随底座/混合精度）' },
    { value: 'fp16', label: 'fp16' },
    { value: 'bf16', label: 'bf16' },
    { value: 'float', label: 'float' }
  ] },
  { key: 'merge_export', type: 'boolean', label: '保存后导出合并底座', title: 'merge_export', desc: '将 LoRA 合并进底座后额外保存 dense 整模（体积大）。Anima 族同样映射到 merge 导出路径', defaultValue: false },
  { key: 'export_comfy_int8_base', type: 'boolean', label: '合并/全参后导出 Comfy INT8 底座', title: 'export_comfy_int8_base', desc: '对 dense 整模再量化为 Comfy INT8 包（整模，不是 LoRA）。需开启合并导出或 full_finetune', defaultValue: false },
  { key: 'export_comfy_int8_engine', type: 'select', label: 'Comfy INT8 引擎', title: 'export_comfy_int8_engine', desc: '默认 convrot 真旋转（group-RHT）；rowwise 为 plain 无旋转', defaultValue: 'convrot', options: [
    { value: 'convrot', label: 'convrot 真旋转' }
  ], visibleWhen: when('export_comfy_int8_base', true) },
  { key: 'export_comfy_int8_groupsize', type: 'number', label: 'ConvRot Group Size', title: 'export_comfy_int8_groupsize', desc: '必须是 4 的幂，默认 256。', defaultValue: 256, min: 4, step: 4, visibleWhen: when('export_comfy_int8_base', true) },
  { key: 'thin_svd_export_enabled', type: 'boolean', label: '启用 Thin-SVD 导出', title: 'thin_svd_export_enabled', desc: '保存 LoRA 时按目标 Rank 做 SVD 压缩；默认关闭，RS-LoRA 会自动跳过。', defaultValue: false },
  { key: 'thin_svd_export_rank', type: 'number', label: 'Thin-SVD 目标 Rank', title: 'thin_svd_export_rank', desc: '必须小于原始 network_dim；留空或 0 表示不压缩。', defaultValue: 0, min: 0, visibleWhen: when('thin_svd_export_enabled', true) },
  { key: 'save_every_n_epochs', type: 'number', label: '每 N 轮保存', title: 'save_every_n_epochs', desc: '每 N epoch（轮）自动保存一次模型。0 表示不按轮保存，此时「每 N 步保存」必须大于 0——两者不能同时为 0，否则整个训练只在正常结束时落盘一次，中途中断拿不到权重', defaultValue: 1, min: 0 },
  { key: 'save_every_n_steps', type: 'number', label: '每 N 步保存', title: 'save_every_n_steps', desc: '每 N 步自动保存一次模型。0 表示不按步保存，此时「每 N 轮保存」必须大于 0。两者可以同时开，但间隔都设得很小会写出大量检查点', defaultValue: '', min: 0 },
  { key: 'save_state', type: 'boolean', label: '保存训练状态', title: 'save_state', desc: '保存训练状态 配合 resume 参数可以继续从某个状态训练', defaultValue: false },
  ...HUB_STATE_SAVE_FIELDS,
  { key: 'save_state_on_train_end', type: 'boolean', label: '结束时额外保存状态', title: 'save_state_on_train_end', desc: '训练结束时额外保存一次训练状态', defaultValue: false },
  { key: 'save_last_n_epochs_state', type: 'number', label: '保留最近 N 个 epoch 状态', title: 'save_last_n_epochs_state', desc: '仅保存最后 n epoch 的训练状态', defaultValue: '', min: 1, visibleWhen: when('save_state', true) },
  { key: 'save_last_n_steps_state', type: 'number', label: '保留最近 N 步状态', title: 'save_last_n_steps_state', desc: '仅保留最近 N 步范围内的训练状态', defaultValue: '', min: 1, visibleWhen: when('save_state', true) },
  { key: 'save_n_epoch_ratio', type: 'number', label: '按比例保存', title: 'save_n_epoch_ratio', desc: '按 epoch 比例保存，保证整个训练阶段至少保存 N 份模型', defaultValue: '', min: 1 },
  { key: 'save_last_n_epochs', type: 'number', label: '仅保留最近 N 轮模型', title: 'save_last_n_epochs', desc: '仅保留最近 N 个按 epoch 保存的模型', defaultValue: '', min: 1 },
  { key: 'save_last_n_steps', type: 'number', label: '仅保留最近 N 步模型', title: 'save_last_n_steps', desc: '仅保留最近 N 步范围内的按 step 保存模型', defaultValue: '', min: 1 },
  { key: 'auto_convert_to_slora', type: 'boolean', label: '保存时自动转 SLoRA', title: 'auto_convert_to_slora', desc: 'PiSSA/LoftQ 等初始化策略训练完成后，保存时自动转换为标准 LoRA 兼容格式。默认开启；关闭则保留初始化时的原始 adapter 状态。', defaultValue: true },
  { key: 'log_with', type: 'select', label: '日志模块', title: 'log_with', desc: '训练日志上报目标（tensorboard/wandb/all 等）。', defaultValue: 'tensorboard', options: ['tensorboard', 'wandb'] },
  { key: 'logging_dir', type: 'folder', pickerType: 'folder', label: '日志保存文件夹', title: 'logging_dir', desc: '日志文件保存目录（tensorboard 事件等）。', defaultValue: './logs' },
  { key: 'log_prefix', type: 'string', label: '日志前缀', title: 'log_prefix', desc: '日志指标名前缀，区分同一项目下的多次训练。', defaultValue: '' },
  { key: 'adaptive_step_logging_enabled', type: 'boolean', label: '自适应日志降频', title: 'adaptive_step_logging_enabled', desc: '当 step 日志开销过高时自动降低写入频率。', defaultValue: true },
  { key: 'adaptive_step_logging_threshold', type: 'number', label: '日志开销阈值', title: 'adaptive_step_logging_threshold', desc: '日志耗时超过训练 step 的该比例时开始降频；0.01 表示 1%。', defaultValue: 0.01, min: 0, step: 0.001, visibleWhen: when('adaptive_step_logging_enabled', true) },
 { key: 'wandb_run_name', type: 'string', label: 'WandB 运行名称', title: 'wandb_run_name', desc: 'wandb 单次运行显示名称', defaultValue: '', visibleWhen: when('log_with', 'wandb') },
  { key: 'wandb_api_key', type: 'string', label: 'WandB API Key', desc: 'wandb 的 api 密钥', defaultValue: '', visibleWhen: when('log_with', 'wandb') },
];
export const S_CAPTION = [
  { key: 'caption_extension', type: 'string', label: 'Tag 文件扩展名', title: 'caption_extension', desc: '图说文件扩展名（如 .txt），与图像同名配对。', defaultValue: '.txt' },
  { key: 'prefer_json_caption', type: 'boolean', label: '优先读取 JSON Caption', title: 'prefer_json_caption', desc: '存在 JSON sidecar 时优先于配置扩展名读取；编辑仍写入平面 caption 文件', defaultValue: false },
  { key: 'shuffle_caption', type: 'boolean', label: '随机打乱标签', title: 'shuffle_caption', desc: '训练时随机打乱 tokens', defaultValue: false },
  { key: 'shuffle_caption_tags_only', type: 'boolean', label: '仅打乱 Tag 部分', title: 'shuffle_caption_tags_only', desc: '结构化 JSON 标注时只打乱 tags，保持自然语言描述顺序不变', defaultValue: false },
  { key: 'caption_shuffle_strategy', type: 'select', label: 'Caption 打乱策略', title: 'caption_shuffle_strategy', desc: 'off=固定顺序；live=每步实时打乱（Anima cached 需选 live/multi_copy 才生效）；multi_copy=缓存多个 shuffle 变体轮取。', defaultValue: 'off', options: [
    { value: 'off', label: 'off（不打乱）' },
    { value: 'live', label: 'live（实时打乱）' },
    { value: 'multi_copy', label: 'multi_copy（多副本轮取）' }
  ] },
  { key: 'caption_shuffle_copies', type: 'number', label: 'Caption 打乱副本数', title: 'caption_shuffle_copies', desc: 'multi_copy 模式下预生成的 shuffle 变体数量（2–16）。', defaultValue: 4, min: 2, max: 16, step: 1, visibleWhen: when('caption_shuffle_strategy', 'multi_copy') },
  { key: 'caption_protect_prefix_from_dropout', type: 'boolean', label: 'Dropout 保护前缀', title: 'caption_protect_prefix_from_dropout', desc: '开启后，均匀/按 tag 的 caption dropout 不会丢弃 keep_tokens 前缀部分。', defaultValue: false },
  { key: 'weighted_captions', type: 'boolean', label: '使用带权重 token', title: 'weighted_captions', desc: '启用 (tag:1.2) 形式的带权重 token 语法。', defaultValue: false },
  { key: 'keep_tokens', type: 'number', label: '保留前 N 个 token', title: 'keep_tokens', desc: '在随机打乱 tokens 时，保留前 N 个不变', defaultValue: 0, min: 0, max: 255 },
  { key: 'max_token_length', type: 'number', label: '最大 token 长度', title: 'max_token_length', desc: '文本编码器最大 token 长度，超长截断。', defaultValue: 225, min: 1 },
  { key: 'caption_dropout_rate', type: 'number', label: '全部标签丢弃概率', title: 'caption_dropout_rate', desc: '整个 caption 以该概率被整体置空，用于训练无条件分支（CFG 基础）。', defaultValue: '', min: 0, max: 1, step: 0.01 },
  { key: 'keep_tokens_separator', type: 'string', label: '保留 token 分隔符', title: 'keep_tokens_separator', desc: '保留 tokens 时使用的分隔符', defaultValue: '' },
  { key: 'caption_dropout_every_n_epochs', type: 'number', label: '每 N 轮丢弃标签', title: 'caption_dropout_every_n_epochs', desc: '每 N 个 epoch 丢弃全部标签', defaultValue: '', min: 0, max: 100, step: 1 },
  { key: 'tag_dropout_rate', type: 'number', label: '按标签丢弃概率', title: 'tag_dropout_rate', desc: '按逗号分隔的标签来随机丢弃 tag 的概率', defaultValue: '', min: 0, max: 1, step: 0.01 },
  { key: 'caption_tag_dropout_rate', type: 'number', label: '按标签丢弃概率（兼容键）', title: 'caption_tag_dropout_rate', desc: '兼容旧配置的按标签丢弃概率；与 tag_dropout_rate 二选一。', defaultValue: '', min: 0, max: 1, step: 0.01 },
  { key: 'tag_group_shuffle', type: 'boolean', label: '标签组内打乱', title: 'tag_group_shuffle', desc: '按组分隔符分组后只在组内打乱。', defaultValue: false },
  { key: 'tag_group_separator', type: 'string', label: '标签组分隔符', title: 'tag_group_separator', desc: '标签组边界，默认 |||。', defaultValue: '|||', visibleWhen: when('tag_group_shuffle', true) },
  { key: 'caption_tag_mutate_scope', type: 'select', label: '标签变异范围', title: 'caption_tag_mutate_scope', desc: '控制标签变异作用于整段 caption 还是分隔符后的 tag 区域。', defaultValue: 'all', options: ['all', 'after_separator'] },
  { key: 'caption_tag_scope_separator', type: 'string', label: '标签范围分隔符', title: 'caption_tag_scope_separator', desc: 'after_separator 模式使用的范围分隔符。', defaultValue: '|||', visibleWhen: when('caption_tag_mutate_scope', 'after_separator') },
  { key: 'nl_dropout_rate', type: 'number', label: 'NL 描述丢弃概率', title: 'nl_dropout_rate', desc: '对结构化 JSON caption 中的 NL', defaultValue: '', min: 0, max: 1, step: 0.01 },
  { key: 'caption_tag_dropout_targets', type: 'textarea', label: '指定丢弃 Tag 列表', title: 'caption_tag_dropout_targets', desc: '指定要处理的 tag 列表。一行一个，也支持逗号分隔', defaultValue: '' },
  { key: 'caption_tag_dropout_target_mode', type: 'select', label: '指定 Tag 处理方式', title: 'caption_tag_dropout_target_mode', desc: 'drop_all 全部移除，random_n 仅在命中 tag', defaultValue: 'drop_all', options: ['drop_all', 'random_n'] },
  { key: 'caption_tag_dropout_target_count', type: 'number', label: '随机丢弃数量', title: 'caption_tag_dropout_target_count', desc: '处理方式为 random_n 时，每张图随机丢弃多少个命中 tag', defaultValue: 1, min: 1, step: 1, visibleWhen: when('caption_tag_dropout_target_mode', 'random_n') },
  { key: 'caption_source_mix_enabled', type: 'boolean', label: '启用 Tag/NL 混合采样', title: 'caption_source_mix_enabled', desc: '仅对 Anima / Newbie 的结构化 JSON caption', defaultValue: false, visibleWhen: (c) => String(c.model_train_type || '').includes('anima') || String(c.model_train_type || '').includes('newbie') },
  { key: 'caption_source_nl_ratio', type: 'number', label: 'NL 比例', title: 'caption_source_nl_ratio', desc: '默认 65，表示输出「触发词 + NL」的采样权重。', defaultValue: 65, min: 0, max: 100, step: 1, visibleWhen: (c) => (String(c.model_train_type || '').includes('anima') || String(c.model_train_type || '').includes('newbie')) && c.caption_source_mix_enabled === true },
  { key: 'caption_source_tag_ratio', type: 'number', label: 'Tag 比例', title: 'caption_source_tag_ratio', desc: '默认 20，表示输出「触发词 + Tag」的采样权重。', defaultValue: 20, min: 0, max: 100, step: 1, visibleWhen: (c) => (String(c.model_train_type || '').includes('anima') || String(c.model_train_type || '').includes('newbie')) && c.caption_source_mix_enabled === true },
  { key: 'caption_source_trigger_only_ratio', type: 'number', label: '仅触发词比例', title: 'caption_source_trigger_only_ratio', desc: '默认 10，只保留触发词', defaultValue: 10, min: 0, max: 100, step: 1, visibleWhen: (c) => (String(c.model_train_type || '').includes('anima') || String(c.model_train_type || '').includes('newbie')) && c.caption_source_mix_enabled === true },
  { key: 'caption_source_empty_ratio', type: 'number', label: '空文本比例', title: 'caption_source_empty_ratio', desc: '默认 5，完全不输入文本', defaultValue: 5, min: 0, max: 100, step: 1, visibleWhen: (c) => (String(c.model_train_type || '').includes('anima') || String(c.model_train_type || '').includes('newbie')) && c.caption_source_mix_enabled === true },
  { key: 'caption_source_trigger_tokens', type: 'textarea', label: '触发词列表', title: 'caption_source_trigger_tokens', desc: '逗号或换行分隔；留空时优先尝试 JSON 中的 concept / concept_group / identity / character 字段。', defaultValue: '', visibleWhen: (c) => (String(c.model_train_type || '').includes('anima') || String(c.model_train_type || '').includes('newbie')) && c.caption_source_mix_enabled === true },

  // AI-Toolkit UX: Caption replacements
  { key: 'caption_replacements', type: 'textarea', label: 'Caption 替换规则', title: 'caption_replacements', desc: '字符串替换规则，格式：old:new,old2:new2。', defaultValue: '' },
  { key: 'caption_replacements_regex', type: 'boolean', label: '启用正则表达式替换', title: 'caption_replacements_regex', desc: '启用后替换规则将使用正则表达式匹配', defaultValue: false },

  // AI-Toolkit UX: Random triggers
  { key: 'random_triggers', type: 'textarea', label: '随机触发词', title: 'random_triggers', desc: '逗号分隔的触发词列表或文件路径', defaultValue: '' },
  { key: 'random_triggers_probability', type: 'number', label: '触发词注入概率', title: 'random_triggers_probability', desc: '触发词注入概率（0.0-1.0）。1.0 表示总是注入，0.0 表示不注入', defaultValue: 1.0, min: 0, max: 1, step: 0.1 },
  { key: 'random_triggers_position', type: 'select', label: '触发词注入位置', title: 'random_triggers_position', desc: '触发词注入到 caption 的位置', defaultValue: 'prepend', options: ['prepend', 'append'] },

  // Multi-caption variants
  { key: 'caption_variants_enabled', type: 'boolean', label: '多 Caption 变体训练', title: 'caption_variants_enabled', desc: '按变体后缀/比例/课程序列在多种 caption', defaultValue: false },
  { key: 'caption_variants', type: 'textarea', label: 'Caption 变体定义 (JSON)', title: 'caption_variants', desc: 'JSON 数组，例如 [{"suffix":".', defaultValue: '', visibleWhen: when('caption_variants_enabled', true) },
  { key: 'caption_variant_schedule', type: 'select', label: '变体调度', title: 'caption_variant_schedule', desc: 'alternate 轮换', defaultValue: 'alternate', options: [
    { value: 'alternate', label: 'alternate（轮换）' },
    { value: 'ratio', label: 'ratio（比例）' },
    { value: 'curriculum', label: 'curriculum（课程）' },
    { value: 'custom', label: 'custom（自定义序列）' }
  ], visibleWhen: when('caption_variants_enabled', true) },
  { key: 'caption_variant_ratio', type: 'string', label: '变体比例 JSON', title: 'caption_variant_ratio', desc: 'ratio 模式：JSON 数组，如 [0.7, 0.3]。', defaultValue: '', visibleWhen: all(when('caption_variants_enabled', true), when('caption_variant_schedule', 'ratio')) },
  { key: 'caption_variant_custom_sequence', type: 'string', label: '自定义变体序列', title: 'caption_variant_custom_sequence', desc: 'custom 模式：JSON 数组，索引对应变体，如 [0,0,1,0,1]。', defaultValue: '', visibleWhen: all(when('caption_variants_enabled', true), when('caption_variant_schedule', 'custom')) },
  { key: 'caption_variant_loss_adaptive', type: 'boolean', label: '按 loss 自适应变体比例', title: 'caption_variant_loss_adaptive', desc: '根据各变体 loss 动态调整采样比例。', defaultValue: false, visibleWhen: when('caption_variants_enabled', true) },

  // Dual caption (short/long keys)
  { key: 'dual_caption_enabled', type: 'boolean', label: '双 Caption（短/长）', title: 'dual_caption_enabled', desc: '从结构化标注中读取 short/long 两路', defaultValue: false },
  { key: 'dual_caption_short_key', type: 'string', label: '短 Caption 字段名', title: 'dual_caption_short_key', desc: 'JSON 中短 caption 键名。', defaultValue: 'short', visibleWhen: when('dual_caption_enabled', true) },
  { key: 'dual_caption_long_key', type: 'string', label: '长 Caption 字段名', title: 'dual_caption_long_key', desc: 'JSON 中长 caption 键名。', defaultValue: 'long', visibleWhen: when('dual_caption_enabled', true) },

  // Structured caption (SC) 分桶 dropout
  { key: 'sc_trigger_dropout', type: 'number', label: 'SC 触发词丢弃率', title: 'sc_trigger_dropout', desc: '结构化 caption 中 trigger 桶丢弃概率。', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'sc_style_dropout', type: 'number', label: 'SC 风格词丢弃率', title: 'sc_style_dropout', desc: 'style 桶丢弃概率', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'sc_quality_dropout', type: 'number', label: 'SC 质量词丢弃率', title: 'sc_quality_dropout', desc: 'quality 桶丢弃概率', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'sc_content_dropout', type: 'number', label: 'SC 内容词丢弃率', title: 'sc_content_dropout', desc: 'content 桶丢弃概率', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'sc_modifier_dropout', type: 'number', label: 'SC 修饰词丢弃率', title: 'sc_modifier_dropout', desc: 'modifier 桶丢弃概率', defaultValue: 0.0, min: 0, max: 1, step: 0.01 },
  { key: 'sc_locked_tags', type: 'string', label: 'SC 锁定标签', title: 'sc_locked_tags', desc: '逗号分隔，永不丢弃的标签', defaultValue: '' },

  // AI-Toolkit UX: OOM skip batch
  { key: 'oom_skip_batch_enabled', type: 'boolean', label: 'OOM 跳批', title: 'oom_skip_batch_enabled', desc: '自动跳过 OOM (显存不足) 的 batch', defaultValue: true },
  { key: 'oom_skip_batch_max_consecutive', type: 'number', label: 'OOM 最大连续次数', title: 'oom_skip_batch_max_consecutive', desc: '连续 OOM 多少次后停止训练。默认 3 次', defaultValue: 3, min: 1, max: 10, step: 1 }
];
export const S_LR = [
  { key: 'learning_rate', type: 'string', label: '总学习率', title: 'learning_rate', desc: '总学习率, 在分开设置 U-Net 与文本编码器学习率后这个值失效。', defaultValue: '1e-4' },
  { key: 'unet_lr', type: 'string', label: 'U-Net 学习率', title: 'unet_lr', desc: 'U-Net/DiT 主干的学习率。', defaultValue: '1e-4' },
  { key: 'text_encoder_lr', type: 'string', label: '文本编码器学习率', title: 'text_encoder_lr', desc: '文本编码器的独立学习率，常用 UNet LR 的 1/5~1/2。', defaultValue: '1e-5' },
  { key: 'weight_decay', type: 'number', label: '权重衰减', title: 'weight_decay', desc: '优化器权重衰减。', defaultValue: 0.01, min: 0, max: 1, step: 0.001 },
  { key: 'lr_scheduler', type: 'select', label: '学习率调度器', title: 'lr_scheduler', desc: '学习率调度器设置；Loss 门控余弦会在 loss 有效下降时保持当前余弦值', defaultValue: 'cosine', options: schedulerOptions(ALL_SCHEDULERS) },
  { key: 'lr_warmup_steps', type: 'number', label: '预热步数', title: 'lr_warmup_steps', desc: '学习率预热步数', defaultValue: 0, min: 0 },
  { key: 'warmup_ratio', type: 'number', label: '预热比例', title: 'warmup_ratio', desc: '按总训练步数比例计算 warmup（与 lr_warmup_steps 二选一；后端 scheduler 优先解析此比例）。', defaultValue: 0.05, min: 0, max: 1, step: 0.01 },
  { key: 'fused_optimizer', type: 'boolean', label: 'FusedAdamW 优化器', title: 'fused_optimizer', desc: '用 FusedAdamW 替代标准 AdamW step，减少 kernel launch 开销。', defaultValue: false },
  { key: 'stochastic_rounding', type: 'boolean', label: 'Rose 随机舍入（FP32 source）', title: 'stochastic_rounding', desc: '仅 Rose optimizer 拥有可验证的 FP32 update source；通用 optimizer wrapper 会明确 fail-fast。', defaultValue: false, visibleWhen: (c) => String(c.optimizer_type || '').toLowerCase().includes('rose') },
  { key: 'stochastic_grad_accumulation', type: 'boolean', label: '梯度累加随机舍入（reserve）', title: 'stochastic_grad_accumulation', desc: '当前无通用 FP32 gradient source contract，启用会 fail-fast；保留字段仅用于兼容读取。', defaultValue: false },
  { key: 'lr_scheduler_num_cycles', type: 'number', label: '重启次数', title: 'lr_scheduler_num_cycles', desc: 'cosine 重启等调度器的重启次数。', defaultValue: 1, min: 1, visibleWhen: when('lr_scheduler', 'cosine_with_restarts') },
  ...S_LOSS_AWARE_LR,
  // (separator for TypeScript parser)
  { key: 'optimizer_type', type: 'select', label: '优化器', title: 'optimizer_type', desc: '优化器设置。pytorch_optimizer.<名字> 会转成 PytorchOptimizer 并把 name= 写进 optimizer_args，需要装 pytorch-optimizer 插件。', defaultValue: 'AdamW8bit', options: ALL_OPTIMIZERS },
  { key: 'optimizer_preset', type: 'select', label: '优化器预设', title: 'optimizer_preset', desc: '快速优化策略预设名；留空表示不应用预设，完全由下方优化器参数决定。', defaultValue: '', options: [
    { value: '', label: '默认（无预设）' },
    { value: 'stable', label: 'Stable（稳定训练）' },
    { value: 'fast', label: 'Fast（快速收敛）' },
    { value: 'memory_efficient', label: 'Memory Efficient（省显存）' },
    { value: 'high_precision', label: 'High Precision（高精度）' }
  ] },
  { key: 'optimizer_backend', type: 'select', label: '优化器后端', title: 'optimizer_backend', desc: 'AdamW 后端档位；compiled_step 可包装 step', defaultValue: 'auto', options: OPTIMIZER_BACKEND_OPTIONS, visibleWhen: expertAndNotTurboCore },
  { key: 'turbocore_optimizer_mode', type: 'select', label: 'Lulynx Triton 优化器', title: 'turbocore_optimizer_mode', desc: 'Lulynx Triton/CUDA 融合优化器档位。', defaultValue: 'off', options: [
    { value: 'off', label: 'PyTorch 原生 step' },
    { value: 'auto', label: 'Lulynx Triton 自动' }
  ] },
  { key: 'advanced_optimizer_strategy', type: 'select', label: '高级优化策略', title: 'advanced_optimizer_strategy', desc: '默认 auto 不改变训练', defaultValue: 'auto', options: ADVANCED_OPTIMIZER_STRATEGY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  // 后端独立 master（与 advanced_optimizer_strategy 可并存；策略下拉优先表达意图）
  { key: 'lora_plus_enabled', type: 'boolean', label: 'LoRA+ 参数组', title: 'lora_plus_enabled', desc: '为 矩阵使用不同学习率倍率', defaultValue: false },
  { key: 'lora_plus_lr_ratio', type: 'number', label: 'LoRA+ LR 倍率', title: 'lora_plus_lr_ratio', desc: 'B 相对 A 的学习率倍率（常用 16）。', defaultValue: 16.0, min: 1, step: 0.1, visibleWhen: when('lora_plus_enabled', true) },
  { key: 'rs_lora_enabled', type: 'boolean', label: 'RS-LoRA 缩放', title: 'rs_lora_enabled', desc: 'rank-stabilized 缩放：alpha', defaultValue: false },
  { key: 'min_snr_gamma', type: 'number', label: 'Min-SNR Gamma', desc: '最小信噪比伽马值, 如果启用推荐为 5', defaultValue: '', min: 0, step: 0.1 },
  { key: 'huber_c', type: 'number', label: 'Huber c / delta', title: 'huber_c', desc: 'huber / smooth_l1 / pseudo_huber 的阈值。', defaultValue: 0.1, min: 0, step: 0.01 },
  { key: 'huber_schedule', type: 'select', label: 'Huber 调度', title: 'huber_schedule', desc: 'constant 固定', defaultValue: 'constant', options: [
    { value: 'constant', label: 'constant' },
    { value: 'exponential', label: 'exponential' },
    { value: 'snr', label: 'snr' },
    { value: 'auto', label: 'auto' }
  ] },
  { key: 'huber_scale', type: 'number', label: 'Huber scale', title: 'huber_scale', desc: 'Huber 损失整体缩放', defaultValue: 1.0, min: 0, step: 0.1 },
  { key: 'huber_auto_percentile', type: 'number', label: 'Huber auto 分位', title: 'huber_auto_percentile', desc: 'schedule=auto 时用 batch 残差该分位估计 delta。', defaultValue: 0.9, min: 0, max: 1, step: 0.05, visibleWhen: when('huber_schedule', 'auto') },
  { key: 'gradient_guard_strategy', type: 'select', label: '梯度防护策略', title: 'gradient_guard_strategy', desc: '梯度异常防护策略：NaN/Inf 检查的扫描方式与粒度。', defaultValue: 'none', options: [
    { value: 'none', label: 'none' },
    { value: 'agc', label: 'agc' },
    { value: 'centralized', label: 'centralized' },
    { value: 'agc_centralized', label: 'agc_centralized' }
  ] },
  { key: 'gradient_guard_agc_clip_factor', type: 'number', label: 'AGC clip 因子', title: 'gradient_guard_agc_clip_factor', desc: '梯度范数相对参数范数的上限比例', defaultValue: 0.01, min: 0, step: 0.001, visibleWhen: (c) => ['agc', 'agc_centralized'].includes(String(c.gradient_guard_strategy || 'none')) },
  { key: 'gradient_guard_agc_eps', type: 'number', label: 'AGC eps', title: 'gradient_guard_agc_eps', desc: '参数范数下限，防除零', defaultValue: 1e-3, min: 0, step: 1e-4, visibleWhen: (c) => ['agc', 'agc_centralized'].includes(String(c.gradient_guard_strategy || 'none')) },
  { key: 'prodigy_d0', type: 'string', label: 'Prodigy d0', desc: 'Prodigy / ProdigyPlus', defaultValue: '', visibleWhen: (cfg) => ['prodigy', 'prodigyplus.prodigyplusschedulefree'].includes(String(cfg.optimizer_type || '').trim().toLowerCase()) },
  { key: 'prodigy_d_coef', type: 'string', label: 'Prodigy d_coef', desc: 'Prodigy / ProdigyPlus d 系数，影响自适应学习率大小', defaultValue: '2.0', visibleWhen: (cfg) => ['prodigy', 'prodigyplus.prodigyplusschedulefree'].includes(String(cfg.optimizer_type || '').trim().toLowerCase()) },
  { key: 'fused_backward_grad_clip_mode', type: 'select', label: 'LOMO 梯度裁剪档位', title: 'fused_backward_grad_clip_mode', desc: 'LOMO/AdaLOMO 在单次反传内逐参数更新并立即释放梯度，常规梯度裁剪拿不到梯度。「默认」保持单遍反传、不做裁剪（最省显存最快）；「完整」额外跑一次 grad_norm 预反传让梯度裁剪真正生效，反传开销约翻倍。', defaultValue: 'default', options: [
    { value: 'default', label: '默认（单遍反传，不裁剪）' },
    { value: 'full', label: '完整（额外预反传，裁剪生效）' }
  ], visibleWhen: (cfg) => ['lomo', 'adalomo', 'pytorch_optimizer.lomo', 'pytorch_optimizer.adalomo'].includes(String(cfg.optimizer_type || '').trim().toLowerCase()) },
  ...S_AUTO_PRODIGY,
  ...OPTIMIZER_SPECIFIC_FIELDS,
  // (separator for TypeScript parser)
  { key: 'lr_scheduler_type', type: 'string', label: '自定义调度器类', title: 'lr_scheduler_type', desc: '自定义学习率调度器类路径', defaultValue: '' },
  { key: 'lr_scheduler_args', type: 'textarea', label: '自定义调度器参数', title: 'lr_scheduler_args', desc: '自定义学习率调度器额外参数（lr_scheduler_args），每行一个 key=value。', defaultValue: '' },
  { key: 'optimizer_args_custom', type: 'textarea', label: '自定义优化器参数', title: 'optimizer_args_custom', desc: '自定义优化器额外参数（对应后端 optimizer_args），每行一个 key=value。', defaultValue: '' }
];
// S_LR_TARGET now filters AnimaFactoredAdamW based on training mode
export const S_LR_TARGET = S_LR.map((field) => {
  if (field.key === 'optimizer_type') {
    return {
      ...field,
      // Use function to get filtered options based on model_train_type
      options: (config) => {
        const trainType = String(config?.model_train_type || '').trim().toLowerCase();
        // AnimaFactoredAdamW only for anima-finetune (full model fine-tuning)
        if (trainType !== 'anima-finetune') {
          return TARGET_LORA_OPTIMIZERS.filter((name) => name !== 'AnimaFactoredAdamW');
        }
        return TARGET_LORA_OPTIMIZERS;
      }
    };
  }
  return field;
});
// 底模微调版:optimizer_backend 选项含 ao_8bit(torchao 仅对大参数全参微调有收益)。
export const S_LR_FT = S_LR.map((field) => field.key === 'optimizer_backend'
  ? { ...field, options: OPTIMIZER_BACKEND_OPTIONS_FINETUNE }
  : field);

// ---- DiT 族变体：共享包过滤/改文案，不改 wire key（SD/SDXL 继续用 S_LR / S_ADV）----
export const excludeKeys = (fields, keys) => {
  const ban = new Set(keys);
  return fields.filter((f) => !ban.has(f.key));
};

export const remapFieldMeta = (fields, byKey) =>
  fields.map((f) => (byKey[f.key] ? { ...f, ...byKey[f.key] } : f));

const DIT_LR_META = {
  learning_rate: {
    desc: '总学习率；若分别设置主干与文本编码器学习率，则以分项为准。',
  },
  unet_lr: {
    label: '主干 / DiT 学习率',
    desc: '主干（DiT / Transformer）学习率；wire key 仍为 unet_lr。',
  },
  text_encoder_lr: {
    label: '文本编码器学习率',
    desc: '文本编码器学习率（无 TE 训练时通常可忽略）。',
  },
};

/** DiT / flow 族 LR：保留 CLI key，展示名去掉 U-Net 语义 */
export const S_LR_DIT = remapFieldMeta(S_LR, DIT_LR_META);
export const S_LR_TARGET_DIT = remapFieldMeta(S_LR_TARGET, DIT_LR_META);
export const S_LR_FT_DIT = remapFieldMeta(S_LR_FT, DIT_LR_META);

export const S_TRAIN = (epochs = 10) => [
  { key: 'train_length_mode', type: 'select', label: '训练长度模式', title: 'train_length_mode', desc: '选择按最大轮数或最大步数控制训练结束', defaultValue: '最大轮数', options: ['最大轮数', '最大步数'] },
  { key: 'max_train_epochs', type: 'number', label: '最大训练轮数', title: 'max_train_epochs', desc: '最大训练 epoch（轮数）', defaultValue: epochs, min: 1, visibleWhen: (c) => !c.train_length_mode || c.train_length_mode === '最大轮数' },
  { key: 'max_train_steps', type: 'number', label: '最大训练步数', title: 'max_train_steps', desc: '最大训练 step（步数）', defaultValue: 1000, min: 1, visibleWhen: when('train_length_mode', '最大步数') },
  { key: 'train_batch_size', type: 'slider', label: '批量大小', title: 'train_batch_size', desc: '批量大小。数值越高显存占用越高', defaultValue: 1, min: 1, max: 32, step: 1 },
  { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点', title: 'gradient_checkpointing', desc: '以重计算换显存：反向时重算激活，显著省显存、略降速度。', defaultValue: true },
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数', title: 'gradient_accumulation_steps', desc: '每 N 次 microbatch 才执行一次', defaultValue: 1, min: 1 },
  { key: 'gradient_accumulation_mode', type: 'select', label: '梯度累加模式', title: 'gradient_accumulation_mode', desc: 'fast（默认）：仅在真正 optimizer.step 的那一步做梯度同步与检查；classic：保留逐 microbatch 检查的旧行为。', defaultValue: 'fast', options: [
    { value: 'fast', label: 'fast' },
    // classic 是后端 training_loop_epoch_mixin.py:317 的真实 else 分支，
    // 逐 microbatch 做同步/检查。原先只给 fast，这个分支选不到。
    { value: 'classic', label: 'classic（逐 microbatch 检查）' }
  ], visibleWhen: (c) => Number(c.gradient_accumulation_steps || 1) > 1 },
  { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 U-Net / DiT', title: 'network_train_unet_only', desc: '只训练 U-Net/DiT，冻结文本编码器。', defaultValue: true },
  { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器', title: 'network_train_text_encoder_only', desc: '只训练文本编码器，冻结 U-Net/DiT。', defaultValue: false },
  { key: 'te_dropout', type: 'number', label: '文本编码器 Dropout', title: 'te_dropout', desc: '训练时以该概率丢弃文本编码器条件（0=关闭）。对 Anima cached 路线会解析为有效 te dropout。', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'p2_weighting_mode', type: 'select', label: '感知加权模式', title: 'p2_weighting_mode', desc: 'p2=(k+SNR)^-gamma；lulynx_structure/lulynx_detail 为本仓饱和工程权重；off=恒等。上游 P2 (arXiv:2204.00227) 是 (k+SNR)^-gamma；本仓 lulynx_structure/lulynx_detail 是指数 tanh 饱和权重、不可化为该式，且 lulynx_detail 方向与论文相反 ⇒ 不等价。', defaultValue: 'off', options: [
    { value: 'off', label: '关闭' },
    { value: 'p2', label: '标准 P2' },
    { value: 'lulynx_structure', label: 'lulynx 结构增强' },
    { value: 'lulynx_detail', label: 'lulynx 细节增强' }
  ] },
  { key: 'p2_weighting_strength', type: 'number', label: '感知加权强度', title: 'p2_weighting_strength', desc: '0=恒等权重；收益需同条件 A/B 验证。', defaultValue: 0, min: 0, max: 2, step: 0.05, visibleWhen: (c) => String(c.p2_weighting_mode || 'off') !== 'off' }
];
export const S_PREVIEW = [
  { key: 'enable_preview', type: 'boolean', label: '启用预览图', title: 'enable_preview', desc: '启用训练预览图', defaultValue: false },
  { key: 'preview_device', type: 'select', label: '预览设备', title: 'preview_device', desc: '混合档=DiT 留在 GPU，VAE 与文本编码器放 CPU，出预览图时显存不再波动（native anima 与 newbie 支持，其他族按 GPU 处理）；GPU 档最快，但 fp32 整帧解码约 8.5GB，配置顶到上限的机器常在第一张预览就崩；CPU 档整张图在独立进程渲染，训练不暂停，但一张 512 图约 6 分钟', defaultValue: 'hybrid', options: ['hybrid', 'gpu', 'cpu', 'off'], visibleWhen: when('enable_preview', true) },
  { key: 'preview_component_residency', type: 'select', label: '预览组件常驻', title: 'preview_component_residency', desc: 'free=出图后释放预览借用的 VAE/文本编码器，把约 1.4GB 还给训练；keep=一直留着，省掉每次重新读盘。只会释放预览自己加载的那一份，训练本身已有的组件不动', defaultValue: 'free', options: ['free', 'keep'], visibleWhen: all(when('enable_preview', true), oneOf('preview_device', ['hybrid', 'gpu'])) },
  { key: 'ephemeral_preview_pipeline', type: 'boolean', label: '临时预览 Pipeline', title: 'ephemeral_preview_pipeline', desc: '每次预览后销毁 pipeline 并释放缓存，避免 VAE', defaultValue: true, visibleWhen: all(when('enable_preview', true), when('preview_device', 'gpu')) },
  { key: 'sample_every', type: 'number', label: '每 N 步采样（后端 sample_every）', title: 'sample_every', desc: '后端主频率键：每 N 步生成预览', defaultValue: 0, min: 0, visibleWhen: when('enable_preview', true) },
  { key: 'sample_every_n_epochs', type: 'number', label: '每 N 轮生成预览', title: 'sample_every_n_epochs', desc: '每训练 N 个 epoch 生成一次预览图。', defaultValue: '', min: 1, visibleWhen: when('enable_preview', true) },
  { key: 'sample_every_n_steps', type: 'number', label: '每 N 步生成预览', title: 'sample_every_n_steps', desc: '每 N 步用当前权重生成预览图。', defaultValue: '', min: 1, visibleWhen: when('enable_preview', true) },
  { key: 'sample_at_first', type: 'boolean', label: '训练前先生成预览', title: 'sample_at_first', desc: '训练开始前先生成一张预览图，可用于确认提示词效果', defaultValue: false, visibleWhen: when('enable_preview', true) },
      { key: 'positive_prompts', type: 'textarea', label: '正向提示词', title: 'positive_prompts', desc: '预览采样使用的正向提示词。', defaultValue: 'masterpiece, best quality, 1girl, solo', visibleWhen: when('enable_preview', true) },
  { key: 'negative_prompts', type: 'textarea', label: '反向提示词', title: 'negative_prompts', desc: '预览采样使用的反向提示词。', defaultValue: 'lowres, bad anatomy, bad hands, text, error', visibleWhen: when('enable_preview', true) },
  { key: 'sample_prompts', type: 'textarea', label: '采样提示词列表（sample_prompts）', title: 'sample_prompts', desc: '后端 sample_prompts：每行一个', defaultValue: 'masterpiece, best quality', visibleWhen: when('enable_preview', true) },
  { key: 'sample_negative', type: 'textarea', label: '采样反向提示词（sample_negative）', title: 'sample_negative', desc: '后端独立 negative 字段；空则回落 negative_prompts。', defaultValue: '', visibleWhen: when('enable_preview', true) },
  { key: 'preview_groups', type: 'preview_groups', label: '预览测试组', title: 'preview_groups', desc: '可添加多组预览，并为每组单独设置 seed、LoRA', defaultValue: [], visibleWhen: when('enable_preview', true) },
  { key: 'sample_width', type: 'number', label: '预览图宽度', title: 'sample_width', desc: '预览图宽；0 = 沿用训练素材分辨率（resolution 的宽）。填具体数值则固定用该尺寸。', defaultValue: 0, min: 0, visibleWhen: when('enable_preview', true) },
  { key: 'sample_height', type: 'number', label: '预览图高度', title: 'sample_height', desc: '预览图高；0 = 沿用训练素材分辨率（resolution 的高）。宽高各自独立，可只钉住一边。', defaultValue: 0, min: 0, visibleWhen: when('enable_preview', true) },
  { key: 'sample_cfg', type: 'number', label: 'CFG 系数', title: 'sample_cfg', desc: 'CFG Scale', defaultValue: 7, min: 1, max: 30, visibleWhen: when('enable_preview', true) },
  { key: 'sample_steps', type: 'number', label: '采样步数', title: 'sample_steps', desc: '迭代步数', defaultValue: 24, min: 1, max: 300, visibleWhen: when('enable_preview', true) },
  { key: 'sample_seed', type: 'number', label: '预览图种子', title: 'sample_seed', desc: '预览图随机种子。0 或留空表示每次随机', defaultValue: '', min: 0, visibleWhen: when('enable_preview', true) },
  { key: 'sample_sampler', type: 'select', label: '采样器', title: 'sample_sampler', desc: '生成预览图所用采样器', defaultValue: 'euler_a', options: ['ddim', 'pndm', 'lms', 'euler', 'euler_a', 'heun', 'dpm_2', 'dpm_2_a', 'dpmsolver', 'dpmsolver++'], visibleWhen: when('enable_preview', true) },
  { key: 'sample_scheduler', type: 'string', label: '采样调度器覆盖（sample_scheduler）', title: 'sample_scheduler', desc: '后端 sampler scheduler 覆盖；空=默认。', defaultValue: '', visibleWhen: when('enable_preview', true) }
];

// rectified-flow DiT 族（anima / newbie）的预览组变体。
// 两处差异，都是实测出来的：
//   · CFG 出厂 4 而非 7 —— 这些族在 cfg≥5 就把预览解码成近黑帧
//     （实测均值亮度 cfg1=0.503 / cfg4=0.225 / cfg5=0.094 / cfg7.5=0.024）。
//   · 多两个求解器旋钮 —— ER-SDE 只有这两族有，SDXL/flux 线不该出现。
const FLOW_PREVIEW_META = {
  sample_cfg: {
    defaultValue: 4,
    max: 12,
    desc: 'CFG Scale。该族建议 3.5~4；≥5 会让预览越来越暗直至全黑。',
  },
};

export const S_PREVIEW_FLOW = [
  ...remapFieldMeta(S_PREVIEW, FLOW_PREVIEW_META),
  { key: 'sample_algorithm', type: 'select', label: '预览求解器', title: 'sample_algorithm', desc: 'sde = ER-SDE-Solver-3（随机，细节更丰富）；ode = 确定性 Euler（同种子可复现）。', defaultValue: 'sde', options: [
    { value: 'sde', label: 'ER-SDE（随机）' },
    { value: 'ode', label: 'Euler ODE（确定性）' },
  ], visibleWhen: when('enable_preview', true) },
  { key: 'sample_sde_eta', type: 'number', label: 'ER-SDE 随机强度 eta', title: 'sample_sde_eta', desc: '随机项强度，出厂 1.0 就是预期档。0 会转去确定性 Euler（与 ode 逐字节相同）；0~1 之间能出图，但会按比例欠注入，背景容易塌成平涂。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: all(when('enable_preview', true), when('sample_algorithm', 'sde')) },
];

export const S_QUALITY_EVAL = [
  { key: 'quality_evaluation_enabled', type: 'boolean', label: '训练结束质量评估', title: 'quality_evaluation_enabled', desc: '训练完成后计算 FID / CLIP Score / LPIPS，默认关闭，与训练中预览图无关。', defaultValue: false },
  { key: 'quality_evaluation_xy_grid', type: 'boolean', label: '生成质量评估 XY 网格', title: 'quality_evaluation_xy_grid', desc: '开启后按参数组合批量出图，生成 XY 对比网格。', defaultValue: false, visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_num_samples', type: 'number', label: '评估采样数', title: 'quality_evaluation_num_samples', desc: '指标评估生成样本数（与 XY 网格 Y 轴组数独立）。', defaultValue: 10, min: 1, max: 64, visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_suite_id', type: 'string', label: '验证套件 ID', title: 'quality_evaluation_suite_id', desc: '固定验证清单的稳定标识，用于跨 checkpoint 对比。', defaultValue: 'default', visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_validation_seeds', type: 'string', label: '固定验证 Seeds', title: 'quality_evaluation_validation_seeds', desc: '逗号分隔。相同 prompt/seed 会同时用于基础模型与当前 LoRA。', defaultValue: '', visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_compare_base', type: 'boolean', label: '对比基础模型', title: 'quality_evaluation_compare_base', desc: '使用 LoRA 权重 0 与 1 的成对样本生成增量证据。', defaultValue: true, visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_metric_weights', type: 'textarea', label: '多目标指标权重', title: 'quality_evaluation_metric_weights', desc: 'JSON 对象，例如 {"clip_score":1,"fid":0.5}。缺失指标不会被伪造为 0 分。', defaultValue: '', visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_metrics', type: 'string', label: '评估指标', title: 'quality_evaluation_metrics', desc: '逗号分隔：fid,clip_score,lpips,dino_i,copy_risk,wd14_tag_recall。copy_risk 拿生成图对照训练图，专测「背图」；其余指标对照留出图。', defaultValue: 'fid,clip_score', visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_validation_prompts', type: 'textarea', label: '评估 / XY 提示词', title: 'quality_evaluation_validation_prompts', desc: '质量评估/XY 网格使用的验证提示词列表。', defaultValue: '', visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'quality_evaluation_reference_source', type: 'select', label: '参考图来源', title: 'quality_evaluation_reference_source', desc: 'FID / LPIPS / DINO-I / 标签召回拿哪批真图当对照。holdout = 本次训练留出、没被训过的图（默认）；手动目录 = 用下面填的目录。对照图若是训练过的图，这四个指标就变成「越照抄训练图分越高」，且不报错、分数还更好看。', defaultValue: 'holdout', options: [
    { value: 'holdout', label: '训练留出集（推荐）' },
    { value: 'manual_dir', label: '手动指定目录' },
  ], visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'fid_real_image_dir', type: 'folder', pickerType: 'folder', label: '指标参考图目录', title: 'fid_real_image_dir', desc: '仅在「参考图来源 = 手动指定目录」时生效。别填训练集目录：那等于让指标奖励背图。', defaultValue: '', visibleWhen: all(when('quality_evaluation_enabled', true), when('quality_evaluation_reference_source', 'manual_dir')) },
  // Preference scorers (PickScore / ImageReward / HPSv2) — default-off product thin seam
  { key: 'preference_scoring_enabled', type: 'boolean', label: '偏好对齐评分', title: 'preference_scoring_enabled', desc: '训练后用 PickScore / ImageReward / HPSv2 对生成图打偏好分。权重较重，默认关；需先开启质量评估。', defaultValue: false, visibleWhen: when('quality_evaluation_enabled', true) },
  { key: 'preference_models', type: 'csvMultiSelect', options: [{ value: 'pickscore', label: 'PickScore' }, { value: 'imagereward', label: 'ImageReward' }, { value: 'hpsv2', label: 'HPS v2' }], label: '偏好评分模型', title: 'preference_models', desc: '逗号分隔：pickscore,imagereward,hpsv2。空=仅 pickscore。模型缺失时记 skipped，不静默当 0 分成功。', defaultValue: 'pickscore', visibleWhen: when('preference_scoring_enabled', true) }
];

export const S_STAGED_RESOLUTION = [
  { key: 'enable_mixed_resolution_training', type: 'boolean', label: '启用阶段分辨率训练', title: 'enable_mixed_resolution_training', desc: '仅支持 SDXL', defaultValue: false },
  { key: 'staged_resolution_ratio_512', type: 'number', label: '512 阶段占比 (%)', title: 'staged_resolution_ratio_512', desc: '当最终分辨率最大边 < 512 时忽略；0=不由 UI 预设（低显存 profile 可能自动填充）。', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
  { key: 'staged_resolution_ratio_768', type: 'number', label: '768 阶段占比 (%)', title: 'staged_resolution_ratio_768', desc: '当最终分辨率最大边 < 768 时忽略', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
  { key: 'staged_resolution_ratio_1024', type: 'number', label: '1024 阶段占比 (%)', title: 'staged_resolution_ratio_1024', desc: '1024 基准和 2048 基准都会用到', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
  { key: 'staged_resolution_ratio_1536', type: 'number', label: '1536 阶段占比 (%)', title: 'staged_resolution_ratio_1536', desc: '仅 2048 基准会用到', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
  { key: 'staged_resolution_ratio_2048', type: 'number', label: '2048 阶段占比 (%)', title: 'staged_resolution_ratio_2048', desc: '仅 2048 基准会用到', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) }
];

export const S_PERFORMANCE_STANDARD = [
  { key: 'fp8_base_compute', type: 'boolean', label: '冻结主干 FP8 计算', title: 'fp8_base_compute', desc: '训练 step 中对冻结主干使用 FP8 矩阵乘（需硬件支持）。与 weight_compression 底座压缩不同。', defaultValue: false },
  { key: 'attention_slicing', type: 'boolean', label: 'Attention 分片', title: 'attention_slicing', desc: '按 head/batch 分片 attention 降低峰值显存。默认开启。', defaultValue: true },
  { key: 'tome_enabled', type: 'boolean', label: 'ToMe 令牌合并', title: 'tome_enabled', desc: '训练时按相似度二分软匹配合并 token 再还原（实验性）。当前仅 Anima 原生 DiT 的普通前向生效；faithful RoPE / 块检查点 / 其他架构会自动关闭并记录原因。', defaultValue: false },
  { key: 'tome_ratio', type: 'number', label: 'ToMe 合并比例', title: 'tome_ratio', desc: '每个 DiT block 合并的 token 比例；后端固定夹取到 0–0.75。', defaultValue: 0.5, min: 0, max: 0.75, step: 0.05, visibleWhen: when('tome_enabled', true) }
];

export const S_SDXL_LOSS = [
  { key: 'debiased_estimation_loss', type: 'boolean', label: '去偏估计损失', title: 'debiased_estimation_loss', desc: 'SDXL 系 v-pred 训练时使用 debiased min-SNR 风格损失修正。默认关闭。', defaultValue: false }
];

export const S_PREFUSE = [
  { key: 'prefuse_adapter_path', type: 'file', pickerType: 'output-model-file', label: '预融合 LoRA 路径', title: 'prefuse_adapter_path', desc: '训练开始前合并进底座的已有 LoRA 权重路径；留空则不预融合。', defaultValue: '' },
  { key: 'prefuse_adapter_scale', type: 'number', label: '预融合 LoRA 倍率', title: 'prefuse_adapter_scale', desc: '预融合 adapter 的缩放系数。', defaultValue: 1.0, min: 0, step: 0.05, visibleWhen: (c) => String(c.prefuse_adapter_path || '').trim() !== '' }
];

export const S_LYCORIS_EXPORT = [
  { key: 'glora_export_mode', type: 'select', label: 'GLoRA 导出模式', title: 'glora_export_mode', desc: 'lora_compatible=ComfyUI/A1111 可读；native=保留 GLoRA 原生布局。', defaultValue: 'lora_compatible', options: [
    { value: 'native', label: 'native' },
    { value: 'lora_compatible', label: 'lora_compatible（兼容 LoRA）' }
  ], visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'glora')) },
  { key: 'glora_compat_layout', type: 'select', label: 'GLoRA 实现方式', title: 'glora_compat_layout', desc: '标准=精确低秩分解（lora_up/lora_down + alpha），无精度损失、体积最小、任何 LoRA loader 都能读；Lulynx 优化=单张量 diff，与 GLoKr 导出键布局一致，不依赖低秩结构但体积大得多。', defaultValue: 'standard', options: [
    { value: 'standard', label: '标准（精确低秩分解）' },
    { value: 'lulynx', label: 'Lulynx 优化（diff 单张量）' }
  ], visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'glora'), when('glora_export_mode', 'lora_compatible')) },
  { key: 'glokr_export_mode', type: 'select', label: 'GLoKr 导出模式', title: 'glokr_export_mode', desc: 'lora_compatible=ComfyUI/A1111 可读；native=保留 GLoKr 原生布局。', defaultValue: 'lora_compatible', options: [
    { value: 'native', label: 'native' },
    { value: 'lora_compatible', label: 'lora_compatible（兼容 LoRA）' }
  ], visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'glokr')) }
];

export const S_DREAMBOOTH = [
  { key: 'instance_prompt', type: 'string', label: '实例提示词', title: 'instance_prompt', desc: 'DreamBooth 触发词/主体描述，如 "sks person"。', defaultValue: '' },
  { key: 'class_prompt', type: 'string', label: '类别提示词', title: 'class_prompt', desc: 'Prior preservation 用的类别描述，如 "a person"。', defaultValue: '' },
  { key: 'num_class_images', type: 'number', label: '类别图像数量', title: 'num_class_images', desc: 'Prior preservation 需生成/使用的类别图像数量。', defaultValue: 100, min: 0, step: 1 },
  { key: 'use_lora', type: 'boolean', label: 'DreamBooth LoRA 模式', title: 'use_lora', desc: '开启后训练 LoRA 而非全参微调；关闭为经典 DreamBooth 全参。', defaultValue: false },
  { key: 'lora_rank', type: 'number', label: 'DreamBooth LoRA Rank', title: 'lora_rank', desc: 'use_lora 开启时的 LoRA 秩。', defaultValue: 16, min: 1, step: 1, visibleWhen: when('use_lora', true) }
];

export const S_ANIMA_CACHE = [
  { key: 'anima_cache_resize_mode', type: 'select', label: '缓存前缩放模式', title: 'anima_cache_resize_mode', desc: '首轮 VAE 缓存前对源图缩放：longest=最长边对齐；shortest=最短边；freefit=自由适配。', defaultValue: 'longest', options: [
    { value: 'longest', label: 'longest（最长边）' },
    { value: 'shortest', label: 'shortest（最短边）' },
    { value: 'freefit', label: 'freefit（自由适配）' }
  ] },
  { key: 'anima_cache_target_resolution', type: 'number', label: '缓存目标分辨率', title: 'anima_cache_target_resolution', desc: '0=跟随训练 resolution（默认，等于分桶尺度）；>0 在缓存构建前缩放到该目标（配合 resize_mode）；-1=保持源图尺寸（大原图在缓存阶段极易爆显存）。', defaultValue: 0, min: -1, step: 64 }
];

// 首轮缓存构建的编码批次旋钮（与 newbie 的 newbie_cache_build_* 一对一对应）。
// 后端读点:trainer_anima_cache_runtime.py 的 _build_anima_cache_now。
export const S_ANIMA_CACHE_BUILD = [
  { key: 'anima_cache_build_batch_size', type: 'number', label: '缓存构建批大小', title: 'anima_cache_build_batch_size', desc: '首轮缓存构建时每批 VAE 编码的图像数。越大越快、显存占用越高（VAE 切片已默认打开，按批维逐张编码，数值与批大小无关）。', defaultValue: 8, min: 1, step: 1 },
  { key: 'anima_cache_build_prefetch', type: 'boolean', label: '缓存构建 CPU 预取', title: 'anima_cache_build_prefetch', desc: '首轮缓存构建时在 CPU 线程预解码下一批图像，与 GPU 编码重叠。', defaultValue: false }
];

export const S_ANIMA_DIT_ADAPTER = [
  { key: 'anima_dit_adapter_path', type: 'file', pickerType: 'model-file', label: 'DiT Adapter 路径', title: 'anima_dit_adapter_path', desc: '训练前应用到 Anima DiT 的 adapter checkpoint；留空则不加载。', defaultValue: '' }
];

export const S_ANIMA_MERGE_EXPORT = [
  { key: 'anima_merge_export', type: 'boolean', label: '保存后导出合并 Anima 整模', title: 'anima_merge_export', desc: '训练完成后将 LoRA 合并进 Anima DiT 并额外保存 dense 整模（体积大）。', defaultValue: false }
];

export const S_KREA2_MERGE_EXPORT = [
  { key: 'krea2_merge_export', type: 'boolean', label: '保存后导出合并 Krea2 整模', title: 'krea2_merge_export', desc: '训练完成后将 LoRA 合并进 Krea-2 DiT 并额外保存 dense 整模。', defaultValue: false }
];

export const S_BOOGU_MERGE_EXPORT = [
  { key: 'boogu_merge_export', type: 'boolean', label: '保存后导出合并整模', title: 'boogu_merge_export', desc: '训练完成后将 LoRA 合并进 Boogu 系 DiT 并额外保存 dense 整模。', defaultValue: false }
];

export const S_NEWBIE_MERGE_EXPORT = [
  { key: 'newbie_merge_export', type: 'boolean', label: '保存后导出合并 Newbie 整模', title: 'newbie_merge_export', desc: '训练完成后将 LoRA 合并进 Newbie 整模并额外保存 dense 包。', defaultValue: false }
];

export const S_FLUX_TRAINING = [
  { key: 'ddpm_timestep_sampling', type: 'select', label: 'DDPM 时间步采样', title: 'ddpm_timestep_sampling', desc: '留空=均匀采样；logit_normal=对数正态分布（FLUX 实验项）。', defaultValue: '', options: [
    { value: '', label: '默认（均匀）' },
    { value: 'logit_normal', label: 'logit_normal' }
  ] },
  { key: 'flux_transformer_offload', type: 'select', label: 'FLUX Transformer Offload', title: 'flux_transformer_offload', desc: 'FLUX 预览/训练时 transformer 块 offload 策略。auto=按显存自动。', defaultValue: 'auto', options: [
    { value: 'auto', label: 'auto（自动）' },
    { value: 'off', label: 'off（关闭）' },
    { value: 'aggressive', label: 'aggressive（激进）' }
  ] }
];

export const S_WAN22_VIDEO = [
  { key: 'wan22_target_frames', type: 'number', label: '目标帧数', title: 'wan22_target_frames', desc: '训练 clip 目标帧数；1=单帧/图生视频退化。', defaultValue: 1, min: 1, step: 1 },
  { key: 'wan22_frame_stride', type: 'number', label: '帧步长', title: 'wan22_frame_stride', desc: '采样相邻帧的 stride；1=连续帧。', defaultValue: 1, min: 1, step: 1 }
];

export const S_LTX23_VIDEO = [
  { key: 'ltx23_target_frames', type: 'number', label: '目标帧数', title: 'ltx23_target_frames', desc: '训练 clip 目标帧数。', defaultValue: 1, min: 1, step: 1 },
  { key: 'ltx23_frame_stride', type: 'number', label: '帧步长', title: 'ltx23_frame_stride', desc: '采样相邻帧的 stride。', defaultValue: 1, min: 1, step: 1 },
  ...LTX23_AUDIO_FIELDS,
];

// 全局周期 reclaim（optimizer step 边界；0=关）。与 cuda_cache_release_strategy 正交。
// 必须定义在 S_SPEED_* 之前（const 不可后引用）。
export const S_MEMORY_RECLAIM = [
  { key: 'memory_reclaim_interval_steps', type: 'number', label: '周期显存回收间隔', title: 'memory_reclaim_interval_steps', desc: '每 N 个优化 step 做一次 gc+empty_cache（可选 ipc_collect）。0=关闭。与「CUDA 缓存释放策略」独立；勿设过小以免拖慢训练。', defaultValue: 0, min: 0 },
  { key: 'memory_reclaim_ipc_collect', type: 'boolean', label: '回收时 IPC collect', title: 'memory_reclaim_ipc_collect', desc: 'reclaim 时尝试 cuda.ipc_collect。默认开启。', defaultValue: true, visibleWhen: (c) => Number(c.memory_reclaim_interval_steps || 0) > 0 },
  { key: 'memory_reclaim_on_circuit_open', type: 'boolean', label: '熔断时强制回收', title: 'memory_reclaim_on_circuit_open', desc: 'GPU 硬件熔断 OPEN 时额外强制 reclaim 一次。默认开启。', defaultValue: true }
];

const TRAINING_VRAM_TIER_GB = [6, 8, 12, 16, 24, 32];
const TRAINING_VRAM_MINIMUM_BY_FAMILY = { anima: 6, krea2: 12, minimax_h3: 8, flux2: 16, sd3: 24, boogu: 16, zimage: 16, wan22: 6, ltx23: 6 };
function trainingVramFamily(config = {}) {
  const route = String(config.model_train_type || config.training_type || config.schema_id || '').trim().toLowerCase().replaceAll('-', '_');
  if (route.includes('minimax') || route.includes('h3')) return 'minimax_h3';
  if (route.includes('krea')) return 'krea2';
  if (route.includes('flux2')) return 'flux2';
  if (route.includes('sd3')) return 'sd3';
  if (route.includes('boogu')) return 'boogu';
  if (route.includes('zimage') || route.includes('z_image')) return 'zimage';
  if (route.includes('wan')) return 'wan22';
  if (route.includes('ltx')) return 'ltx23';
  if (route.includes('anima')) return 'anima';
  return '';
}
export function trainingVramProfileOptions(config = {}) {
  const minimum = TRAINING_VRAM_MINIMUM_BY_FAMILY[trainingVramFamily(config)];
  const unavailable = !minimum;
  const reason = unavailable ? '该模型尚未接入训练显存档位' : `该模型当前最低从 ${minimum} GB 开始，低档没有可信训练证据`;
  return [{ value: 'off', label: '关闭' }, { value: 'auto', label: '自动', disabled: unavailable, disabledReason: reason }, ...TRAINING_VRAM_TIER_GB.map((size) => ({ value: `${size}g`, label: `${size} GB${minimum && size === minimum ? '（当前最低）' : ''}`, disabled: unavailable || size < minimum, disabledReason: reason }))];
}
export const TRAINING_VRAM_PROFILE_FIELD = {
  key: 'training_vram_profile',
  type: 'select',
  label: '训练显存档位',
  title: 'training_vram_profile',
  desc: '提交目标显存档位；是否已验证由后端按模型家族、变体和实测证据决定。选择 6GB 不代表所有模型都支持 6GB。',
  defaultValue: 'off',
  options: trainingVramProfileOptions,
};

export const TRAINING_VRAM_PROFILE_HIDDEN_FIELDS = [
  { key: 'training_vram_profile_control', type: 'hidden', defaultValue: 'managed' },
  { key: 'detected_vram_gb', type: 'hidden', defaultValue: 0 },
];

// GPU 硬件熔断（温度/VRAM%/throttle/ECC）；与 duty/cooldown 热管理及 SafeGuard loss 门正交；default-off。
export const S_GPU_CIRCUIT = [
  { key: 'gpu_circuit_enabled', type: 'boolean', label: '启用 GPU 硬件熔断', title: 'gpu_circuit_enabled', desc: '按温度/显存占用/throttle/ECC 建议 STOP（checkpoint 友好）。无 NVML 时自动降级 no-op。', defaultValue: false },
  { key: 'gpu_circuit_poll_interval_steps', type: 'number', label: '熔断轮询间隔(步)', title: 'gpu_circuit_poll_interval_steps', desc: '每 N 个优化 step 轮询一次 GPU 健康。', defaultValue: 10, min: 1, visibleWhen: when('gpu_circuit_enabled', true) },
  { key: 'gpu_circuit_temp_c', type: 'number', label: '熔断温度(℃)', title: 'gpu_circuit_temp_c', desc: '达到该温度硬 OPEN。0=不按温度硬开。', defaultValue: 0, min: 0, visibleWhen: when('gpu_circuit_enabled', true) },
  { key: 'gpu_circuit_temp_warn_c', type: 'number', label: '温度警告带(℃)', title: 'gpu_circuit_temp_warn_c', desc: '低于硬阈的警告带；0=关闭警告。', defaultValue: 0, min: 0, visibleWhen: when('gpu_circuit_enabled', true) },
  { key: 'gpu_circuit_vram_util_pct', type: 'number', label: '显存占用熔断(%)', title: 'gpu_circuit_vram_util_pct', desc: 'used/total×100 达到该值 OPEN。0=关闭。', defaultValue: 0, min: 0, max: 100, step: 1, visibleWhen: when('gpu_circuit_enabled', true) },
  { key: 'gpu_circuit_trip_on_throttle', type: 'boolean', label: 'Throttle 时熔断', title: 'gpu_circuit_trip_on_throttle', desc: '检测到 critical throttle 时 OPEN。', defaultValue: true, visibleWhen: when('gpu_circuit_enabled', true) },
  { key: 'gpu_circuit_trip_on_ecc', type: 'boolean', label: 'ECC 未纠正时熔断', title: 'gpu_circuit_trip_on_ecc', desc: '检测到 ECC uncorrected 增量时 OPEN。', defaultValue: true, visibleWhen: when('gpu_circuit_enabled', true) },
  { key: 'gpu_circuit_device_index', type: 'number', label: '熔断设备索引', title: 'gpu_circuit_device_index', desc: 'NVML/smi 轮询的 GPU 索引。', defaultValue: 0, min: 0, visibleWhen: when('gpu_circuit_enabled', true) }
];

export const S_SPEED_SDXL = [
  { key: 'acceleration_profile', type: 'select', label: '模型加速档位', title: 'acceleration_profile', desc: '按当前模型族做加速预检与档位建议', defaultValue: 'off', options: ACCELERATION_PROFILE_OPTIONS },
  TRAINING_VRAM_PROFILE_FIELD,
  ...TRAINING_VRAM_PROFILE_HIDDEN_FIELDS,
  // (separator for TypeScript parser)
  { key: 'mixed_precision', type: 'select', label: '混合精度', title: 'mixed_precision', desc: '训练混合精度, RTX30系列以后也可以指定 bf16', defaultValue: 'bf16', options: ['no', 'fp16', 'bf16'] },
  // Attention 默认跟随 launcher runtime（auto）；布尔开关仅高级/专家覆盖，避免 schema 默认 sdpa 污染。
  { key: 'xformers', type: 'boolean', label: '启用 xformers', title: 'xformers', desc: '高级覆盖：强制 xformers。', defaultValue: false, requiresAttentionBackend: 'xformers', visibleWhen: when('performance_expert_mode', true) },
  { key: 'sdpa', type: 'boolean', label: '启用 SDPA', title: 'sdpa', desc: '高级覆盖：强制 SDPA', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'sageattn', type: 'boolean', label: '启用 SageAttention', title: 'sageattn', desc: '高级覆盖：强制 SageAttention。默认跟随启动环境。', defaultValue: false, requiresAttentionBackend: 'sageattn', visibleWhen: when('performance_expert_mode', true) },
  { key: 'experimental_attention_profile_enabled', type: 'boolean', label: 'Sliding Window Attention', title: 'experimental_attention_profile_enabled', desc: '把注意力限制在滑动窗口内以降低长序列开销；关闭时为完整注意力。不是耗时统计开关。', defaultValue: false },
  { key: 'experimental_attention_profile_window', type: 'number', label: '窗口大小 (token)', title: 'experimental_attention_profile_window', desc: '每个 token 可关注的历史窗口长度（token 数，不是步数）；0 表示完整注意力。', defaultValue: 50, min: 1, visibleWhen: when('experimental_attention_profile_enabled', true) },
  { key: 'flashattn', type: 'boolean', label: '启用 FlashAttention 2', title: 'flashattn', desc: '高级覆盖：强制 FlashAttention 2。', defaultValue: false, requiresAttentionBackend: 'flash2', visibleWhen: when('performance_expert_mode', true) },
  { key: 'cross_attn_fused_kv', type: 'boolean', label: '启用 Fused K/V', title: 'cross_attn_fused_kv', desc: '启用 SDXL cross-attn 的 fused K/V', defaultValue: false },
  { key: 'fused_projection_memory_mode', type: 'select', label: 'Fused Projection 显存模式', title: 'fused_projection_memory_mode', desc: 'keep_original 最兼容', defaultValue: 'keep_original', options: FUSED_PROJECTION_MEMORY_MODE_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), when('cross_attn_fused_kv', true)) },
  { key: 'mem_eff_attn', type: 'boolean', label: '低显存注意力', title: 'mem_eff_attn', desc: '高级覆盖：省显存 attention（比 xformers 更省显存但更慢）。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'lowram', type: 'boolean', label: '低内存模式', title: 'lowram', desc: '低内存模式 该模式下会将 U-net、文本编码器、VAE 直接加载到显存中', defaultValue: false },
  { key: 'cache_latents', type: 'boolean', label: '缓存 Latent', title: 'cache_latents', desc: '预先把训练图 VAE 编码成 latent 缓存，训练时不再重复跑 VAE。', defaultValue: true },
  { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘', title: 'cache_latents_to_disk', desc: '缓存图像 latent 到磁盘', defaultValue: false },
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式', title: 'latent_cache_disk_format', desc: 'latent 磁盘缓存格式', defaultValue: 'npz', options: ['safetensors', 'npz'] },
  { key: 'latent_cache_disk_dtype', type: 'select', label: 'Latent 缓存精度', title: 'latent_cache_disk_dtype', desc: 'latent 磁盘缓存保存精度', defaultValue: 'fp16', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: when('cache_latents_to_disk', true) },
  { key: 'cache_text_encoder_outputs', type: 'boolean', label: '缓存文本编码器输出', title: 'cache_text_encoder_outputs', desc: '缓存文本编码器的输出，减少显存使用。', defaultValue: false },
  { key: 'cache_text_encoder_outputs_to_disk', type: 'boolean', label: '缓存文本编码器输出到磁盘', title: 'cache_text_encoder_outputs_to_disk', desc: '缓存文本编码器的输出到磁盘', defaultValue: false },
  { key: 'text_encoder_outputs_cache_disk_format', type: 'select', label: '文本缓存格式', title: 'text_encoder_outputs_cache_disk_format', desc: '文本编码器输出磁盘缓存格式', defaultValue: 'npz', options: ['safetensors', 'npz'], visibleWhen: when('cache_text_encoder_outputs_to_disk', true) },
  { key: 'text_encoder_outputs_cache_dtype', type: 'select', label: '文本缓存精度', title: 'text_encoder_outputs_cache_dtype', desc: '文本编码器输出磁盘缓存保存精度', defaultValue: 'fp16', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: when('cache_text_encoder_outputs_to_disk', true) },
  { key: 'te_vae_offload_strategy', type: 'select', label: 'TE/VAE Offload 策略', title: 'te_vae_offload_strategy', desc: 'phase 为默认训练生命周期策略;grouped 让 CLIP-L 与 VAE 常驻显卡、T5 仍每步搬运', defaultValue: 'phase', options: ['phase', 'aggressive', 'resident', 'grouped'] },
  { key: 'cuda_cache_release_strategy', type: 'select', label: 'CUDA 缓存释放策略', title: 'cuda_cache_release_strategy', desc: 'oom_only 仅在 OOM 恢复时释放', defaultValue: 'oom_only', options: [
    { value: 'off', label: '关闭' },
    { value: 'oom_only', label: '仅 OOM 恢复' },
    { value: 'phase_boundary', label: '阶段边界' },
    { value: 'after_optimizer', label: '优化器后释放' },
    { value: 'aggressive', label: '激进低显存' }
  ] },
  { key: 'cuda_cache_release_interval', type: 'number', label: '缓存释放间隔', title: 'cuda_cache_release_interval', desc: '每 N 个优化 step 允许一次缓存释放。', defaultValue: 1, min: 1, visibleWhen: (c) => c.cuda_cache_release_strategy && c.cuda_cache_release_strategy !== 'off' },
  ...S_MEMORY_RECLAIM,
  // (separator for TypeScript parser)
  { key: 'model_to_condition_enabled', type: 'boolean', label: 'ModelToCondition', title: 'model_to_condition_enabled', desc: '启用共享条件生成协议', defaultValue: true },
  { key: 'sdxl_unet_backend', type: 'select', label: 'SDXL U-Net 后端', title: 'sdxl_unet_backend', desc: 'diffusers 为稳定默认', defaultValue: 'diffusers', options: ['diffusers', 'native_shadow', 'native_proxy', 'native_skeleton', 'lulynx_native'] },
  { key: 'lulynx_weight_residency', type: 'select', label: 'Layer-level Residency', title: 'lulynx_weight_residency', desc: '控制 native SDXL 冻结 base', defaultValue: 'resident', options: [
    { value: 'resident', label: '常驻 GPU' },
    { value: 'linear_cpu_pinned', label: 'Linear CPU pinned（省显存）' },
    { value: 'linear_conv_cpu_pinned', label: 'Linear + Conv2d CPU pinned（最省显存）' }
  ], visibleWhen: when('sdxl_unet_backend', 'lulynx_native') },
  { key: 'lulynx_weight_residency_min_params', type: 'number', label: 'Residency 最小参数量', title: 'lulynx_weight_residency_min_params', desc: '只托管参数量达到该阈值的 Linear/Conv2d。', defaultValue: 0, min: 0, visibleWhen: all(when('sdxl_unet_backend', 'lulynx_native'), (c) => c.lulynx_weight_residency && c.lulynx_weight_residency !== 'resident') },
  { ...PCIE_TRANSFER_FORMAT_FIELD, visibleWhen: all(when('sdxl_unet_backend', 'lulynx_native'), (c) => c.lulynx_weight_residency && c.lulynx_weight_residency !== 'resident') },
  ...vortexRuntimeFields('lulynx_weight_residency', when('sdxl_unet_backend', 'lulynx_native')),
  { ...pcieDeltaCacheField('lulynx_weight_residency'), visibleWhen: all(when('sdxl_unet_backend', 'lulynx_native'), (c) => c.lulynx_weight_residency && c.lulynx_weight_residency !== 'resident') },
  ...pcieDeltaCacheModeFields('lulynx_weight_residency'),
  { key: 'lulynx_precision_swap_enabled', type: 'boolean', label: 'Lulynx Precision Swap', title: 'lulynx_precision_swap_enabled', desc: '启用 Lulynx 精准交换规划兼容层。', defaultValue: false },
  { key: 'lulynx_precision_swap_strategy', type: 'select', label: 'Precision Swap 策略', title: 'lulynx_precision_swap_strategy', desc: 'balanced 优先 output/mid 高收益 block', defaultValue: 'balanced', options: ['balanced', 'aggressive', 'off'], visibleWhen: when('lulynx_precision_swap_enabled', true) },
  { key: 'full_fp16', type: 'boolean', label: '完全 FP16', title: 'full_fp16', desc: '完全使用 FP16 精度', defaultValue: false },
  { key: 'full_bf16', type: 'boolean', label: '完全 BF16', title: 'full_bf16', desc: '完全使用 BF16 精度', defaultValue: false },
  { key: 'no_half_vae', type: 'boolean', label: '不使用半精度 VAE', title: 'no_half_vae', desc: 'VAE 强制 fp32 运行，规避旧 VAE 的 fp16 数值问题。', defaultValue: false },
  { key: 'persistent_data_loader_workers', type: 'boolean', label: '保持数据加载器', title: 'persistent_data_loader_workers', desc: '保留加载训练集的 worker，减少每个 epoch 之间的停顿', defaultValue: true },
  { key: 'vae_batch_size', type: 'number', label: 'VAE 最大编码批量', title: 'vae_batch_size', desc: '限制 Anima / Newbie 缓存编码的 VAE 批次，0 沿用模型族设置；其他逐张编码路径保持批量 1。', defaultValue: 0, min: 0 },
  { key: 'vram_swap_to_ram', type: 'boolean', label: 'VRAM Swap to RAM', title: 'vram_swap_to_ram', desc: '让原生 LoRA / Frozen-A LoRA / 渐进秩 LoRA / VeRA', defaultValue: false },
  { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点', title: 'cpu_offload_checkpointing', desc: '梯度检查点时将部分张量卸载到 CPU，节省显存', defaultValue: false },
  { key: 'swap_granularity', type: 'select', label: '显存交换模式', title: 'swap_granularity', desc: '显存交换的粒度模式（整组/逐块/合并搬运/异步流水线）。', defaultValue: 'off', options: ['off', 'auto', 'block', 'merged_block', 'layer'] },
  { key: 'swap_ratio', type: 'slider', label: '显存交换比例', title: 'swap_ratio', desc: '按原始 block/layer 总数计算交换比例。', defaultValue: 0, min: 0, max: 1, step: 0.05, visibleWhen: swapEnabled },
  { key: 'swap_count', type: 'number', label: '显存交换数量', title: 'swap_count', desc: '高级：绝对交换数量。大于 0 时优先于比例。', defaultValue: 0, min: 0, visibleWhen: swapEnabled },
  { key: 'block_merge_size', type: 'number', label: '合并 Block 大小', title: 'block_merge_size', desc: 'merged_block 模式下每组包含的 block 数，不跨', defaultValue: 2, min: 2, visibleWhen: when('swap_granularity', 'merged_block') },
  { key: 'block_swap_strategy', type: 'select', label: 'BlockSwap 搬运策略', title: 'block_swap_strategy', desc: 'auto 使用后端解析', defaultValue: 'auto', options: BLOCK_SWAP_STRATEGY_OPTIONS, visibleWhen: all(swapEnabled, when('performance_expert_mode', true)) },
    ...S_GRADIENT_RELEASE,
  ...S_OPTIMIZER_STATE_PAGING,
  ...S_PERFORMANCE_STANDARD,
  // (separator for TypeScript parser)
  { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化', title: 'pytorch_cuda_expandable_segments', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandabl', defaultValue: true }
];
export const S_SPEED_FLOW = [
  { key: 'acceleration_profile', type: 'select', label: '模型加速档位', title: 'acceleration_profile', desc: '按当前模型族做加速预检与档位建议', defaultValue: 'off', options: ACCELERATION_PROFILE_OPTIONS },
  TRAINING_VRAM_PROFILE_FIELD,
  ...TRAINING_VRAM_PROFILE_HIDDEN_FIELDS,
  // (separator for TypeScript parser)
  { key: 'mixed_precision', type: 'select', label: '混合精度', title: 'mixed_precision', desc: '训练混合精度, RTX30系列以后也可以指定 bf16', defaultValue: 'bf16', options: ['no', 'fp16', 'bf16'] },
  { key: 'low_vram_autotune_mode', type: 'select', label: 'Triton 低显存调优模式', title: 'low_vram_autotune_mode', desc: '默认 off 保持现有 Triton 行为', defaultValue: 'off', options: [
    { value: 'off', label: '关闭' },
    { value: 'conservative', label: '低显存保守模式' }
  ] },
  { key: 'weight_compression_preset', type: 'select', label: '权重压缩预设', title: 'weight_compression_preset', desc: '冻结基座压缩。推荐「骨干 INT8」。与 keep_w8 / fp8_base 互斥；下方「训练量化快捷」非 off 时以快捷为准，此处会被覆盖。', defaultValue: 'off', options: [
    { value: 'off', label: '关闭' },
    { value: 'stable_backbone_int8', label: '骨干 INT8（运行时压缩，非 Comfy 导出）' },
    { value: 'experimental_float8', label: '主干 FP8（RTX 40 系）' },
    { value: 'text_encoder_int8', label: '文本编码器 INT8' },
    { value: 'both_int8', label: '主干+文本编码器 INT8' }
  ] },
  { key: 'train_quant_preset', type: 'select', label: '训练量化快捷', title: 'train_quant_preset', desc: '产品糖：映射到 weight_compression_preset。推荐 stable_backbone_int8；off=不改。与 keep_w8 互斥。', defaultValue: 'off', options: [
    { value: 'off', label: '关闭' },
    { value: 'stable_backbone_int8', label: '冻结骨干 INT8' }
  ] },
  { key: 'dit_low_vram_profile', type: 'select', label: 'DiT 低显存档案', title: 'dit_low_vram_profile', desc: '映射到既有 block residency / module_offload，不是第三套 offload。bounce 已归档。默认 off。', defaultValue: 'off', options: [
    { value: 'off', label: '关闭（不改 knobs）' },
    { value: 'balanced', label: '均衡' },
    { value: 'aggressive', label: '激进' }
  ] },
  { key: 'weight_compression_enabled', type: 'boolean', label: '手动启用权重压缩', title: 'weight_compression_enabled', desc: '高级：在不走预设时直接启用压缩。通常选上方预设即可。', defaultValue: false },
  { key: 'weight_compression_target', type: 'select', label: '压缩目标', title: 'weight_compression_target', desc: 'none/backbone/text_encoder', defaultValue: 'none', options: [
    { value: 'none', label: 'none' },
    { value: 'backbone', label: 'backbone（主干）' },
    { value: 'text_encoder', label: 'text_encoder' },
    { value: 'both', label: 'both' }
  ], visibleWhen: (c) => {
    const preset = String(c.weight_compression_preset || 'off').trim().toLowerCase();
    return preset !== 'off' || c.weight_compression_enabled === true;
  } },
  { key: 'weight_compression_format', type: 'select', label: '压缩格式', title: 'weight_compression_format', desc: '底层压缩后端。fp8_e4m3 默认；fp8_scaled_e4m3 带 per-output-channel 缩放,仅 krea2 / FLUX.1 / FLUX.2 / Z-Image / Wan2.2 支持且压缩目标必须是 backbone。', defaultValue: 'fp8_e4m3', options: [
    { value: 'fp8_e4m3', label: 'fp8_e4m3' },
    { value: 'fp8_scaled_e4m3', label: 'fp8_scaled_e4m3（krea2 / FLUX.1 / FLUX.2 / Z-Image / Wan2.2，仅 backbone）' },
    { value: 'torchao_int8', label: 'torchao_int8' },
    { value: 'torchao_uint4', label: 'torchao_uint4' },
    { value: 'torchao_float8', label: 'torchao_float8' },
    { value: 'quanto_int8', label: 'quanto_int8' },
    { value: 'quanto_float8', label: 'quanto_float8' }
  ], visibleWhen: (c) => {
    const preset = String(c.weight_compression_preset || 'off').trim().toLowerCase();
    return preset !== 'off' || c.weight_compression_enabled === true;
  } },
  { key: 'weight_compression_verify', type: 'boolean', label: '压缩能力探测', title: 'weight_compression_verify', desc: '启动前探测所选压缩后端是否真实可用。建议保持开启。', defaultValue: true, visibleWhen: (c) => {
    const preset = String(c.weight_compression_preset || 'off').trim().toLowerCase();
    return preset !== 'off' || c.weight_compression_enabled === true;
  } },
  // keep_w8 训时路径（与 weight_compression 底座压缩不同；非 lulynx 顶部加速）
  { key: 'quant_train_mode', type: 'boolean', label: '保持 INT8 冻结训练', title: 'quant_train_mode', desc: '关闭（默认）=正常训练：若加载的是量化模型，先反量化再训。开启=主干权重保持 INT8 冻结、仅训高精度 LoRA（省显存，仅对量化模型包有意义）。与 vendor keep_storage（部分 FP8）互斥。', defaultValue: false },
  { key: 'keep_w8_vram_prefer', type: 'boolean', label: 'keep_w8 显存优先', title: 'keep_w8_vram_prefer', desc: '降低训练步峰值显存，训练步通常变慢约 20%–40% 或更多。需先开启「保持 INT8 冻结训练」。', defaultValue: false, visibleWhen: (c) => isKeepW8Mode(c.quant_train_mode) },
  { key: 'quant_train_convrot', type: 'boolean', label: 'keep_w8 ConvRot 真旋转', title: 'quant_train_convrot', desc: 'keep_w8 时对匹配层做真 group-RHT（与 Comfy convrot 导出一致）。', defaultValue: false, visibleWhen: (c) => isKeepW8Mode(c.quant_train_mode) },
  { key: 'layer_precision_policy', type: 'select', label: '分层精度策略', title: 'layer_precision_policy', desc: '保护输入/输出、时间调制、AdaLN/Norm 等敏感层；导出与 keep-W8 共用。', defaultValue: 'sensitive_bf16', options: ['sensitive_bf16', 'off'] },
  { key: 'layer_precision_default', type: 'select', label: '普通层默认精度', title: 'layer_precision_default', desc: '普通量化候选层默认格式。', defaultValue: 'int8_convrot', options: ['int8_convrot', 'int8_rowwise', 'fp8_scaled', 'bf16'] },
  { key: 'layer_precision_sensitivity_mode', type: 'select', label: '层敏感度评估', title: 'layer_precision_sensitivity_mode', desc: 'weight 为有界重建误差；activation_geometry 使用聚合 E[x²]。', defaultValue: 'off', options: ['off', 'weight', 'activation_geometry'] },
  { key: 'layer_precision_activation_geometry_path', type: 'file', pickerType: 'model-file', label: '激活几何 Artifact', title: 'layer_precision_activation_geometry_path', desc: '只读取聚合 E[x²] 的 native safetensors。', defaultValue: '', visibleWhen: when('layer_precision_sensitivity_mode', 'activation_geometry') },
  { key: 'layer_precision_rules_json', type: 'textarea', label: '分层精度规则 JSON', title: 'layer_precision_rules_json', desc: '按 family/glob/block 分配精度。', defaultValue: '', visibleWhen: when('performance_expert_mode', true) },
  { key: 'layer_precision_overrides_json', type: 'textarea', label: '分层精度强制覆盖 JSON', title: 'layer_precision_overrides_json', desc: '只用于经过 A/B 签字的精确覆盖。', defaultValue: '', visibleWhen: when('performance_expert_mode', true) },
  { key: 'quant_requantize_policy', type: 'select', label: '量化模型再次量化', title: 'quant_requantize_policy', desc: 'avoid 默认退避，避免二次量化噪声。', defaultValue: 'avoid', options: ['avoid', 'allow'] },
  { key: 'tuneqdm_enabled', type: 'boolean', label: 'TuneQDM 可训练量化 scale', title: 'tuneqdm_enabled', desc: '实验性（ECCV 2024 TuneQDM）：INT8 权重保持冻结，仅把反量化 scale 当作可训练参数；可与 LoRA 叠加，也可单独使用。需先开启「保持 INT8 冻结训练」（keep_w8 底座），否则自动跳过。训练出的 scale 会随 checkpoint 存为 .tuneqdm_scales.safetensors 附属文件。合成验证通过，真机短训质量尚未签字。', defaultValue: false, visibleWhen: (c) => isKeepW8Mode(c.quant_train_mode) },
  { key: 'tuneqdm_warmup_steps', type: 'number', label: 'TuneQDM scale 升温步数', title: 'tuneqdm_warmup_steps', desc: '前 N 个优化步对 scale 参数组做学习率线性升温（0→1 乘子），避免初期 scale 抖动破坏量化底座；0=不升温。', defaultValue: 500, min: 0, step: 1, visibleWhen: (c) => isKeepW8Mode(c.quant_train_mode) && c.tuneqdm_enabled === true },
  { key: 'fp8_base', type: 'boolean', label: '基础模型使用 FP8（旧）', title: 'fp8_base', desc: '【已弃用】请使用上方的「权重压缩预设」。此字段保留用于向后兼容旧配置', defaultValue: false },
  { key: 'sdpa', type: 'boolean', label: '启用 SDPA', title: 'sdpa', desc: '高级覆盖：强制 SDPA', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'sageattn', type: 'boolean', label: '启用 SageAttention', title: 'sageattn', desc: '高级覆盖：强制 SageAttention。默认跟随启动环境。', defaultValue: false, requiresAttentionBackend: 'sageattn', visibleWhen: when('performance_expert_mode', true) },
  { key: 'experimental_attention_profile_enabled', type: 'boolean', label: 'Sliding Window Attention', title: 'experimental_attention_profile_enabled', desc: '把注意力限制在滑动窗口内以降低长序列开销；关闭时为完整注意力。不是耗时统计开关。', defaultValue: false },
  { key: 'experimental_attention_profile_window', type: 'number', label: '窗口大小 (token)', title: 'experimental_attention_profile_window', desc: '每个 token 可关注的历史窗口长度（token 数，不是步数）；0 表示完整注意力。', defaultValue: 50, min: 1, visibleWhen: when('experimental_attention_profile_enabled', true) },
  { key: 'flashattn', type: 'boolean', label: '启用 FlashAttention 2', title: 'flashattn', desc: '高级覆盖：强制 FlashAttention 2。默认跟随启动环境。', defaultValue: false, requiresAttentionBackend: 'flash2', visibleWhen: when('performance_expert_mode', true) },
  { key: 'mem_eff_attn', type: 'boolean', label: '低显存注意力', title: 'mem_eff_attn', desc: '高级覆盖：省显存 attention。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'lowram', type: 'boolean', label: '低内存模式', title: 'lowram', desc: '低内存模式 该模式下会将 U-net、文本编码器、VAE 直接加载到显存中', defaultValue: false },
  { key: 'cache_latents', type: 'boolean', label: '缓存 Latent', title: 'cache_latents', desc: '预先把训练图 VAE 编码成 latent 缓存，训练时不再重复跑 VAE。', defaultValue: true },
  { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘', title: 'cache_latents_to_disk', desc: '缓存图像 latent 到磁盘', defaultValue: false },
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式', title: 'latent_cache_disk_format', desc: 'latent 磁盘缓存格式', defaultValue: 'npz', options: ['safetensors', 'npz'] },
  { key: 'latent_cache_disk_dtype', type: 'select', label: 'Latent 缓存精度', title: 'latent_cache_disk_dtype', desc: 'latent 磁盘缓存保存精度', defaultValue: 'fp16', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: when('cache_latents_to_disk', true) },
  { key: 'cache_text_encoder_outputs', type: 'boolean', label: '缓存文本编码器输出', title: 'cache_text_encoder_outputs', desc: '缓存文本编码器的输出，减少显存使用。', defaultValue: false },
  { key: 'cache_text_encoder_outputs_to_disk', type: 'boolean', label: '缓存文本编码器输出到磁盘', title: 'cache_text_encoder_outputs_to_disk', desc: '缓存文本编码器的输出到磁盘', defaultValue: false },
  { key: 'text_encoder_outputs_cache_disk_format', type: 'select', label: '文本缓存格式', title: 'text_encoder_outputs_cache_disk_format', desc: '文本编码器输出磁盘缓存格式', defaultValue: 'npz', options: ['safetensors', 'npz'], visibleWhen: when('cache_text_encoder_outputs_to_disk', true) },
  { key: 'text_encoder_outputs_cache_dtype', type: 'select', label: '文本缓存精度', title: 'text_encoder_outputs_cache_dtype', desc: '文本编码器输出磁盘缓存保存精度', defaultValue: 'fp16', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: when('cache_text_encoder_outputs_to_disk', true) },
  { key: 'blocks_to_swap', type: 'number', label: 'Block 交换数', title: 'blocks_to_swap', desc: '在 CPU/GPU 间交换的 block 数量，省显存。', defaultValue: '', min: 1 },
  { key: 'fp8_base_unet', type: 'boolean', label: '仅 U-Net FP8', title: 'fp8_base_unet', desc: '仅对 U-Net / DiT 使用 FP8 精度', defaultValue: false },
  { key: 'text_encoder_batch_size', type: 'number', label: '文本编码器缓存批量', title: 'text_encoder_batch_size', desc: '文本编码器缓存批量大小', defaultValue: '', min: 1 },
  { key: 'disable_mmap_load_safetensors', type: 'boolean', label: '禁用 mmap 加载', title: 'disable_mmap_load_safetensors', desc: '禁用 safetensors 的 mmap 加载，NFS 挂载或 Windows 兼容问题时开启。', defaultValue: false },
  { key: 'full_fp16', type: 'boolean', label: '完全 FP16', title: 'full_fp16', desc: '完全使用 FP16 精度', defaultValue: false },
  { key: 'full_bf16', type: 'boolean', label: '完全 BF16', title: 'full_bf16', desc: '完全使用 BF16 精度', defaultValue: false },
  { key: 'no_half_vae', type: 'boolean', label: '不使用半精度 VAE', title: 'no_half_vae', desc: 'VAE 强制 fp32 运行，规避旧 VAE 的 fp16 数值问题。', defaultValue: false },
  { key: 'persistent_data_loader_workers', type: 'boolean', label: '保持数据加载器', title: 'persistent_data_loader_workers', desc: '保留加载训练集的 worker，减少每个 epoch 之间的停顿', defaultValue: true },
  { key: 'vae_batch_size', type: 'number', label: 'VAE 最大编码批量', title: 'vae_batch_size', desc: '限制 Anima / Newbie 缓存编码的 VAE 批次，0 沿用模型族设置；其他逐张编码路径保持批量 1。', defaultValue: 0, min: 0 },
  { key: 'vram_swap_to_ram', type: 'boolean', label: 'VRAM Swap to RAM', title: 'vram_swap_to_ram', desc: '让当前训练路线支持的原生 LoRA 家族适配器权重常驻 CPU RAM', defaultValue: false },
  { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点', title: 'cpu_offload_checkpointing', desc: '梯度检查点时将部分张量卸载到 CPU省显存', defaultValue: false },
  ...S_GRADIENT_RELEASE,
  ...S_OPTIMIZER_STATE_PAGING,
  ...S_MEMORY_RECLAIM,
  ...S_PERFORMANCE_STANDARD,
  // (separator for TypeScript parser)
  { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化', title: 'pytorch_cuda_expandable_segments', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandabl', defaultValue: true }
];
export const S_DISTRIBUTED = [
  { key: 'enable_distributed_training', type: 'boolean', label: '启用分布式训练', title: 'enable_distributed_training', desc: '启用多进程分布式训练（DDP），需 torchrun 启动。', defaultValue: false },
  { key: 'distributed_strategy', type: 'select', label: '分布式策略', title: 'distributed_strategy', desc: 'auto=按 GPU 数推断（多卡→ddp，单卡→none）；fsdp2 用 torch fully_shard 分片；deepspeed 需环境已装 deepspeed 包，没装会在启动进程组时直接报错。', defaultValue: 'auto', options: [
    { value: 'auto', label: 'auto（自动）' },
    { value: 'none', label: 'none（单进程）' },
    { value: 'ddp', label: 'ddp' },
    { value: 'fsdp2', label: 'fsdp2' },
    { value: 'deepspeed', label: 'deepspeed' }
  ], visibleWhen: when('enable_distributed_training', true) },
  { key: 'fsdp_cpu_offload', type: 'boolean', label: 'FSDP CPU Offload', title: 'fsdp_cpu_offload', desc: 'FSDP2 时把参数/梯度 offload 到 CPU 省显存，代价是每步多一轮主机与显存之间的搬运。torch 没有 CPUOffloadPolicy 时会直接报错，不会静默忽略。', defaultValue: false, visibleWhen: all(when('enable_distributed_training', true), when('distributed_strategy', 'fsdp2')) },
  { key: 'fsdp_auto_wrap_policy', type: 'select', label: 'FSDP 自动包装策略', title: 'fsdp_auto_wrap_policy', desc: 'transformer=按叶子模块逐层包装（默认）；size=只包装直接参数量≥100 万的叶子，小的归到父组；none=只分片根模块。', defaultValue: 'transformer', options: [
    { value: 'transformer', label: 'transformer' },
    { value: 'size', label: 'size' },
    { value: 'none', label: 'none' }
  ], visibleWhen: all(when('enable_distributed_training', true), when('distributed_strategy', 'fsdp2')) },
  { key: 'fsdp_state_dict_type', type: 'select', label: 'FSDP State Dict 类型', title: 'fsdp_state_dict_type', desc: 'full=聚合成一份完整 state（默认，普通加载器直接读得懂）；sharded=每张卡各存自己那片，只有 DCP 加载器读得懂。', defaultValue: 'full', options: ['full', 'sharded'], visibleWhen: all(when('enable_distributed_training', true), when('distributed_strategy', 'fsdp2')) },
  { key: 'num_processes', type: 'number', label: '进程数', title: 'num_processes', desc: '每台机器启动的训练进程数。留空时会优先按所选 GPU 数量自动推断', defaultValue: '', min: 1, visibleWhen: when('enable_distributed_training', true) },
  { key: 'num_machines', type: 'number', label: '机器数', title: 'num_machines', desc: '参与训练的机器总数', defaultValue: 1, min: 1, visibleWhen: when('enable_distributed_training', true) },
  { key: 'machine_rank', type: 'number', label: '当前机器编号', title: 'machine_rank', desc: '当前机器编号，从 0 开始；主节点为 0', defaultValue: 0, min: 0, visibleWhen: when('enable_distributed_training', true) },
  { key: 'main_process_ip', type: 'string', label: '主节点 IP', title: 'main_process_ip', desc: '主节点 IP 地址。多机训练时必填', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'main_process_port', type: 'number', label: '主节点端口', title: 'main_process_port', desc: '主节点 rendezvous 端口', defaultValue: 29500, min: 1, max: 65535, visibleWhen: when('enable_distributed_training', true) },
  { key: 'nccl_socket_ifname', type: 'string', label: 'NCCL 网卡名', title: 'nccl_socket_ifname', desc: '可选。NCCL 使用的网卡名，例如 Ethernet', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'nccl_proto', type: 'select', label: 'NCCL 协议', title: 'nccl_proto', options: [{ value: '', label: '自动' }, 'LL', 'LL128', 'Simple', 'LL,LL128', 'LL,Simple', 'LL128,Simple', 'LL,LL128,Simple'], desc: 'NCCL 集合通信协议（NCCL_PROTO）。留空=自动选择。影响本进程所有 NCCL 通信（不只 TP）；无通用“必然更快”结论，V100/PCIe 建议 LL128 与 Simple 实测对比', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'parallel_backend', type: 'select', label: '集合通信后端', title: 'parallel_backend', options: [
    { value: 'auto', label: 'auto（自动）' },
    { value: 'nccl', label: 'nccl' },
    { value: 'gloo', label: 'gloo' }
  ], desc: 'torch.distributed 进程组后端。auto=非 Windows 且有 CUDA 时用 nccl，否则 gloo；Windows 上原生没有 NCCL，显式选 nccl 会自动降级为 gloo。不再接受 cuda_direct —— 它只是 TP 路径上的 NCCL P2P/IPC 环境提示，灌进 init_process_group 会直接报错。', defaultValue: 'auto', visibleWhen: when('enable_distributed_training', true) },
  { key: 'tensor_parallel_degree', type: 'number', label: '张量并行度', title: 'tensor_parallel_degree', desc: '把 DiT 的线性层按列/行切到多张卡上，每张卡只存自己那一片权重与激活。1=关闭。>1 需要 torchrun 且必须整除 world size，同时该模型家族要有可切的 column/row 对（newbie 与 universal-dit 没有），否则解析配置时就会带原因报错而不是静默降级。LoRA 会跟着一起切（导出的文件与单卡逐位相同）；13 个变体适配器与 Conv2d LoRA 在 >1 时逐个带名字报错。', defaultValue: 1, min: 1, max: 8, visibleWhen: when('enable_distributed_training', true) },
  { key: 'gloo_socket_ifname', type: 'string', label: 'Gloo 网卡名', title: 'gloo_socket_ifname', desc: '可选。Gloo 使用的网卡名，例如 Ethernet', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_config_from_main', type: 'boolean', label: '从主节点同步配置', title: 'sync_config_from_main', desc: '仅 worker 使用。从主节点同步训练配置', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_config_keys_from_main', type: 'string', label: '同步配置键', title: 'sync_config_keys_from_main', desc: '要从主节点同步的顶层配置键，逗号分隔。* = 同步全部', defaultValue: '*', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_missing_assets_from_main', type: 'boolean', label: '从主节点补齐资源', title: 'sync_missing_assets_from_main', desc: '仅 worker 使用。按需从主节点补齐缺失模型、数据集、resume 等路径', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_asset_keys', type: 'string', label: '补齐资源键', title: 'sync_asset_keys', desc: '要从主节点补齐的资源键，逗号分隔', defaultValue: 'pretrained_model_name_or_path,train_data_dir,reg_data_dir,vae,resume', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_main_repo_dir', type: 'string', label: '主节点项目根目录', title: 'sync_main_repo_dir', desc: '优先填写 worker 可直接访问的共享路径/UNC 路径', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_main_toml', type: 'string', label: '主节点 TOML 路径', title: 'sync_main_toml', desc: '主节点用于同步的 TOML 路径', defaultValue: './config/autosave/distributed-main-latest.toml', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_ssh_user', type: 'string', label: 'SSH 用户名', title: 'sync_ssh_user', desc: '远程同步时使用的 SSH 用户名', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_ssh_port', type: 'number', label: 'SSH 端口', title: 'sync_ssh_port', desc: '远程同步使用的 SSH 端口', defaultValue: 22, min: 1, max: 65535, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_use_password_auth', type: 'boolean', label: 'SSH 密码认证', title: 'sync_use_password_auth', desc: '远程同步时启用密码认证', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_ssh_password', type: 'string', label: 'SSH 密码', title: 'sync_ssh_password', desc: '远程同步密码。更推荐改用环境变量或共享路径', defaultValue: '', visibleWhen: all(when('enable_distributed_training', true), when('sync_use_password_auth', true)) },
  { key: 'clear_dataset_npz_before_train', type: 'boolean', label: '训练前清除缓存', title: 'clear_dataset_npz_before_train', desc: 'worker 训练前清空 .', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_timeout', type: 'number', label: 'DDP 超时', title: 'ddp_timeout', desc: '分布式训练超时时间（秒）', defaultValue: '', min: 0, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_gradient_as_bucket_view', type: 'boolean', label: 'DDP Bucket View', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_static_graph', type: 'boolean', label: 'DDP Static Graph', desc: '启用 DDP static_graph 优化', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_find_unused_parameters', type: 'boolean', label: 'DDP 查找未用参数', title: 'ddp_find_unused_parameters', desc: '开启后 DDP 每步遍历计算图找没参与反向的参数。模型里有条件分支、报 expected to have finished reduction 时才需要开，代价是每步略慢。', defaultValue: false, visibleWhen: when('enable_distributed_training', true) }
];

export const S_LULYNX_SDXL = [
  { key: 'lulynx_experimental_core_enabled', type: 'boolean', label: '启用 Lulynx 核心', title: 'lulynx_experimental_core_enabled', desc: '集中管理 SafeGuard、EMA、ResourceManager', defaultValue: false },
  { key: 'lulynx_resource_manager_enabled', type: 'boolean', label: '启用 ResourceManager', title: 'lulynx_resource_manager_enabled', desc: '监控显存占用并按设定节奏清理缓存，防止显存碎片累积', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_resource_log_interval', type: 'number', label: '资源日志间隔', title: 'lulynx_resource_log_interval', desc: '每 N 个优化 step 输出一次资源日志', defaultValue: 25, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_resource_manager_enabled', true)) },
  { key: 'lulynx_block_weight_enabled', type: 'boolean', label: '启用 BlockWeight (SDXL)', title: 'lulynx_block_weight_enabled', desc: '按 SDXL U-Net 结构分组配权：IN（编码侧 0-11）/ MID / OUT（解码侧 0-11），另含 Text Encoder。', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_down_lr_weight', type: 'string', label: 'Encoder 分层权重 (9段)', title: 'lulynx_down_lr_weight', desc: 'SDXL Encoder 分层学习率权重，共 9 段', defaultValue: '1,1,1,1,1,1,1,1,1', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_mid_lr_weight', type: 'string', label: 'Mid 分层权重 (3段)', title: 'lulynx_mid_lr_weight', desc: 'SDXL Mid 分层学习率权重，共 3 段', defaultValue: '1,1,1', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_up_lr_weight', type: 'string', label: 'Decoder 分层权重 (9段)', title: 'lulynx_up_lr_weight', desc: 'SDXL Decoder 分层学习率权重，共 9 段', defaultValue: '1,1,1,1,1,1,1,1,1', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_block_lr_zero_threshold', type: 'number', label: '权重置零阈值', title: 'lulynx_block_lr_zero_threshold', desc: '低于该阈值的 block 权重按 0 处理', defaultValue: 0, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_smart_rank_enabled', type: 'boolean', label: '启用 SmartRank (keep_ratio 裁剪)', title: 'lulynx_smart_rank_enabled', desc: '周期性压缩低能量 rank 通道。', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_smart_rank_keep_ratio', type: 'number', label: '保留 Rank 比例', title: 'lulynx_smart_rank_keep_ratio', desc: '保留多少比例的 rank 通道。例如 0.75 表示裁掉最弱的 25%', defaultValue: 0.75, min: 0.05, max: 1, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_smart_rank_enabled', true)) }
];

export const S_SPEED_SD15 = [
  TRAINING_VRAM_PROFILE_FIELD,
  ...TRAINING_VRAM_PROFILE_HIDDEN_FIELDS,
  { key: 'acceleration_profile', type: 'select', label: '模型加速档位', title: 'acceleration_profile', desc: '按当前模型族做加速预检与档位建议', defaultValue: 'off', options: ACCELERATION_PROFILE_OPTIONS },
  // (separator for TypeScript parser)
  { key: 'mixed_precision', type: 'select', label: '混合精度', title: 'mixed_precision', desc: '训练混合精度, RTX30系列以后也可以指定 bf16', defaultValue: 'bf16', options: ['no', 'fp16', 'bf16'] },
  { key: 'xformers', type: 'boolean', label: '启用 xformers', title: 'xformers', desc: '高级覆盖：强制 xformers。默认跟随启动环境。', defaultValue: false, requiresAttentionBackend: 'xformers', visibleWhen: when('performance_expert_mode', true) },
  { key: 'sdpa', type: 'boolean', label: '启用 SDPA', title: 'sdpa', desc: '高级覆盖：强制 SDPA', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'mem_eff_attn', type: 'boolean', label: '低显存注意力', title: 'mem_eff_attn', desc: '高级覆盖：省显存 attention。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
  { key: 'cache_latents', type: 'boolean', label: '缓存 Latent', title: 'cache_latents', desc: '预先把训练图 VAE 编码成 latent 缓存，训练时不再重复跑 VAE。', defaultValue: true },
  { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘', title: 'cache_latents_to_disk', desc: '缓存图像 latent 到磁盘', defaultValue: false },
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式', title: 'latent_cache_disk_format', desc: 'latent 磁盘缓存格式', defaultValue: 'npz', options: ['safetensors', 'npz'] },
  { key: 'latent_cache_disk_dtype', type: 'select', label: 'Latent 缓存精度', title: 'latent_cache_disk_dtype', desc: 'latent 磁盘缓存保存精度', defaultValue: 'fp16', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: when('cache_latents_to_disk', true) },
  { key: 'full_fp16', type: 'boolean', label: '完全 FP16', title: 'full_fp16', desc: '完全使用 FP16 精度', defaultValue: false },
  { key: 'full_bf16', type: 'boolean', label: '完全 BF16', title: 'full_bf16', desc: '完全使用 BF16 精度', defaultValue: false },
  { key: 'no_half_vae', type: 'boolean', label: '不使用半精度 VAE', title: 'no_half_vae', desc: 'VAE 强制 fp32 运行，规避旧 VAE 的 fp16 数值问题。', defaultValue: false },
  { key: 'persistent_data_loader_workers', type: 'boolean', label: '保持数据加载器', title: 'persistent_data_loader_workers', desc: '保留加载训练集的 worker，减少每个 epoch 之间的停顿', defaultValue: true },
  { key: 'vae_batch_size', type: 'number', label: 'VAE 最大编码批量', title: 'vae_batch_size', desc: '限制 Anima / Newbie 缓存编码的 VAE 批次，0 沿用模型族设置；其他逐张编码路径保持批量 1。', defaultValue: 0, min: 0 },
  { key: 'vram_swap_to_ram', type: 'boolean', label: 'VRAM Swap to RAM', title: 'vram_swap_to_ram', desc: '让原生 LoRA / Frozen-A LoRA / 渐进秩 LoRA / VeRA', defaultValue: false },
  { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点', title: 'cpu_offload_checkpointing', desc: '梯度检查点时将部分张量卸载到 CPU，节省显存', defaultValue: false },
  { key: 'swap_granularity', type: 'select', label: '显存交换模式', title: 'swap_granularity', desc: '显存交换的粒度模式（整组/逐块/合并搬运/异步流水线）。', defaultValue: 'off', options: ['off', 'auto', 'block', 'merged_block', 'layer'] },
  { key: 'swap_ratio', type: 'slider', label: '显存交换比例', title: 'swap_ratio', desc: '按原始 block/layer 总数计算交换比例。', defaultValue: 0, min: 0, max: 1, step: 0.05, visibleWhen: swapEnabled },
  { key: 'swap_count', type: 'number', label: '显存交换数量', title: 'swap_count', desc: '高级：绝对交换数量。大于 0 时优先于比例。', defaultValue: 0, min: 0, visibleWhen: swapEnabled },
  { key: 'block_merge_size', type: 'number', label: '合并 Block 大小', title: 'block_merge_size', desc: 'merged_block 模式下每组包含的 block 数，不跨', defaultValue: 2, min: 2, visibleWhen: when('swap_granularity', 'merged_block') },
  { key: 'block_swap_strategy', type: 'select', label: 'BlockSwap 搬运策略', title: 'block_swap_strategy', desc: 'auto 使用后端解析', defaultValue: 'auto', options: BLOCK_SWAP_STRATEGY_OPTIONS, visibleWhen: all(swapEnabled, when('performance_expert_mode', true)) },
    ...S_GRADIENT_RELEASE,
  ...S_OPTIMIZER_STATE_PAGING,
  ...S_MEMORY_RECLAIM,
  // (separator for TypeScript parser)
  { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化', title: 'pytorch_cuda_expandable_segments', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandabl', defaultValue: true }
];
// SafeGuard + Wavelet 从 S_ADV 抽出，供 Anima 组合与共享组复用，避免双份漂移。
export const S_SAFEGUARD = [
  { key: 'safeguard_enabled', type: 'boolean', label: '启用 SafeGuard', title: 'safeguard_enabled', desc: '拦截 NaN/Inf loss 与异常 loss spike', defaultValue: false },
  { key: 'safeguard_safe_state_interval', type: 'number', label: '安全快照间隔', title: 'safeguard_safe_state_interval', desc: '每 N 个优化 step 保存一次可回滚快照。', defaultValue: 100, min: 1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_nan_check_interval', type: 'number', label: 'NaN 检查间隔', title: 'safeguard_nan_check_interval', desc: '每 N 个优化 step 检查一次 NaN / Inf loss', defaultValue: 10, min: 1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_max_nan_count', type: 'number', label: '最大 NaN 次数', title: 'safeguard_max_nan_count', desc: '连续触发多少次 NaN 后停止训练', defaultValue: 3, min: 1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_loss_spike_threshold', type: 'number', label: 'Loss Spike 阈值', title: 'safeguard_loss_spike_threshold', desc: '当前 loss 超过滚动平均值多少倍时，判定为 spike 并跳过该 step', defaultValue: 10.0, min: 1, step: 0.1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_loss_window_size', type: 'number', label: 'Loss 窗口大小', title: 'safeguard_loss_window_size', desc: '用于判定 loss spike 的滚动窗口大小', defaultValue: 50, min: 2, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_auto_reduce_lr', type: 'boolean', label: '自动降低学习率', title: 'safeguard_auto_reduce_lr', desc: 'SafeGuard 触发时自动降低学习率', defaultValue: false, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_lr_reduction_factor', type: 'number', label: '降学习率倍率', title: 'safeguard_lr_reduction_factor', desc: '自动降低学习率时使用的倍率', defaultValue: 0.5, min: 0.01, max: 1, step: 0.01, visibleWhen: all(when('safeguard_enabled', true), when('safeguard_auto_reduce_lr', true)) }
];

export const S_WAVELET_LOSS = [
  { key: 'wavelet_loss_enabled', type: 'boolean', label: '启用 Wavelet Loss', title: 'wavelet_loss_enabled', desc: '在像素空间损失之外叠加多尺度 wavelet', defaultValue: false },
  { key: 'wavelet_loss_weight', type: 'number', label: 'Wavelet Loss 权重', title: 'wavelet_loss_weight', desc: '建议从很小的值开始，例如 0.02 ~ 0.1', defaultValue: 0.05, min: 0, step: 0.01, visibleWhen: when('wavelet_loss_enabled', true) },
  { key: 'wavelet_loss_levels', type: 'number', label: 'Wavelet 层数', title: 'wavelet_loss_levels', desc: '多尺度分解层数。层数越高越偏向大结构约束', defaultValue: 1, min: 1, max: 4, step: 1, visibleWhen: when('wavelet_loss_enabled', true) },
  { key: 'wavelet_loss_approx_weight', type: 'number', label: 'Wavelet 低频权重', title: 'wavelet_loss_approx_weight', desc: '是否额外约束最后一层低频 LL 分量。通常保持 0 即可', defaultValue: 0, min: 0, step: 0.01, visibleWhen: when('wavelet_loss_enabled', true) },
  { key: 'wavelet_loss_high_freq_weight', type: 'number', label: 'Wavelet 高频权重', title: 'wavelet_loss_high_freq_weight', desc: '高频子带权重', defaultValue: 2.0, min: 0, step: 0.1, visibleWhen: when('wavelet_loss_enabled', true) },
  { key: 'wavelet_loss_base_loss', type: 'select', label: 'Wavelet 基础损失', title: 'wavelet_loss_base_loss', desc: '小波域内的基础损失类型', defaultValue: 'l2', options: [
    { value: 'l2', label: 'l2' },
    { value: 'l1', label: 'l1' }
  ], visibleWhen: when('wavelet_loss_enabled', true) },
  { key: 'wavelet_loss_detail_boost', type: 'number', label: 'Wavelet 细节增强', title: 'wavelet_loss_detail_boost', desc: '细节阶段额外高频加权；0=关闭', defaultValue: 0.0, min: 0, step: 0.05, visibleWhen: when('wavelet_loss_enabled', true) },
  { key: 'wavelet_loss_sigma_gate', type: 'number', label: 'Wavelet σ 门控', title: 'wavelet_loss_sigma_gate', desc: 'σ 低于该值时高频加权全开', defaultValue: 0.5, min: 0, max: 1, step: 0.05, visibleWhen: when('wavelet_loss_enabled', true) }
];

// 训练种子只在这里定义一份：高级页与自带种子输入的族(anima / MiniMax H3)共用同一个
// 对象，避免同一个默认值在多处各写一遍再各自漂移。
export const SEED_FIELD = { key: 'seed', type: 'number', label: '随机种子', title: 'seed', desc: '留空使用默认种子，-1 表示每次随机', defaultValue: 8888 };

// 注意力后端下拉:S_ADV 与 anima 自己的系统分组共用同一份声明。分头写两份会漂,
// 而这个字段的取值集合必须与 attentionCapabilities 的别名表严格对齐。
export const ATTENTION_BACKEND_FIELD = { key: 'attention_backend', type: 'select', label: 'Attention 后端（高级）', title: 'attention_backend', desc: 'auto=按当前模型家族与执行环境解析；当前运行时装不出来的后端会置灰，仅显式支持的后端不会被 auto 自动选中', defaultValue: 'auto', attentionBackendOptions: true, options: [
  { value: 'auto', label: '自动（跟随启动环境）' },
  { value: 'sdpa', label: 'SDPA' },
  { value: 'xformers', label: 'xFormers' },
  { value: 'sageattn', label: 'SageAttention' },
  { value: 'flash2', label: 'FlashAttention 2' },
  { value: 'flexattn', label: 'FlexAttention' },
  { value: 'torch', label: 'Torch' }
] };

// 系统设置段(执行环境 Profile / 指定显卡 / 自定义 TOML 覆盖)。这三个控件在 S_ADV 里不相邻
// ——exec 在 attention 之前、TOML 在十几行之后——所以没法从 S_ADV 里 spread 出来,只能逐字复制
// 成独立常量;S_ADV 本体一个字不动,免得动到已经露着它们的那 30 个训练类型的字段顺序。
// 给的是「本来就缺这一段」的训练类型用:exec 决定跑在哪个 runtime,gpu_ids 决定用哪几张卡,
// 少了它们的类型只能继承 launcher 启动时的选择,改不了前提。
// TOML 键名逐分叉不同,本分叉是 custom_toml —— 抄别的分叉会注入一个本分叉不认的键。
export const S_SYSTEM_ENV = [
  { key: 'execution_profile_id', type: 'string', label: '执行环境 Profile（高级）', title: 'execution_profile_id', desc: '留空则跟随启动器当前/上次 runtime。', defaultValue: '' },
  { key: 'gpu_ids', type: 'csvMultiSelect', deviceListOptions: true, label: '指定显卡', title: 'gpu_ids', desc: '勾选参与训练的显卡；值仍是逗号分隔的数字编号（如 0,1）。留空时继承 launcher 启动时选择的显卡。读不到显卡表时退回成手填。', defaultValue: '' },
  { key: 'custom_toml', type: 'textarea', label: '自定义 TOML 覆盖', title: 'custom_toml', desc: '危险：会直接覆盖界面中的参数', defaultValue: '' },
];

export const S_ADV = [
  { key: 'goal_forecast_tool', type: 'action', label: '训练达标预测（Copilot 只读预测器）', desc: '读取已训练 run 的 loss / 验证 loss / L2 时序', buttonLabel: '📈 打开达标预测', handler: 'openGoalForecastTool' },
  { key: 'copilot_tool', type: 'action', label: '自动训练 Copilot（全自动闭环编排）', desc: '一次授权无人值守：设定目标阈值（loss / 验证 loss / L2）+', buttonLabel: '🤖 自动训练 Copilot', handler: 'openCopilotTool' },
  // Runtime 权威：默认空 / auto 跟随 launcher；显式非空才算覆盖。
  { key: 'execution_profile_id', type: 'string', label: '执行环境 Profile（高级）', title: 'execution_profile_id', desc: '留空则跟随启动器当前/上次 runtime。', defaultValue: '' },
  ATTENTION_BACKEND_FIELD,
  { key: 'gpu_ids', type: 'csvMultiSelect', deviceListOptions: true, label: '指定显卡', title: 'gpu_ids', desc: '勾选参与训练的显卡；值仍是逗号分隔的数字编号（如 0,1）。留空时继承 launcher 启动时选择的显卡。读不到显卡表时退回成手填。', defaultValue: '' },
  SEED_FIELD,
  { key: 'clip_skip', type: 'slider', label: 'CLIP 跳层', title: 'clip_skip', desc: 'CLIP 跳过层数', defaultValue: 1, min: 0, max: 12, step: 1 },
  { key: 'masked_loss', type: 'boolean', label: '启用蒙版损失', title: 'masked_loss', desc: '仅对蒙版内像素计算 loss（配合 alpha/mask 图）。', defaultValue: false },
  { key: 'alpha_mask', type: 'boolean', label: '读取 Alpha 通道作为 Mask', title: 'alpha_mask', desc: '读取训练图像的 alpha 通道作为 loss mask', defaultValue: false },
  { key: 'training_comment', type: 'textarea', label: '训练备注', title: 'training_comment', desc: '写入模型元数据的训练备注', defaultValue: '' },
  { key: 'custom_toml', type: 'textarea', label: '自定义 TOML 覆盖', title: 'custom_toml', desc: '危险：会直接覆盖界面中的参数', defaultValue: '' },
  { key: 'no_metadata', type: 'boolean', label: '不写入元数据', title: 'no_metadata', desc: '不向输出模型写入完整训练元数据', defaultValue: false },
  { key: 'initial_epoch', type: 'number', label: '起始 epoch', title: 'initial_epoch', desc: '从指定 epoch 编号开始计数', defaultValue: '', min: 1 },
  { key: 'initial_step', type: 'number', label: '起始 step', title: 'initial_step', desc: '从指定 step 编号开始计数，会覆盖 initial_epoch', defaultValue: '', min: 0 },
  { key: 'skip_until_initial_step', type: 'boolean', label: '跳过前面步数', title: 'skip_until_initial_step', desc: '配合 initial_step 使用，真正跳过前面的训练步数', defaultValue: false },
  { key: 'ema_enabled', type: 'boolean', label: '启用 EMA', title: 'ema_enabled', desc: '启用 EMA（指数滑动平均）。会额外复制一份参数，保存时写出 EMA 权重', defaultValue: false },
  { key: 'ema_decay', type: 'number', label: 'EMA 衰减率', title: 'ema_decay', desc: 'EMA 衰减率。越接近 1 越平滑', defaultValue: 0.999, min: 0, max: 0.99999, step: 0.0001, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_update_every', type: 'number', label: 'EMA 更新间隔', title: 'ema_update_every', desc: '每 N 个优化 step 更新一次 EMA', defaultValue: 1, min: 1, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_update_after_step', type: 'number', label: 'EMA 起始步', title: 'ema_update_after_step', desc: '从第几个优化 step 开始更新 EMA', defaultValue: 100, min: 0, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_power', type: 'number', label: 'EMA Warmup 幂次', title: 'ema_power', desc: 'EMA warmup 曲线幂次（inv_gamma 配合使用）。', defaultValue: 0.666, min: 0, step: 0.01, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_inv_gamma', type: 'number', label: 'EMA inv_gamma', title: 'ema_inv_gamma', desc: 'EMA warmup 时间常数相关参数。', defaultValue: 1.0, min: 0, step: 0.1, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_reset_on_resume', type: 'boolean', label: 'Resume 时重置 EMA', title: 'ema_reset_on_resume', desc: '从 checkpoint 恢复训练时丢弃已有 EMA 状态并重新累计。', defaultValue: false, visibleWhen: when('ema_enabled', true) },
  { key: 'clip_l_dropout_rate', type: 'number', label: 'CLIP-L Dropout', title: 'clip_l_dropout_rate', desc: '训练时以该概率丢弃 CLIP-L 条件（0=关闭）。', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'clip_g_dropout_rate', type: 'number', label: 'CLIP-G Dropout', title: 'clip_g_dropout_rate', desc: '训练时以该概率丢弃 CLIP-G / pooled 条件。', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 't5_dropout_rate', type: 'number', label: 'T5 Dropout', title: 't5_dropout_rate', desc: '训练时以该概率丢弃 T5 文本条件（FLUX/Anima 等）。', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  ...S_SAFEGUARD,
  ...S_WAVELET_LOSS
];

/** DiT 高级：去掉 CLIP 跳层（SD/SDXL 仍用完整 S_ADV） */
export const S_ADV_DIT = excludeKeys(S_ADV, ['clip_skip']);

export const S_WEIGHT_NOISE = [
  { key: 'lulynx_weight_noise_enabled', type: 'boolean', label: 'LoRA 权重噪声', title: 'lulynx_weight_noise_enabled', desc: '每个 optimizer.step 后对可训练 LoRA/适配器参数加零均值高斯扰动，不碰底模。', defaultValue: false },
  { key: 'lulynx_weight_noise_mode', type: 'select', label: '权重噪声模式', title: 'lulynx_weight_noise_mode', desc: 'relative（默认）：σ 按参数 RMS 缩放，零初始化 up 层早期几乎不加噪；absolute：全局固定 σ。', defaultValue: 'relative', options: [
    { value: 'relative', label: 'relative（按权重 RMS）' },
    { value: 'absolute', label: 'absolute（固定 σ）' }
  ], visibleWhen: when('lulynx_weight_noise_enabled', true) },
  { key: 'lulynx_weight_noise_sigma', type: 'number', label: '权重噪声 σ', title: 'lulynx_weight_noise_sigma', desc: '噪声强度。relative 时为相对 RMS 倍率', defaultValue: 0.0125, min: 0, step: 0.0005, visibleWhen: when('lulynx_weight_noise_enabled', true) },
  { key: 'lulynx_weight_noise_bound_norm', type: 'boolean', label: '权重噪声保范数', title: 'lulynx_weight_noise_bound_norm', desc: '加噪后把张量范数缩回加噪前，抑制 long-run 范数漂移', defaultValue: false, visibleWhen: when('lulynx_weight_noise_enabled', true) },
  { key: 'lulynx_weight_noise_log_every', type: 'number', label: '权重噪声日志间隔', title: 'lulynx_weight_noise_log_every', desc: '每 N 个优化步写一次指标；0=关闭日志。', defaultValue: 50, min: 0, step: 1, visibleWhen: when('lulynx_weight_noise_enabled', true) }
];

export const S_NOISE = [
  { key: 'noise_offset', type: 'number', label: '噪声偏移', title: 'noise_offset', desc: '在训练中添加噪声偏移来改良生成非常暗或者非常亮的图像，如果启用推荐为 0.1', defaultValue: '', step: 0.01 },
  { key: 'noise_offset_random_strength', type: 'boolean', label: '噪声偏移随机强度', title: 'noise_offset_random_strength', desc: '噪声偏移强度在 0 到 noise_offset 间随机变化', defaultValue: false },
  { key: 'multires_noise_iterations', type: 'number', label: '多分辨率噪声迭代', title: 'multires_noise_iterations', desc: '多分辨率（金字塔）噪声迭代次数 推荐 6-10', defaultValue: '',step: 1 },
  { key: 'multires_noise_discount', type: 'number', label: '多分辨率噪声衰减', title: 'multires_noise_discount', desc: '多分辨率（金字塔）衰减率 推荐 0.3-0.8', defaultValue: '', step: 0.01 },
  { key: 'ip_noise_gamma', type: 'number', label: '输入扰动噪声', title: 'ip_noise_gamma', desc: '输入扰动噪声强度，常用于正则化', defaultValue: '', step: 0.01 },
  { key: 'ip_noise_gamma_random_strength', type: 'boolean', label: '扰动噪声随机强度', title: 'ip_noise_gamma_random_strength', desc: '输入扰动噪声强度在 0 到 ip_noise_gamma 间随机变化', defaultValue: false },
  { key: 'adaptive_noise_scale', type: 'number', label: '自适应噪声缩放', title: 'adaptive_noise_scale', desc: '按 latent 平均绝对值动态追加 noise_offset', defaultValue: '', step: 0.01 },
  { key: 'perlin_noise_offset_enabled', type: 'boolean', label: 'Perlin 噪声偏移', title: 'perlin_noise_offset_enabled', desc: '用 Perlin 场替代均匀 noise_offset，偏移量按空间位置变化而不是全图同一个常数。', defaultValue: false },
  { key: 'perlin_noise_offset_strength', type: 'number', label: 'Perlin 偏移强度', title: 'perlin_noise_offset_strength', desc: 'Perlin 场叠加强度', defaultValue: 0.1, min: 0, step: 0.01, visibleWhen: when('perlin_noise_offset_enabled', true) },
  { key: 'perlin_noise_offset_scale', type: 'number', label: 'Perlin 频率尺度', title: 'perlin_noise_offset_scale', desc: '场频率；越大纹理越细', defaultValue: 4.0, min: 0.1, step: 0.1, visibleWhen: when('perlin_noise_offset_enabled', true) },
  { key: 'immiscible_diffusion_enabled', type: 'boolean', label: 'Immiscible Diffusion', title: 'immiscible_diffusion_enabled', desc: 'minibatch 内按度量重排噪声-数据配对。', defaultValue: false },
  { key: 'immiscible_metric', type: 'select', label: 'Immiscible 度量', title: 'immiscible_metric', desc: 'l2=经典 Immiscible；cosine=更接近 flow OT。', defaultValue: 'l2', options: [
    { value: 'l2', label: 'l2' },
    { value: 'cosine', label: 'cosine' }
  ], visibleWhen: when('immiscible_diffusion_enabled', true) },
  { key: 'immiscible_assignment_mode', type: 'select', label: 'Immiscible 配对方案', title: 'immiscible_assignment_mode', desc: 'standard=全局最优 Hungarian；lulynx_greedy=兼容现有逐行贪心。', defaultValue: 'lulynx_greedy', options: [
    { value: 'standard', label: '标准（全局最优）' },
    { value: 'lulynx_greedy', label: 'lulynx 优化（贪心）' }
  ], visibleWhen: (c) => c.immiscible_diffusion_enabled && String(c.immiscible_metric || 'l2') === 'l2' },
  { key: 'min_timestep', type: 'number', label: '最小时间步', title: 'min_timestep', desc: '训练时允许的最小 timestep', defaultValue: '', min: 0 },
  { key: 'max_timestep', type: 'number', label: '最大时间步', title: 'max_timestep', desc: '训练时允许的最大 timestep', defaultValue: '', min: 1 },
  { key: 'stepped_loss_enabled', type: 'boolean', label: '分步损失调度', title: 'stepped_loss_enabled', desc: '按 step 切换 loss 类型/权重。', defaultValue: false },
  { key: 'stepped_loss_schedule', type: 'textarea', label: '分步损失 JSON', title: 'stepped_loss_schedule', desc: 'JSON 数组，例如', defaultValue: '', visibleWhen: when('stepped_loss_enabled', true) },
  ...S_WEIGHT_NOISE
];
export const S_DATA_AUG = [
  { key: 'color_aug', type: 'boolean', label: '颜色增强', title: 'color_aug', desc: '启用颜色改变数据增强', defaultValue: false },
  { key: 'flip_aug', type: 'boolean', label: '翻转增强', title: 'flip_aug', desc: '启用图像翻转数据增强', defaultValue: false },
  { key: 'random_crop', type: 'boolean', label: '随机裁剪', title: 'random_crop', desc: '启用随机剪裁数据增强', defaultValue: false },
  { key: 'albumentations_enabled', type: 'boolean', label: 'Albumentations 管道', title: 'albumentations_enabled', desc: '启用自定义 albumentations 增强 JSON', defaultValue: false },
  { key: 'albumentations_pipeline', type: 'textarea', label: 'Albumentations JSON', title: 'albumentations_pipeline', desc: 'JSON 数组，例如', defaultValue: '', visibleWhen: when('albumentations_enabled', true) },
  { key: 'albumentations_mask_replay', type: 'boolean', label: 'Mask 同步变换', title: 'albumentations_mask_replay', desc: '对 loss mask 应用相同空间变换。默认开启。', defaultValue: true, visibleWhen: when('albumentations_enabled', true) },
  { key: 'resolution_aware_batch_enabled', type: 'boolean', label: '分辨率感知批量', title: 'resolution_aware_batch_enabled', desc: '按输入分辨率缩放有效 batch，稳住显存。', defaultValue: false },
  { key: 'resolution_aware_batch_base_resolution', type: 'number', label: '基准分辨率', title: 'resolution_aware_batch_base_resolution', desc: '该分辨率下使用 train_batch_size 原值。', defaultValue: 1024, min: 64, step: 64, visibleWhen: when('resolution_aware_batch_enabled', true) },
  { key: 'resolution_aware_batch_max_factor', type: 'number', label: '最大批量倍率', title: 'resolution_aware_batch_max_factor', desc: '小图时 batch 最大放大倍数。', defaultValue: 4.0, min: 1, step: 0.5, visibleWhen: when('resolution_aware_batch_enabled', true) },
  { key: 'resolution_aware_batch_min_factor', type: 'number', label: '最小批量倍率', title: 'resolution_aware_batch_min_factor', desc: '大图时 batch 最小缩小倍数。', defaultValue: 0.25, min: 0.05, max: 1, step: 0.05, visibleWhen: when('resolution_aware_batch_enabled', true) }
];
export const S_VALIDATION = [
  { key: 'eval_data_dir', type: 'folder', pickerType: 'folder', label: '自定义验证集路径', title: 'eval_data_dir', desc: '独立验证集目录。填了这里就不会从训练集切图', defaultValue: '' },
  { key: 'eval_batch_size', type: 'number', label: '验证批量大小', title: 'eval_batch_size', desc: '验证集 batch。0 或留空时使用训练 batch', defaultValue: '', min: 0 },
  { key: 'validation_split', type: 'number', label: '验证集比例', title: 'validation_split', desc: '兼容旧用法：从训练集自动切出一部分做验证。', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'validation_seed', type: 'number', label: '验证集种子', title: 'validation_seed', desc: '验证集切分随机种子', defaultValue: '' },
  { key: 'validate_every_n_steps', type: 'number', label: '每 N 步验证', title: 'validate_every_n_steps', desc: '每 N 步执行一次验证', defaultValue: '', min: 1 },
  { key: 'validate_every_n_epochs', type: 'number', label: '每 N 轮验证', title: 'validate_every_n_epochs', desc: '每 N 个 epoch 执行一次验证', defaultValue: '', min: 1 },
  { key: 'validation_every_n_epochs', type: 'number', label: '每 N 轮验证（后端键）', title: 'validation_every_n_epochs', desc: '与 validation_split>0 配合；每 N 个 epoch 跑一次验证 loss。默认 1。', defaultValue: 1, min: 1 },
  { key: 'validation_loss_only', type: 'boolean', label: '验证仅计算 Loss', title: 'validation_loss_only', desc: '验证阶段只算 loss、不生成采样图。默认开启。', defaultValue: true },
  { key: 'max_validation_steps', type: 'number', label: '最大验证步数', title: 'max_validation_steps', desc: '每次验证最多处理多少个验证批次', defaultValue: '', min: 1 }
];

export const S_THERMAL = [
  { key: 'cooldown_every_n_epochs', type: 'number', label: '每 N 轮冷却', title: 'cooldown_every_n_epochs', desc: '每 N 轮进入冷却段：学习率降档巩固收尾。', defaultValue: '', min: 1 },
  { key: 'cooldown_minutes', type: 'number', label: '冷却分钟数', title: 'cooldown_minutes', desc: '每次冷却至少暂停多少分钟', defaultValue: '', min: 0, step: 0.5 },
  { key: 'cooldown_until_temp_c', type: 'number', label: '冷却目标温度(℃)', title: 'cooldown_until_temp_c', desc: '等待显卡温度降到多少℃以下再继续', defaultValue: '', min: 1 },
  { key: 'cooldown_poll_seconds', type: 'number', label: '温度轮询间隔(秒)', title: 'cooldown_poll_seconds', desc: '温度轮询间隔', defaultValue: 15, min: 1 },
  { key: 'gpu_power_limit_w', type: 'number', label: 'GPU 功率墙(W)', title: 'gpu_power_limit_w', desc: '训练前设置显卡功率墙（瓦）', defaultValue: '', min: 1 },
  { key: 'gpu_duty_cycle', type: 'number', label: 'GPU 占空比', title: 'gpu_duty_cycle', desc: '每个优化 step 后按比例插入空闲降温，取值 0.2~1.0；留空或 1.0 = 不插入，越小空闲占比越大（温度更低、步时更长）。', defaultValue: '', min: 0.2, max: 1, step: 0.05 },
  { key: 'gpu_target_temp_c', type: 'number', label: 'GPU 目标温度(℃)', title: 'gpu_target_temp_c', desc: '温度闭环：超过目标温度自动降低有效占空比', defaultValue: '', min: 1 },
  { key: 'gpu_lock_clocks_mhz', type: 'number', label: 'GPU 锁频上限(MHz)', title: 'gpu_lock_clocks_mhz', desc: '训练前用 nvidia-smi 锁定核心频率上限（需管理员权限）。', defaultValue: '', min: 1 },
  ...S_GPU_CIRCUIT
];

export const S_PEAK_VRAM = [
  { key: 'peak_vram_control_enabled', type: 'boolean', label: '启用显存峰值控制', title: 'peak_vram_control_enabled', desc: '显存峰值控制兜底开关', defaultValue: false },
  { key: 'peak_vram_target_effective_batch', type: 'number', label: '目标等效 Batch', title: 'peak_vram_target_effective_batch', desc: '目标等效 batch', defaultValue: 0, min: 0, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_startup_guard_enabled', type: 'boolean', label: '启动峰值保护', title: 'peak_vram_startup_guard_enabled', desc: '启动时试分配探测可用显存峰值，防止首批 OOM。', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_startup_guard_mode', type: 'select', label: '保护强度', title: 'peak_vram_startup_guard_mode', desc: 'auto 自动估计', defaultValue: 'auto', options: ['auto', 'balanced', 'aggressive'], visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_startup_guard_enabled', true)) },
  { key: 'peak_vram_startup_guard_steps', type: 'number', label: '保护持续步数', title: 'peak_vram_startup_guard_steps', desc: '启动峰值保护持续多少个优化 step。', defaultValue: 24, min: 0, visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_startup_guard_enabled', true)) },
  { key: 'peak_vram_micro_batch_enabled', type: 'boolean', label: 'Micro-Batch 拆分', title: 'peak_vram_micro_batch_enabled', desc: '启用 micro-batch 拆分执行。', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_micro_batch_size', type: 'number', label: 'Micro-Batch 大小', title: 'peak_vram_micro_batch_size', desc: '每个 micro-batch 的前后向 batch 大小。', defaultValue: 1, min: 1, visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_micro_batch_enabled', true)) },
  { key: 'peak_vram_diagnostics_enabled', type: 'boolean', label: '显存诊断', title: 'peak_vram_diagnostics_enabled', desc: '启用轻量显存诊断。仅用于排查问题或测速定位，默认不建议常开', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_diagnostics_interval', type: 'number', label: '诊断间隔 (步)', title: 'peak_vram_diagnostics_interval', desc: '每 N 个优化 step 输出一次显存诊断', defaultValue: 25, min: 1, visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_diagnostics_enabled', true)) },
  { key: 'peak_vram_auto_protection_enabled', type: 'boolean', label: '动态显存自动保护', title: 'peak_vram_auto_protection_enabled', desc: '启用动态显存自动保护', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) }
];

// ================================================================
// 跨族 Section / 字段模板(被 2 个以上训练族复用)
// ================================================================
// ---- 概念编辑 iLECO / ADDifT / Multi-ADDifT(SD1.5 + SDXL 共用)----
export const conceptEditModelFields = (typeId, label, isSdxl = false) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, title: 'pretrained_model_name_or_path', desc: '底模文件路径', defaultValue: '' },
  { key: 'resume', type: 'file', pickerType: 'output-model-file', allowModelDirectory: true, label: '继续训练路径', title: 'resume', desc: '从某个 save_state / 检查点继续训练：可选择检查点文件，或选择存档目录自动取最新', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径', title: 'vae', desc: '底模配套 VAE 权重路径，留空使用底模内置 VAE。', defaultValue: '' },
  { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA', title: 'network_weights', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
  ...(isSdxl ? [] : [{ key: 'v2', type: 'boolean', label: 'SD 2.x 模型', title: 'v2', desc: '使用 SD 2.x 模型', defaultValue: false }]),
  { key: 'clip_skip', type: 'slider', label: 'CLIP 跳层', title: 'clip_skip', desc: '概念编辑模式也会沿用当前训练路线的 CLIP', defaultValue: 1, min: 0, max: 12, step: 1 }
];

export const conceptEditIdeaFields = (mode) => {
  const fields = [
    { key: 'concept_edit_method', type: 'hidden', defaultValue: (mode === 'multi-addift' ? 'addift' : mode) },
        { key: 'target_prompt', type: 'textarea', label: '目标概念提示词', title: 'target_prompt', desc: '目标概念提示词。iLECO 留空时表示偏向“擦除原概念”。', defaultValue: '' }
];

  if (mode === 'addift') {
    fields.push(
      { key: 'original_image_path', type: 'file', pickerType: 'image-file', label: '原始图像', title: 'original_image_path', desc: 'ADDifT 的原始图像。建议与目标图像内容尽量一一对应。', defaultValue: '' },
      { key: 'target_image_path', type: 'file', pickerType: 'image-file', label: '目标图像', title: 'target_image_path', desc: 'ADDifT 的目标图像。建议与原始图像分辨率一致。', defaultValue: '' },
    );
  }

  if (mode === 'multi-addift') {
    fields.push(
      { key: 'concept_edit_data_dir', type: 'folder', pickerType: 'folder', label: '概念编辑数据集目录', title: 'concept_edit_data_dir', desc: '放置成对图像的数据集目录', defaultValue: './train/concept-edit' },
          );
  }

  return fields;
};

export const conceptEditTrainingFields = (defaults = {}) => [
  { key: 'resolution', type: 'string', label: '训练分辨率', title: 'resolution', desc: '概念编辑首版先按固定分辨率处理，建议和训练目标接近。', defaultValue: defaults.resolution || '1024,1024' },
  { key: 'max_train_steps', type: 'number', label: '最大训练步数', title: 'max_train_steps', desc: '概念编辑模式优先按 step 控制训练长度。', defaultValue: defaults.maxTrainSteps || 500, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小', title: 'train_batch_size', desc: '概念编辑建议从小 batch 开始。', defaultValue: defaults.batchSize || 1, min: 1, max: 8, step: 1 },
  { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点', title: 'gradient_checkpointing', desc: '启用梯度检查点以节省显存', defaultValue: true },
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数', title: 'gradient_accumulation_steps', desc: '每 N 次 microbatch 才执行一次', defaultValue: 1, min: 1 },
  { key: 'gradient_accumulation_mode', type: 'select', label: '梯度累加模式', title: 'gradient_accumulation_mode', desc: 'fast（默认）：仅在真正 optimizer.step 的那一步做梯度同步与检查；classic：保留逐 microbatch 检查的旧行为。', defaultValue: 'fast', options: [
    { value: 'fast', label: 'fast' },
    // classic 是后端 training_loop_epoch_mixin.py:317 的真实 else 分支，
    // 逐 microbatch 做同步/检查。原先只给 fast，这个分支选不到。
    { value: 'classic', label: 'classic（逐 microbatch 检查）' }
  ], visibleWhen: (c) => Number(c.gradient_accumulation_steps || 1) > 1 },
  { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 U-Net / DiT', title: 'network_train_unet_only', desc: '概念编辑首版默认只训练 U-Net / DiT', defaultValue: true },
  { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器', title: 'network_train_text_encoder_only', desc: '不建议概念编辑首版单独训练文本编码器。', defaultValue: false },
  { key: 'min_timestep', type: 'number', label: '最小时间步', title: 'min_timestep', desc: '动作/配件类差分常见 500；风格类常见 200。', defaultValue: defaults.minTimestep ?? '' , min: 0 },
  { key: 'max_timestep', type: 'number', label: '最大时间步', title: 'max_timestep', desc: '动作/配件类差分常见 1000；风格类常见 400。', defaultValue: defaults.maxTimestep ?? '', min: 1 },
  { key: 'concept_edit_fixed_timestep_per_batch', type: 'boolean', label: '批内固定时间步', title: 'concept_edit_fixed_timestep_per_batch', desc: '同一 batch 内共享同一个 timestep。', defaultValue: false },
  { key: 'concept_edit_diff_alt_ratio', type: 'number', label: '差分交替倍率', title: 'concept_edit_diff_alt_ratio', desc: 'ADDifT 交替差分倍率', defaultValue: 1, step: 0.1, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_method || c.concept_edit_mode || '').toLowerCase()) },
  { key: 'concept_edit_use_diff_mask', type: 'boolean', label: '启用差分掩码', title: 'concept_edit_use_diff_mask', desc: 'Multi-ADDifT 可按原图/目标图像素差自动生成', defaultValue: false, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_method || c.concept_edit_mode || '').toLowerCase()) }
];

export const conceptEditSections = ({ typeId, label, isSdxl = false, mode, resolution, maxTrainSteps, minTimestep = '', maxTimestep = '' }) => [
  sec('model-settings', 'model', '训练用模型', `${label} 概念编辑底模与恢复训练。`, conceptEditModelFields(typeId, label, isSdxl)),
  sec('save-settings', 'model', '保存设置', '输出路径、格式与训练状态。', [...S_SAVE]),
  sec('concept-settings', 'dataset', '概念编辑输入', '这里定义原始概念、目标概念，以及 ADDifT / Multi-ADDifT 需要的图像或配对目录。', conceptEditIdeaFields(mode)),
  sec('network-settings', 'network', '网络设置', '概念编辑首版先复用现有 LoRA / LyCORIS 网络参数。', netLora('networks.lora', isSdxl ? 32 : 16, isSdxl ? 32 : 16, isSdxl ? 512 : 256, [], ['networks.flexrank_lora'])),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '概念编辑建议优先从 AdamW / Prodigy 一类稳定路线开始。', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '概念编辑首版优先按 step 控制训练时长，不走普通 LoRA 的数据集 epoch 语义。', conceptEditTrainingFields({ resolution, maxTrainSteps, minTimestep, maxTimestep })),
  sec('preview-settings', 'preview', '预览图设置', '可选。概念编辑首版也可以沿用普通训练预览。', [...S_PREVIEW, ...S_QUALITY_EVAL]),
  sec('speed-settings', 'speed', '速度优化', '混合精度、缓存与注意力后端。', [...(isSdxl ? S_SPEED_SDXL : S_SPEED_SD15)]),
  // min_timestep / max_timestep 与上面 training-settings 的 conceptEditTrainingFields 重叠；
  // S_NOISE 里那份默认值是空串，且渲染顺序在后，会把 ADDifT 传进来的 minTimestep=500 盖成空串
  // （createDefaultConfig 是无条件覆盖，最后渲染的赢）。概念编辑的时间步范围归 training-settings 管。
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与辅助损失设置。',
    S_NOISE.filter((f) => !['min_timestep', 'max_timestep'].includes(f.key))),
  sec('advanced-settings', 'advanced', '其他设置', '其它参数。', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '冷却/占空/功率墙，以及可选 GPU 硬件熔断（温度/VRAM/throttle/ECC）。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '首版概念编辑暂不建议多机多卡；这里仍保留通用入口。', [...S_DISTRIBUTED]),
  sec('concept-edit-curriculum', 'frontier', '概念编辑时间步课程', '按 band 循环限制 timestep 范围，由易到难。', [...S_CONCEPT_EDIT_CURRICULUM], { expert: true })
];

// ---- DreamBooth / Finetune 模型字段(SD DreamBooth + SDXL Finetune 共用)----
export const finetuneModel = (typeId, label) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, desc: '底模文件路径', defaultValue: '' },
  { key: 'resume', type: 'file', pickerType: 'output-model-file', allowModelDirectory: true, label: '继续训练路径', title: 'resume', desc: '从某个 save_state / 检查点继续训练：可选择检查点文件，或选择存档目录自动取最新', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径', title: 'vae', desc: '底模配套 VAE 权重路径，留空使用底模内置 VAE。', defaultValue: '' }
];

// ---- ControlNet 模型/数据/训练/学习率字段(SD / SDXL / FLUX ControlNet 共用)----
export const cnModel = (typeId, label, extra = []) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, desc: '底模文件路径', defaultValue: '' },
  { key: 'controlnet_model_name_or_path', type: 'file', pickerType: 'model-file', label: '已有 ControlNet 模型路径', title: 'controlnet_model_name_or_path', desc: '留空从头训练', defaultValue: '' },
  { key: 'resume', type: 'file', pickerType: 'output-model-file', allowModelDirectory: true, label: '继续训练路径', title: 'resume', desc: '从某个 save_state / 检查点继续训练：可选择检查点文件，或选择存档目录自动取最新', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径', title: 'vae', desc: '底模配套 VAE 权重路径，留空使用底模内置 VAE。', defaultValue: '' },
  ...extra
];
export const cnDataset = (reso, bucketMax, bucketStep) => [
  { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练数据集路径', title: 'train_data_dir', desc: '训练图像所在目录，子目录名可作为概念名。', defaultValue: './output/lulynx' },
  { key: 'conditioning_data_dir', type: 'folder', pickerType: 'folder', label: '条件图数据集路径', title: 'conditioning_data_dir', desc: 'ControlNet 条件图（边缘/姿态等控制输入）所在目录。', defaultValue: '' },
  { key: 'resolution', type: 'string', label: '训练分辨率', title: 'resolution', desc: '训练分辨率（面积基准），实际按分桶取最接近档位。', defaultValue: reso },
  { key: 'enable_bucket', type: 'boolean', label: '启用分桶', title: 'enable_bucket', desc: 'SDXL/SD15 等 UNet：arb 分桶全支持。DiT cache-first（Anima/Newbie 等）多半不改已缓存分辨率，主要影响 online/rebuild。视频族不保证。', defaultValue: true },
  { key: 'min_bucket_reso', type: 'number', label: '桶最小分辨率', title: 'min_bucket_reso', desc: 'arb 桶最小边。仅在分桶真正生效的路径上有意义。', defaultValue: 256 },
  { key: 'max_bucket_reso', type: 'number', label: '桶最大分辨率', title: 'max_bucket_reso', desc: 'arb 桶最大边。cache-first 回放通常沿用构建时分辨率。', defaultValue: bucketMax },
  { key: 'bucket_reso_steps', type: 'number', label: '桶划分单位', title: 'bucket_reso_steps', desc: '桶分辨率步进。UNet 全支持；DiT 见 enable_bucket 说明。', defaultValue: bucketStep },
  { key: 'image_decode_backend', type: 'select', label: '图片解码后端', title: 'image_decode_backend', desc: 'pil 最兼容；pil_lru 会缓存主图和条件图的已解码 RGB 结果', defaultValue: 'pil', options: IMAGE_DECODE_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'data_backend', type: 'select', label: '数据后端', title: 'data_backend', desc: 'auto/caption 当前继续走 CaptionDataset', defaultValue: 'auto', options: DATA_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'image_decode_cache_size', type: 'number', label: '图片解码缓存张数', title: 'image_decode_cache_size', desc: '每个 DataLoader worker 的 PIL 解码 LRU', defaultValue: 0, min: 0, visibleWhen: all(when('performance_expert_mode', true), oneOf('image_decode_backend', ['auto', 'pil_lru'])) }
];
export const cnTrainFields = [
  { key: 'max_train_epochs', type: 'number', label: '最大训练轮数', title: 'max_train_epochs', desc: '最大训练轮数上限。', defaultValue: 10, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小', title: 'train_batch_size', desc: '每个优化器 step 的样本数；受显存约束时配合梯度累加。', defaultValue: 1, min: 1, max: 32, step: 1 },
  { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点', title: 'gradient_checkpointing', desc: '以重计算换显存：反向时重算激活，显著省显存、略降速度。', defaultValue: true },
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数', title: 'gradient_accumulation_steps', desc: '每 N 次 microbatch 才执行一次', defaultValue: 1, min: 1 },
  { key: 'gradient_accumulation_mode', type: 'select', label: '梯度累加模式', title: 'gradient_accumulation_mode', desc: 'fast（默认）：仅在真正 optimizer.step 的那一步做梯度同步与检查；classic：保留逐 microbatch 检查的旧行为。', defaultValue: 'fast', options: [
    { value: 'fast', label: 'fast' },
    // classic 是后端 training_loop_epoch_mixin.py:317 的真实 else 分支，
    // 逐 microbatch 做同步/检查。原先只给 fast，这个分支选不到。
    { value: 'classic', label: 'classic（逐 microbatch 检查）' }
  ], visibleWhen: (c) => Number(c.gradient_accumulation_steps || 1) > 1 },
  { key: 'max_grad_norm', type: 'number', label: '梯度裁剪上限', title: 'max_grad_norm', desc: '梯度范数裁剪上限，超出按比例缩放，0=不裁剪。', defaultValue: 1.0, min: 0, step: 0.1 }
];
export const cnLR = [
  { key: 'learning_rate', type: 'string', label: '学习率', title: 'learning_rate', desc: '参数更新的步长基准，LoRA 常用 1e-4 量级。', defaultValue: '1e-4' },
  { key: 'control_net_lr', type: 'string', label: 'ControlNet 学习率', title: 'control_net_lr', desc: 'ControlNet 部分的独立学习率。', defaultValue: '1e-4' },
  { key: 'weight_decay', type: 'number', label: '权重衰减', title: 'weight_decay', desc: '优化器权重衰减。', defaultValue: 0.01, min: 0, max: 1, step: 0.001 },
  { key: 'lr_scheduler', type: 'select', label: '学习率调度器', title: 'lr_scheduler', desc: '学习率调度器；Loss 门控余弦会在 loss 有效下降时保持当前余弦值', defaultValue: 'cosine', options: schedulerOptions(ALL_SCHEDULERS) },
  { key: 'lr_warmup_steps', type: 'number', label: '预热步数', title: 'lr_warmup_steps', desc: '预热步数：学习率从低值线性升到目标的步数。', defaultValue: 0, min: 0 },
  ...S_LOSS_AWARE_LR,
  // (separator for TypeScript parser)
  { key: 'optimizer_type', type: 'select', label: '优化器', title: 'optimizer_type', desc: '优化器。pytorch_optimizer.<名字> 会转成 PytorchOptimizer 并把 name= 写进 optimizer_args，需要装 pytorch-optimizer 插件。', defaultValue: 'AdamW8bit', options: ALL_OPTIMIZERS }
];

// ---- Textual Inversion 模型/参数字段(SD + SDXL TI 共用)----
export const tiModel = (typeId, label, extra = []) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, desc: '底模文件路径', defaultValue: '' },
  { key: 'weights', type: 'file', pickerType: 'model-file', label: '初始 embedding 权重路径', title: 'weights', desc: '初始 embedding 权重路径，用于继续训练已有 TI。', defaultValue: '' },
  { key: 'resume', type: 'file', pickerType: 'output-model-file', allowModelDirectory: true, label: '继续训练路径', title: 'resume', desc: '从某个 save_state / 检查点继续训练：可选择检查点文件，或选择存档目录自动取最新', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径', title: 'vae', desc: '底模配套 VAE 权重路径，留空使用底模内置 VAE。', defaultValue: '' },
  ...extra
];
export const tiParams = [
  { key: 'token_string', type: 'string', label: 'Token 字符串', title: 'token_string', desc: 'tokenizer 中不存在的新 token。', defaultValue: '' },
  { key: 'init_word', type: 'string', label: '初始化词', title: 'init_word', desc: '用于初始化新 embedding 的已有词（如用 dog 初始化狗的概念）。', defaultValue: '' },
  { key: 'num_vectors_per_token', type: 'number', label: '每 token 向量数', title: 'num_vectors_per_token', desc: '每个占位 token 学习的嵌入向量数，>1 时推理需按序输入多个 token。', defaultValue: 1, min: 1 }
];
