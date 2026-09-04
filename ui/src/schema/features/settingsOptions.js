// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// Centralized catalogs for optimizer / scheduler display settings.
// Keep these lists broad: the settings page uses them to let users decide
// which choices should be visible in training forms. Some entries are aliases
// or custom class paths that are bridged to backend arguments at submit time.

export const BASE_OPTIMIZERS = [
  'AdamW',
  'SingularityAwareAdamW',
  'AdamW8bit',
  // first-party bf16 权重 + fp32 moments/residual 补偿；仅 bf16 参数；default-off
  'AdamWBF16',
  'PagedAdamW8bit',
  'PagedAdamW',
  'PagedAdamW32bit',
  'RAdamScheduleFree',
  'AdamWScheduleFree',
  'SGDScheduleFree',
  'Lion',
  'Lion8bit',
  'PagedLion8bit',
  'SGDNesterov',
  'SGDNesterov8bit',
  'DAdaptation',
  'DAdaptAdamPreprint',
  'DAdaptAdam',
  'DAdaptAdaGrad',
  'DAdaptAdan',
  'DAdaptAdanIP',
  'DAdaptLion',
  'DAdaptSGD',
  'Adafactor',
  'AdaFactor',
  'Prodigy',
  'prodigyplus.ProdigyPlusScheduleFree',
  'pytorch_optimizer.CAME',
  'pytorch_optimizer.StableAdamW',
  'pytorch_optimizer.SCION',
  'KL-Shampoo',
  'Gluon',
];

export const CURATED_PYTORCH_OPTIMIZER_NAMES = [
  'CAME',
  'StableAdamW',
  'SCION',
];

// 前沿优化器 release-hold 闸门已整线移除(后端 frontier_product_surface_guard.py /
// frontier_product_candidate_gate.py / frontier_optimizer_product_candidate_enabled
// 均已删除,legacy 与 React UI 同步)。这里不再保留 hold 名单 —— 名单一留就会和后端漂移,
// 而且它拦的都是已经能真跑的优化器。

// 已毕业并直接并入 optimizer_type 的前沿优化器。
// 这份名单与另外两套 UI 的同名导出必须一致。
export const VERIFIED_FRONTIER_OPTIMIZERS = [
  'ADOPT',
  'KahanAdamW',
  'KahanAdamW8bit',
  'Muon',
  'AdaMuon',
  'Riemannion',
  'Rose',
  'Aurora',
  'SOAP',
  'MARS',
];

const RAW_PYTORCH_OPTIMIZER_NAMES = [
  'LBFGS',
  'SGD',
  'Adam',
  'AdamW',
  'NAdam',
  'RMSprop',
  'A2Grad',
  'APOLLO',
  'ASGD',
  'AccSGD',
  'AdEMAMix',
  'AdaBelief',
  'AdaBound',
  'AdaDelta',
  'AdaFactor',
  'AdaGC',
  'AdaGO',
  'AdaHessian',
  'AdaLOMO',
  'AdaMax',
  'AdaMod',
  'AdaNorm',
  'AdaPNM',
  'AdaShift',
  'AdaSmooth',
  'AdaTAM',
  'Adai',
  'Adalite',
  'AdamC',
  'AdamG',
  'AdamMini',
  'AdamP',
  'AdamS',
  'AdamWSN',
  'Adan',
  'AggMo',
  'Aida',
  'AliG',
  'Alice',
  'BCOS',
  'Amos',
  'Ano',
  'ApolloDQN',
  'AvaGrad',
  'BSAM',
  'CAME',
  'Conda',
  'DAdaptAdaGrad',
  'DAdaptAdam',
  'DAdaptAdan',
  'DAdaptLion',
  'DAdaptSGD',
  'DeMo',
  'DiffGrad',
  'DualAdam',
  'EXAdam',
  'EmoFact',
  'EmoLynx',
  'EmoNavi',
  'FAdam',
  'FOCUS',
  'FTRL',
  'Fira',
  'FlashAdamW',
  'Fromage',
  'GaLore',
  'Grams',
  'Gravity',
  'GrokFastAdamW',
  'Kate',
  'Kron',
  'LARS',
  'LOMO',
  'LoRARite',
  'LaProp',
  'Lamb',
  'Lion',
  'MADGRAD',
  'MSVAG',
  'Nero',
  'NovoGrad',
  'PAdam',
  'PID',
  'PNM',
  'Prodigy',
  'QHAdam',
  'QHM',
  'RACS',
  'RAdam',
  'Ranger',
  'Ranger21',
  'Ranger25',
  'SCION',
  'SCIONLight',
  'SGDP',
  'SGDSaI',
  'SGDW',
  'SM3',
  'SPAM',
  'SPlus',
  'SRMM',
  'SWATS',
  'ScalableShampoo',
  'ScheduleFreeAdamW',
  'ScheduleFreeRAdam',
  'ScheduleFreeSGD',
  'Shampoo',
  'SignSGD',
  'SimplifiedAdEMAMix',
  'SophiaH',
  'StableAdamW',
  'StableSPAM',
  'TAM',
  'Tiger',
  'VSGD',
  'Yogi',
  'SpectralSphere',
];

export const PYTORCH_OPTIMIZER_NAMES = RAW_PYTORCH_OPTIMIZER_NAMES;

function optimizerBaseName(name) {
  const value = String(name || '').trim();
  const dotIndex = value.lastIndexOf('.');
  return (dotIndex === -1 ? value : value.slice(dotIndex + 1)).toLowerCase();
}

function dedupeKeepOrder(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

const BASE_OPTIMIZER_BASE_NAMES = new Set(BASE_OPTIMIZERS.map(optimizerBaseName));

export const ALL_OPTIMIZERS = dedupeKeepOrder([
  ...BASE_OPTIMIZERS,
  ...VERIFIED_FRONTIER_OPTIMIZERS,
  'LulynxEmoSensOptimizer',
  'EmoSens',
  ...CURATED_PYTORCH_OPTIMIZER_NAMES
    .filter((name) => !BASE_OPTIMIZER_BASE_NAMES.has(name.toLowerCase()))
    .map((name) => `pytorch_optimizer.${name}`),
  ...PYTORCH_OPTIMIZER_NAMES
    .filter((name) => !BASE_OPTIMIZER_BASE_NAMES.has(name.toLowerCase()))
    .map((name) => `pytorch_optimizer.${name}`),
]);

const TARGET_LORA_OPTIMIZERS_BASE = dedupeKeepOrder([
  ...ALL_OPTIMIZERS,
  'Automagic++',
  'AutoProdigy',
  'KahanAdamW',
  'KahanAdamW8bit',
  'bitsandbytes.optim.AdEMAMix8bit',
  'bitsandbytes.optim.PagedAdEMAMix8bit',
  'PytorchOptimizer',
  'GenericOptimizer',
  'AnimaFactoredAdamW',
]);

// Export as function to support filtering based on training mode
export function getOptimizersForTrainingMode(modelTrainType) {
  const trainType = String(modelTrainType || '').trim().toLowerCase();

  // AnimaFactoredAdamW is only for full model fine-tuning (anima-finetune)
  // For LoRA training, it's counterproductive (slower with no memory benefit)
  if (trainType !== 'anima-finetune') {
    return TARGET_LORA_OPTIMIZERS_BASE.filter((name) => name !== 'AnimaFactoredAdamW');
  }

  return TARGET_LORA_OPTIMIZERS_BASE;
}

// Legacy export for backward compatibility (returns all optimizers)
export const TARGET_LORA_OPTIMIZERS = TARGET_LORA_OPTIMIZERS_BASE;

export const BUILTIN_SCHEDULERS = [
  'linear',
  'cosine',
  'cosine_with_restarts',
  'polynomial',
  'constant',
  'constant_with_warmup',
  'adafactor',
  'inverse_sqrt',
  // 每一项都必须在后端 configs_enums.py 的 SchedulerType 里存在，否则选中即
  // ValidationError（reduce_lr_on_plateau / cosine_warmup_with_min_lr 曾是这样的死值）。
  'cosine_with_min_lr',
  'loss_gated_cosine',
  'loss_weighted_annealed_cosine',
  'warmup_stable_decay',
  'piecewise_constant',
  // 后端一直有实现但下拉够不到的三项。plugin 不列在这里：它是 operator 显式
  // opt-in 的通道，靠 lr_scheduler_args 里的 name= 指定提供方。
  'one_cycle',
  'restart_linear',
  'lulynx_exponential_warmup',
  // 由 lr_schedule_library 原生实现（乘数式 LambdaLR）。这七项以前只能靠
  // lr_scheduler_type 里的点号类名够到，那条路要动态 import 第三方
  // pytorch_optimizer；而那些实现按绝对 LR 赋值，会把多组 LR 压平成一个值。
  'cosine_warmup_restarts',
  'rex',
  'linear_with_warmup',
  'chebyshev',
  'step',
  'multi_step',
  'cyclic',
];

export const SCHEDULER_LABELS = Object.freeze({
  linear: '线性衰减',
  cosine: '余弦退火',
  cosine_with_restarts: '余弦重启',
  polynomial: '多项式衰减',
  constant: '恒定学习率',
  constant_with_warmup: '预热后恒定',
  adafactor: 'Adafactor 内置调度',
  inverse_sqrt: '反平方根衰减',
  cosine_with_min_lr: '带最小值余弦',
  loss_gated_cosine: 'Loss 门控余弦',
  loss_weighted_annealed_cosine: 'Loss 加权退火余弦',
  warmup_stable_decay: '预热-稳定-衰减',
  piecewise_constant: '分段恒定',
  one_cycle: '单周期（OneCycle）',
  restart_linear: '线性重启',
  lulynx_exponential_warmup: 'Lulynx 指数预热',
  cosine_warmup_restarts: '余弦重启（带预热）',
  rex: 'REX 反射指数衰减',
  linear_with_warmup: '线性衰减（带预热）',
  // 出厂走归一化档：配置的学习率是上限，倍数在 0.05-1.0 之间走 Chebyshev 节点顺序。
  // 忠实档（lr_scheduler_args 里 chebyshev_normalize=false）沿用论文的 1.0-20.0 倍放大。
  chebyshev: 'Chebyshev 节点调度（出厂归一化 0.05-1.0 倍，可切忠实档 1.0-20.0 倍）',
  step: '阶梯衰减',
  multi_step: '多阶梯衰减',
  cyclic: '循环学习率',
  // 旧草稿里可能存着这三个显示别名，保留标签让它们在下拉里可读。
  cosine_annealing: '余弦退火（旧名，等价 cosine）',
  cosine_annealing_with_warmup: '余弦重启带预热（旧名，等价 cosine_warmup_restarts）',
  cosine_annealing_warm_restarts: '余弦重启（旧名，等价 cosine_with_restarts）',
});

export function schedulerOption(value) {
  const raw = value && typeof value === 'object'
    ? String(value.value ?? '').trim()
    : String(value || '').trim();
  const fallbackLabel = value && typeof value === 'object'
    ? String(value.label ?? raw)
    : raw;
  return { value: raw, label: SCHEDULER_LABELS[raw] || fallbackLabel };
}

export function schedulerOptions(values) {
  return (Array.isArray(values) ? values : []).map(schedulerOption).filter((option) => option.value);
}

export const CUSTOM_SCHEDULERS = [
  // 点号类名不再出现在下拉里：这些调度器现在都是 SchedulerType 成员，由
  // lr_schedule_library 或 torch 原生构建，出厂 payload 里不再有点号值。想接
  // 真正的第三方调度器仍走 lr_scheduler_type 那个自由文本字段。
  // 下面三项是旧草稿存过的显示别名，留在这里是为了那些草稿加载后仍能在下拉里
  // 找到自己的选项；提交时由 SCHEDULER_VALUE_TO_TYPE 折到对应成员。
  'cosine_annealing',
  'cosine_annealing_with_warmup',
  'cosine_annealing_warm_restarts',
];

export const ALL_SCHEDULERS = dedupeKeepOrder([
  ...BUILTIN_SCHEDULERS,
  ...CUSTOM_SCHEDULERS,
]);

export const SCHEDULER_VALUE_TO_TYPE = Object.freeze({
  // 每个旧拼写折到一个 SchedulerType 成员。提交层看到目标是成员名时改写
  // lr_scheduler 本身、不再写 lr_scheduler_type，所以出厂 payload 里既没有点号值
  // 也没有"把 lr_scheduler 钉成 constant"那个绕 enum 墙的变通。
  'torch.optim.lr_scheduler.CosineAnnealingLR': 'cosine',
  'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts': 'cosine_with_restarts',
  'torch.optim.lr_scheduler.OneCycleLR': 'one_cycle',
  'torch.optim.lr_scheduler.StepLR': 'step',
  'torch.optim.lr_scheduler.MultiStepLR': 'multi_step',
  'torch.optim.lr_scheduler.CyclicLR': 'cyclic',
  'pytorch_optimizer.CosineAnnealingWarmupRestarts': 'cosine_warmup_restarts',
  'pytorch_optimizer.REXScheduler': 'rex',
  'pytorch_optimizer.CosineScheduler': 'cosine_with_min_lr',
  'pytorch_optimizer.LinearScheduler': 'linear_with_warmup',
  // 上游 PolyScheduler 的 _step 把步数乘方却从不除 t_max，学习率单调上涨到 30 倍
  // （lr=1e-3、order=0.5、第 900 步实测 0.029983）。选这一项的人要的是多项式衰减，
  // 后端 polynomial（PolynomialLR）就是那条曲线。后端解析器也独立挡了一道。
  'pytorch_optimizer.PolyScheduler': 'polynomial',
  'pytorch_optimizer.get_chebyshev_schedule': 'chebyshev',
  'pytorch_optimizer.get_wsd_schedule': 'warmup_stable_decay',
  cosine_annealing: 'cosine',
  cosine_annealing_with_warmup: 'cosine_warmup_restarts',
  cosine_annealing_warm_restarts: 'cosine_with_restarts',
});

export const SCHEDULER_TYPE_TO_VALUE = Object.freeze({
  // 加载路径：老配置里存的 lr_scheduler_type 折回下拉能选中的值。写成显式表而不是
  // 反转 SCHEDULER_VALUE_TO_TYPE —— 反转会得到 成员名 -> 点号值，正好是反方向，
  // 会把已经干净的配置又写回点号值。
  'torch.optim.lr_scheduler.CosineAnnealingLR': 'cosine',
  'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts': 'cosine_with_restarts',
  'torch.optim.lr_scheduler.OneCycleLR': 'one_cycle',
  'torch.optim.lr_scheduler.StepLR': 'step',
  'torch.optim.lr_scheduler.MultiStepLR': 'multi_step',
  'torch.optim.lr_scheduler.CyclicLR': 'cyclic',
  'pytorch_optimizer.CosineAnnealingWarmupRestarts': 'cosine_warmup_restarts',
  'pytorch_optimizer.REXScheduler': 'rex',
  'pytorch_optimizer.CosineScheduler': 'cosine_with_min_lr',
  'pytorch_optimizer.LinearScheduler': 'linear_with_warmup',
  'pytorch_optimizer.PolyScheduler': 'polynomial',
  'pytorch_optimizer.get_chebyshev_schedule': 'chebyshev',
  'pytorch_optimizer.get_wsd_schedule': 'warmup_stable_decay',
  cosine_annealing: 'cosine',
  cosine_annealing_with_warmup: 'cosine_warmup_restarts',
  cosine_annealing_warm_restarts: 'cosine_with_restarts',
  // 旧提交层把 PolyScheduler 折成成员名 polynomial 后写进了 lr_scheduler_type，
  // 所以老配置里 type 可能已经是成员名而不是点号值；折回下拉才能显示真相。
  polynomial: 'polynomial',
});
