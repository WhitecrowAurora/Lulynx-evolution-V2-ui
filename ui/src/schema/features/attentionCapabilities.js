const ATTENTION_ALIASES = {
  '': 'auto',
  default: 'auto',
  auto: 'auto',
  torch: 'torch',
  native: 'torch',
  sdpa: 'sdpa',
  xformers: 'xformers',
  flash: 'flash2',
  flash2: 'flash2',
  flashattn: 'flash2',
  flashattention: 'flash2',
  flashattention2: 'flash2',
  fa2: 'flash2',
  sage: 'sageattn',
  sageattn: 'sageattn',
  sageattention: 'sageattn',
  sageattention2: 'sageattn',
  flex: 'flexattn',
  flexattn: 'flexattn',
  flexattention: 'flexattn',
  sparge: 'spargeattn2',
  spargeattn: 'spargeattn2',
  spargeattn2: 'spargeattn2',
};

const ATTENTION_LABELS = {
  auto: '自动（按当前运行时解析）',
  torch: 'Torch',
  sdpa: 'SDPA',
  xformers: 'xFormers',
  flash2: 'FlashAttention 2',
  sageattn: 'SageAttention',
  flexattn: 'FlexAttention',
  spargeattn2: 'Sparse GEMM Attention 2',
};

const ATTENTION_LABELS_EN = {
  auto: 'Auto (resolved from the current runtime)',
  torch: 'Torch',
  sdpa: 'SDPA',
  xformers: 'xFormers',
  flash2: 'FlashAttention 2',
  sageattn: 'SageAttention',
  flexattn: 'FlexAttention',
  spargeattn2: 'Sparse GEMM Attention 2',
};

/* 界面文案只有两档语言,且必须与三个分叉共用同一份 —— 理由字符串是判决的一部分,
   分头翻译会让同一个不可用原因在不同分叉上写成不同的话。 */
export function pickLang(config) {
  const raw = String(config?.lang || config?.language || 'zh').trim().toLowerCase();
  return raw.startsWith('en') ? 'en' : 'zh';
}

function backendLabel(backend, lang) {
  const table = lang === 'en' ? ATTENTION_LABELS_EN : ATTENTION_LABELS;
  return table[backend] || ATTENTION_LABELS[backend] || backend;
}

const TEXT = {
  zh: {
    autoFallback: '自动',
    familyUnknown: (b) => `尚未识别模型家族，不能确认 ${b} 能力`,
    specMissing: (b) => `运行时未返回 ${b} 的家族能力声明`,
    moduleMissing: (f) => `运行时未返回模型家族 ${f} 的模块级 FlashAttention 2 能力`,
    moduleStatus: (f, s) => `当前模型家族 ${f} 的模块级 FlashAttention 2 状态为 ${s}`,
    unsigned: (f) => `当前模型家族 ${f} 尚未完成真实模型 FlashAttention 2 签字`,
    trainerPath: (p, b) => `当前训练方式 ${p} 未接入 ${b}`,
    familyUnwired: (f, b) => `当前模型家族 ${f} 未接入 ${b}`,
    profileMissing: (p, b) => `当前 ${p} 运行时未提供 ${b}`,
    explicitOnlySuffix: (l) => `${l}（仅显式选择）`,
    unsignedSuffix: (l) => `${l}（未完成真实模型签字）`,
    unavailableSuffix: (l) => `${l}（当前运行时不可用）`,
    autoNoFlash2: '自动（该家族不会自动启用 FlashAttention 2）',
    flash2Only: '仅在 FlashAttention 2 后端下可用',
    profileBlocked: (p) => `当前 ${p} 运行时不可用`,
  },
  en: {
    autoFallback: 'Auto',
    familyUnknown: (b) => `Model family not identified, so ${b} support cannot be confirmed`,
    specMissing: (b) => `The runtime reported no family capability for ${b}`,
    moduleMissing: (f) => `The runtime reported no module-level FlashAttention 2 capability for family ${f}`,
    moduleStatus: (f, s) => `Module-level FlashAttention 2 for family ${f} is "${s}"`,
    unsigned: (f) => `Family ${f} has no real-model FlashAttention 2 sign-off yet`,
    trainerPath: (p, b) => `Trainer path ${p} is not wired to ${b}`,
    familyUnwired: (f, b) => `Family ${f} is not wired to ${b}`,
    profileMissing: (p, b) => `The current ${p} runtime does not provide ${b}`,
    explicitOnlySuffix: (l) => `${l} (explicit choice only)`,
    unsignedSuffix: (l) => `${l} (no real-model sign-off)`,
    unavailableSuffix: (l) => `${l} (unavailable in the current runtime)`,
    autoNoFlash2: 'Auto (this family will not auto-enable FlashAttention 2)',
    flash2Only: 'Only available with the FlashAttention 2 backend',
    profileBlocked: (p) => `Unavailable in the current ${p} runtime`,
  },
};

const FAMILY_ALIASES = [
  ['universal_dit', ['universal-dit', 'universal_dit', 'universaldit']],
  ['minimax_h3', ['minimax-h3', 'minimax_h3', 'minimaxh3']],
  ['ltx23', ['ltx25', 'ltx-2.5', 'ltx2.5', 'ltx23', 'ltx-2.3', 'ltx2.3', 'ltx2']],
  ['wan22', ['wan22', 'wan2.2', 'wan-2.2', 'wan2_2']],
  ['zimage', ['zimage', 'z-image', 'z_image']],
  ['flux2', ['flux2', 'flux-2', 'flux_2', 'klein']],
  ['lumina2', ['lumina2', 'lumina-2', 'lumina_2']],
  ['lumina', ['lumina']],
  ['newbie', ['newbie']],
  ['anima', ['anima']],
  ['krea2', ['krea2', 'krea-2', 'krea_2']],
  ['boogu', ['boogu']],
  ['sdxl', ['sdxl']],
  ['sd15', ['sd15', 'sd1.5', 'sd-1.5', 'sd-lora', 'sd-dreambooth', 'sd-controlnet', 'sd-textual-inversion']],
  ['sd3', ['sd3', 'sd-3', 'sd_3']],
  ['flux', ['flux']],
];

export function normalizeAttentionBackend(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return ATTENTION_ALIASES[key] || key || 'auto';
}

export function getAttentionModelFamily(config = {}) {
  const candidates = [
    config.activeTrainingType,
    config.model_train_type,
    config.training_type,
    config.schema_id,
    config.model_arch,
    config.model_type,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  for (const candidate of candidates) {
    for (const [family, aliases] of FAMILY_ALIASES) {
      if (aliases.some((alias) => candidate.includes(alias))) return family;
    }
  }
  return '';
}

function getTrainerPath(config = {}) {
  const raw = String(
    config.model_train_type || config.training_type || config.activeTrainingType || ''
  ).trim().toLowerCase();
  if (raw.includes('full') || raw.includes('finetune')) return 'full_finetune';
  if (raw.includes('dreambooth')) return 'dreambooth';
  if (raw.includes('controlnet')) return 'controlnet';
  if (raw.includes('textual')) return 'textual_inversion';
  if (raw.includes('ip-adapter') || raw.includes('ip_adapter')) return 'ip-adapter';
  if (raw.includes('lllite')) return 'lllite';
  return 'lora';
}

function backendFamilyCapability(profile, backend, config = {}) {
  const family = getAttentionModelFamily(config);
  const trainerPath = getTrainerPath(config);
  const lang = pickLang(config);
  const t = TEXT[lang];
  const label = backendLabel(backend, lang);
  const specs = Array.isArray(profile?.attention_backends) ? profile.attention_backends : [];
  const spec = specs.find((item) => normalizeAttentionBackend(item?.id) === backend) || null;
  const safeBaseline = backend === 'auto' || backend === 'sdpa' || backend === 'torch';
  if (backend === 'auto') {
    return { allowed: true, explicitOnly: false, unsigned: false, reason: '' };
  }
  if (!family) {
    if (safeBaseline) return { allowed: true, explicitOnly: false, unsigned: false, reason: '' };
    return {
      allowed: false,
      explicitOnly: false,
      unsigned: false,
      reason: t.familyUnknown(label),
    };
  }
  if (!spec) {
    if (safeBaseline) return { allowed: true, explicitOnly: false, unsigned: false, reason: '' };
    return {
      allowed: false,
      explicitOnly: false,
      unsigned: false,
      reason: t.specMissing(label),
    };
  }
  const supported = new Set(spec.supported_model_families || []);
  const explicit = new Set(spec.explicit_model_families || []);
  const trainerPaths = new Set(spec.supported_trainer_paths || []);
  if (backend === 'flash2') {
    const capabilities = Array.isArray(profile?.module_attention_capabilities)
      ? profile.module_attention_capabilities
      : [];
    const familyCapability = capabilities.find((item) => item?.family === family) || null;
    if (!familyCapability) {
      return {
        allowed: false,
        explicitOnly: false,
        unsigned: false,
        reason: t.moduleMissing(family),
      };
    }
    if (!familyCapability.runtime_requestable || !familyCapability.module_wired) {
      const status = familyCapability.status || 'unsupported';
      return {
        allowed: false,
        explicitOnly: false,
        unsigned: false,
        reason: t.moduleStatus(family, status),
      };
    }
    if (!familyCapability.real_model_signed) {
      return {
        allowed: false,
        explicitOnly: explicit.has(family),
        unsigned: true,
        reason: t.unsigned(family),
      };
    }
  }
  if (trainerPaths.size > 0 && !trainerPaths.has(trainerPath)) {
    return { allowed: false, explicitOnly: false, unsigned: false, reason: t.trainerPath(trainerPath, label) };
  }
  if (supported.has(family)) return { allowed: true, explicitOnly: false, unsigned: false, reason: '' };
  if (explicit.has(family)) return { allowed: true, explicitOnly: true, unsigned: false, reason: '' };
  return {
    allowed: false,
    explicitOnly: false,
    unsigned: false,
    reason: t.familyUnwired(family, label),
  };
}

function profileId(value) {
  return String(value || '').trim().toLowerCase() || 'standard';
}

export function getCurrentExecutionProfileId(config = {}) {
  const runtime = config.runtime && typeof config.runtime === 'object' ? config.runtime : null;
  const runtimeInfo = runtime?.runtime && typeof runtime.runtime === 'object' ? runtime.runtime : null;
  return profileId(
    config.execution_profile_id
    || config.runtime_id
    || config.native_runtime_profile
    || runtimeInfo?.runtime_id
    || runtimeInfo?.environment
    || runtime?.runtime_id
    || runtime?.environment
    || 'standard'
  );
}

export function findExecutionProfile(profiles, config = {}) {
  const wanted = getCurrentExecutionProfileId(config);
  const list = Array.isArray(profiles) ? profiles : [];
  return list.find((profile) => profileId(profile?.id) === wanted)
    || list.find((profile) => profileId(profile?.id) === 'standard')
    || null;
}

export function buildAttentionCapability(profiles, config = {}) {
  const profile = findExecutionProfile(profiles, config);
  const supported = new Set((profile?.supported_attention_backends || []).map(normalizeAttentionBackend));
  const available = new Set((profile?.available_attention_backends || []).map(normalizeAttentionBackend));
  for (const backend of ['auto', 'sdpa', 'torch']) {
    supported.add(backend);
    available.add(backend);
  }
  return {
    profile,
    profileId: profileId(profile?.id || getCurrentExecutionProfileId(config)),
    supported,
    available,
    family: getAttentionModelFamily(config),
  };
}

export function isAttentionBackendAvailable(backend, profiles, config = {}) {
  const normalized = normalizeAttentionBackend(backend);
  if (normalized === 'auto') return true;
  if (profiles == null) return true;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return normalized === 'sdpa' || normalized === 'torch';
  }
  const capability = buildAttentionCapability(profiles, config);
  const familyCapability = backendFamilyCapability(capability.profile, normalized, config);
  return capability.supported.has(normalized)
    && capability.available.has(normalized)
    && familyCapability.allowed;
}

export function makeAttentionOptions(values, profiles, config = {}) {
  const rows = Array.isArray(values) ? values : [];
  const lang = pickLang(config);
  const t = TEXT[lang];
  // profiles == null 表示能力表还没到位(未加载完 / 请求失败)。它此前与"加载完确实为空"
  // 不可区分,于是冷启动那几秒 flash2 就已经被标成「当前运行时不可用」。未知时保持中性。
  if (profiles == null) {
    return rows.map((item) => (
      item && typeof item === 'object' ? { ...item } : { value: item, label: item || t.autoFallback }
    ));
  }
  const capability = buildAttentionCapability(profiles, config);
  return rows.map((item) => {
    const option = item && typeof item === 'object' ? { ...item } : { value: item, label: item || t.autoFallback };
    const normalized = normalizeAttentionBackend(option.value);
    const value = option.value ?? '';
    const familyCapability = backendFamilyCapability(capability.profile, normalized, config);
    const explicitOnly = normalized !== 'auto' && familyCapability.explicitOnly;
    const unsigned = normalized !== 'auto' && familyCapability.unsigned;
    let label = option.label || backendLabel(normalized, lang) || String(value || t.autoFallback);
    if (explicitOnly) label = t.explicitOnlySuffix(label);
    if (unsigned) label = t.unsignedSuffix(label);
    if (normalized === 'auto' && capability.family) {
      const profileDefault = normalizeAttentionBackend(capability.profile?.default_attention_backend);
      const defaultFamily = backendFamilyCapability(capability.profile, profileDefault, config);
      if (defaultFamily.explicitOnly) label = t.autoNoFlash2;
    }
    const runtimeUnavailable = normalized !== 'auto'
      && (!capability.supported.has(normalized) || !capability.available.has(normalized));
    const familyUnavailable = normalized !== 'auto' && !familyCapability.allowed;
    const unavailable = runtimeUnavailable || familyUnavailable;
    const unavailableReason = familyUnavailable
      ? familyCapability.reason
      : t.profileMissing(capability.profileId, backendLabel(normalized, lang));
    return {
      ...option,
      value,
      label: unavailable ? t.unavailableSuffix(label) : label,
      disabled: Boolean(option.disabled || unavailable),
      disabledReason: unavailable
        ? unavailableReason
        : option.disabledReason,
      explicitOnly,
      unsigned,
    };
  });
}

/* 某个字段依赖的后端在当前运行时拿不到时的封锁理由;'' = 不封锁。
   放在这里而不是各分叉的渲染层:三处分头实现过一次,理由文案和判定条件都会各自漂。 */
export function attentionBackendBlockReason(field, profiles, config = {}) {
  const required = field?.requiresAttentionBackend;
  if (!required) return '';
  const t = TEXT[pickLang(config)];
  const selected = normalizeAttentionBackend(
    config.attention_backend || config.attn_mode || config.anima_attn_mode || '',
  );
  if (normalizeAttentionBackend(required) === 'flash2' && selected !== 'flash2') return t.flash2Only;
  if (isAttentionBackendAvailable(required, profiles, config)) return '';
  return t.profileBlocked(getCurrentExecutionProfileId(config));
}
