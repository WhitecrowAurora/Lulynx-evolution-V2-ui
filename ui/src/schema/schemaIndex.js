// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// ================================================================
// schemaIndex.js — 训练族 schema 汇总入口 + 公共 API
// 把各族(sdxl / anima / 长尾 / DiT 长尾 / 实验)的 section 汇成 SECTIONS_MAP,
// 并对外暴露 getSectionsForType / createDefaultConfig / buildRunConfig 等公共 API。
// 这是 main.js 与各 smoke/parity 工具的唯一公共入口(原先在 sdxlSchema 神文件尾部)。
// ================================================================
import { TRAINING_TYPES as ALL_TRAINING_TYPES, VISIBLE_TRAINING_TYPES, UI_TABS } from './trainingTypeRegistry.js';
import { TARGET_LORA_OPTIMIZERS, schedulerOptions } from './features/settingsOptions.js';
import { buildRunConfigFromSections } from './runConfigBuilder.js';
import { withConceptDirection } from './conceptDirectionSchema.js';
import { withAnimaRuntimeFields } from './features/animaRuntimeFields.js';
import {
  SDXL_LORA_SECTIONS, SDXL_ILECO_SECTIONS, SDXL_ADDIFT_SECTIONS, SDXL_MULTI_ADDIFT_SECTIONS,
  SDXL_FT_SECTIONS, SDXL_CN_SECTIONS, SDXL_CN_LLLITE_SECTIONS, SDXL_TI_SECTIONS,
} from './sdxlSchema.js';
import {
  ANIMA_LORA_SECTIONS, ANIMA_EDIT_MODEL_SECTIONS, ANIMA_ILECO_SECTIONS, ANIMA_ADDIFT_SECTIONS,
  ANIMA_MULTI_ADDIFT_SECTIONS, ANIMA_FT_SECTIONS, ANIMA_CN_SECTIONS,
} from './animaSchema.js';
import {
  SD15_LORA_SECTIONS, SD15_ILECO_SECTIONS, SD15_ADDIFT_SECTIONS, SD15_MULTI_ADDIFT_SECTIONS,
  DB_SECTIONS, SD_CN_SECTIONS, SD_TI_SECTIONS, YOLO_SECTIONS, AESTHETIC_SCORER_SECTIONS,
} from './otherSchemas.js';
import {
  FLUX_LORA_SECTIONS, LUMINA_LORA_SECTIONS, QWEN_IMAGE_LORA_SECTIONS, HUNYUAN_DIT_LORA_SECTIONS,
  HUNYUAN_IMAGE_COMPAT_SECTIONS, FLUX_FT_SECTIONS, LUMINA_FT_SECTIONS, FLUX_CN_SECTIONS, NEWBIE_LORA_SECTIONS,
  KREA2_LORA_SECTIONS, KREA2_FT_SECTIONS, FLUX2_LORA_SECTIONS, ZIMAGE_LORA_SECTIONS, WAN22_TI2V_LORA_SECTIONS, WAN22_T2V_A14B_LORA_SECTIONS, LTX23_LORA_SECTIONS, LTX25_LORA_SECTIONS, BOOGU_LORA_SECTIONS, BOOGU_EDIT_LORA_SECTIONS, BOOGU_FT_SECTIONS, LTX23_FT_SECTIONS, LTX25_FT_SECTIONS, FLUX2_FT_SECTIONS, ZIMAGE_FT_SECTIONS, WAN22_FT_SECTIONS, QWEN_IMAGE_FT_SECTIONS,
} from './otherDitSchemas.js';
import {
  LAB_DISTILLER_SECTIONS, SDXL_TURBO_LORA_SECTIONS, ANIMA_FEW_STEP_LORA_SECTIONS, NEWBIE_FEW_STEP_LORA_SECTIONS,
} from './experimentalTrainingSchemas.js';
import { CONCEPT_EDIT_UNIFIED_SECTIONS } from './conceptEditUnifiedSchema.js';
import { S_TRAINING_INTENT_PROFILE } from './schemaFrontierGroups.js';
import { applyAdapterFamilyCapabilities, sec, when } from './schemaCommon.js';
import { S_UNIVERSAL_DIT } from './universalDitFields.js';
import { MINIMAX_H3_LORA_SECTIONS, MINIMAX_H3_FT_SECTIONS } from './minimaxH3Schema.js';

export { ALL_TRAINING_TYPES, UI_TABS };
export const TRAINING_TYPES = VISIBLE_TRAINING_TYPES;

// TRAINING_TYPES 是侧栏可见列表；ALL_TRAINING_TYPES 用于导入/旧配置兼容校验。

// ================================================================
// SECTIONS_MAP
// ================================================================
const SECTIONS_MAP = {
  'sdxl-lora':              SDXL_LORA_SECTIONS,
  'sdxl-ileco':             SDXL_ILECO_SECTIONS,
  'sdxl-addift':            SDXL_ADDIFT_SECTIONS,
  'sdxl-multi-addift':      SDXL_MULTI_ADDIFT_SECTIONS,
  'sd-lora':                SD15_LORA_SECTIONS,
  'sd-ileco':               SD15_ILECO_SECTIONS,
  'sd-addift':              SD15_ADDIFT_SECTIONS,
  'sd-multi-addift':        SD15_MULTI_ADDIFT_SECTIONS,
  'flux-lora':              FLUX_LORA_SECTIONS,
  'lumina-lora':            LUMINA_LORA_SECTIONS,
  'qwen-image-lora':        QWEN_IMAGE_LORA_SECTIONS,
  'hunyuan-dit-lora':       HUNYUAN_DIT_LORA_SECTIONS,
  'hunyuan-image-lora':     HUNYUAN_IMAGE_COMPAT_SECTIONS,
  'anima-lora':             ANIMA_LORA_SECTIONS,
  'anima-edit-model':       ANIMA_EDIT_MODEL_SECTIONS,
  'anima-ileco':            ANIMA_ILECO_SECTIONS,
  'anima-addift':           ANIMA_ADDIFT_SECTIONS,
  'anima-multi-addift':     ANIMA_MULTI_ADDIFT_SECTIONS,
  'newbie-lora':            NEWBIE_LORA_SECTIONS,
  'krea2-lora':             KREA2_LORA_SECTIONS,
  'flux2-lora':             FLUX2_LORA_SECTIONS,
  'zimage-lora':            ZIMAGE_LORA_SECTIONS,
  'wan22-ti2v-lora':        WAN22_TI2V_LORA_SECTIONS,
  'wan22-t2v-a14b-lora':     WAN22_T2V_A14B_LORA_SECTIONS,
  'ltx23-lora':             LTX23_LORA_SECTIONS,
  'ltx25-lora':             LTX25_LORA_SECTIONS,
  'boogu-lora':             BOOGU_LORA_SECTIONS,
  'boogu-edit-lora': BOOGU_EDIT_LORA_SECTIONS,
  'lab-distiller':          LAB_DISTILLER_SECTIONS,
  'sdxl-turbo-lora':        SDXL_TURBO_LORA_SECTIONS,
  'anima-few-step-lora':    ANIMA_FEW_STEP_LORA_SECTIONS,
  'newbie-few-step-lora':   NEWBIE_FEW_STEP_LORA_SECTIONS,
  'concept-edit':           CONCEPT_EDIT_UNIFIED_SECTIONS,
  'sd-dreambooth':          DB_SECTIONS,
  'sdxl-finetune':          SDXL_FT_SECTIONS,
  'flux-finetune':          FLUX_FT_SECTIONS,
  'lumina-finetune':        LUMINA_FT_SECTIONS,
  'anima-finetune':         ANIMA_FT_SECTIONS,
  'krea2-finetune':         KREA2_FT_SECTIONS,
  'qwen-image-finetune':    QWEN_IMAGE_FT_SECTIONS,
  'boogu-finetune':         BOOGU_FT_SECTIONS,
  'ltx23-finetune':         LTX23_FT_SECTIONS,
  'ltx25-finetune':         LTX25_FT_SECTIONS,
  'flux2-finetune':         FLUX2_FT_SECTIONS,
  'zimage-finetune':        ZIMAGE_FT_SECTIONS,
  'wan22-finetune':         WAN22_FT_SECTIONS,
  'minimax-h3-lora':        MINIMAX_H3_LORA_SECTIONS,
  'minimax-h3-finetune':    MINIMAX_H3_FT_SECTIONS,
  'sd-controlnet':          SD_CN_SECTIONS,
  'sdxl-controlnet':        SDXL_CN_SECTIONS,
  'sdxl-controlnet-lllite': SDXL_CN_LLLITE_SECTIONS,
  'anima-controlnet':       ANIMA_CN_SECTIONS,
  'flux-controlnet':        FLUX_CN_SECTIONS,
  'sd-textual-inversion':   SD_TI_SECTIONS,
  'sdxl-textual-inversion': SDXL_TI_SECTIONS,
  'sd-ip-adapter':          createIpAdapterSections(SD15_LORA_SECTIONS, 'sd-ip-adapter'),
  'sdxl-ip-adapter':        createIpAdapterSections(SDXL_LORA_SECTIONS, 'sdxl-ip-adapter'),
  'yolo':                   YOLO_SECTIONS,
  'aesthetic-scorer':       AESTHETIC_SCORER_SECTIONS,
};

const TARGET_OPTIMIZER_TRAINING_TYPES = new Set(['sdxl-lora', 'anima-lora', 'anima-edit-model', 'newbie-lora']);
const TRAINING_INTENT_SUPPORTED_TYPES = new Set([
  'sdxl-lora',
  'sd-lora',
  'flux-lora',
  'lumina-lora',
  'qwen-image-lora',
  'hunyuan-dit-lora',
  'hunyuan-image-lora',
  'anima-lora',
  'anima-edit-model',
  'newbie-lora',
  'krea2-lora',
  'flux2-lora',
  'zimage-lora',
  'boogu-lora',
  'boogu-edit-lora',
  'sdxl-turbo-lora',
  'anima-few-step-lora',
  'newbie-few-step-lora',
]);
const UNIVERSAL_DIT_SECTION = {
  id: 'universal-dit-settings',
  tab: 'advanced',
  title: 'Universal DiT LoRA fallback',
  description: '对未被专用族路由识别的 DiT/Transformer 提供的探测与基础 LoRA 接入。',
  fields: S_UNIVERSAL_DIT,
};
function IP_ADAPTER_SECTION(typeId) {
  return {
  id: 'ip-adapter-settings',
  tab: 'network',
  title: 'IP-Adapter 设置',
  description: 'IP-Adapter 图像编码器与注入 token 配置。',
  fields: [
    { key: 'ip_image_encoder_path', type: 'string', label: '图像编码器路径', title: 'ip_image_encoder_path', desc: 'CLIP 视觉编码器路径。', defaultValue: 'openai/clip-vit-large-patch14' },
    { key: 'ip_num_tokens', type: 'number', label: '图像 Token 数', title: 'ip_num_tokens', desc: '注入 UNet 的 IP-Adapter token 数。', defaultValue: typeId === 'sdxl-ip-adapter' ? 16 : 4, min: 1, max: 64, step: 1 },
  ],
  };
}
function createIpAdapterSections(baseSections, typeId) {
  const sections = baseSections.map((section) => {
    if (section.id !== 'model-settings') return section;
    return {
      ...section,
      fields: section.fields.map((field) => field.key === 'model_train_type'
        ? { ...field, defaultValue: typeId }
        : field),
    };
  });
  const networkIndex = sections.findIndex((section) => section.id === 'network-settings');
  sections.splice(networkIndex >= 0 ? networkIndex + 1 : sections.length, 0, IP_ADAPTER_SECTION(typeId));
  return sections;
}
const TRAINING_INTENT_PROFILE_SECTION = {
  id: 'training-intent-profile',
  tab: 'training',
  title: '训练用途建议',
  description: '用途 Profile 只生成配置建议，不会在运行时静默改写参数。',
  fields: S_TRAINING_INTENT_PROFILE,
};
// 素材解耦（高级）：为每个素材子文件夹指定内容角色/标注/遮罩策略，序列化进单个
// subset_content_roles 字段(JSON 字符串)，由 collectVisiblePayload 原样带给后端。
// 自定义多行编辑器在 SectionCard 按 section.id 注入(MaterialDecouplingEditor)。
const MATERIAL_DECOUPLING_SECTION = sec(
  'material-decoupling',
  'dataset',
  '素材解耦（高级）',
  '为每个素材子文件夹单独指定内容角色与标注/遮罩策略；留空则沿用全局设置，不影响其它字段。',
  [
    {
      key: 'subset_content_roles',
      type: 'textarea',
      label: '素材解耦配置',
      title: 'subset_content_roles',
      desc: '每行给一个相对 train_data_dir 的素材子文件夹指定内容角色、标注模式与 mask 模式，序列化为 JSON 字符串提交。',
      defaultValue: '',
      visibleWhen: when('performance_expert_mode', true),
    },
  ],
  { expert: true },
);

// 只对含 train_data_dir 的标准图像数据集族叠加；目标检测/美学打分等非扩散训练族排除。
const MATERIAL_DECOUPLING_EXCLUDED_TYPES = new Set(['yolo', 'aesthetic-scorer']);
function injectMaterialDecoupling(sections, typeId) {
  if (MATERIAL_DECOUPLING_EXCLUDED_TYPES.has(typeId)) return sections;
  const dsIndex = sections.findIndex(
    (s) => s.id === 'dataset-settings' && s.fields.some((f) => f.key === 'train_data_dir'),
  );
  if (dsIndex < 0) return sections;
  const next = sections.slice();
  next.splice(dsIndex + 1, 0, MATERIAL_DECOUPLING_SECTION);
  return next;
}

const _sectionsCache = {};

// 兼容旧名
export const SDXL_SECTIONS = SDXL_LORA_SECTIONS;

// ================================================================
// 公共 API
// ================================================================
export function getSectionsForType(typeId) {
  if (_sectionsCache[typeId]) return _sectionsCache[typeId];
  const base = withAnimaRuntimeFields(SECTIONS_MAP[typeId] || SDXL_LORA_SECTIONS, typeId);
  const withProfile = TRAINING_INTENT_SUPPORTED_TYPES.has(typeId)
    ? [TRAINING_INTENT_PROFILE_SECTION, UNIVERSAL_DIT_SECTION, ...base]
    : base;
  _sectionsCache[typeId] = withConceptDirection(injectMaterialDecoupling(withProfile, typeId), typeId || 'sdxl-lora');
  return _sectionsCache[typeId];
}

function buildFieldMap(sections) {
  const map = new Map();
  for (const s of sections) for (const f of s.fields) map.set(f.key, f);
  return map;
}

const _fmCache = {};
function getFieldMapForType(typeId) {
  if (!_fmCache[typeId]) _fmCache[typeId] = buildFieldMap(getSectionsForType(typeId));
  return _fmCache[typeId];
}

export function getFieldDefinition(key, typeId) {
  if (typeId) return getFieldMapForType(typeId).get(key);
  for (const id of Object.keys(SECTIONS_MAP)) {
    const map = getFieldMapForType(id);
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

export function applyBackendConfigOptions(optionsPayload) {
  const payload = optionsPayload && typeof optionsPayload === 'object' ? optionsPayload : {};
  const optionValue = (option) => option && typeof option === 'object'
    ? String(option.value ?? '').trim()
    : String(option || '').trim();
  const uniqueOptions = (values) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map((option) => {
        const value = optionValue(option);
        if (!value || seen.has(value)) return null;
        seen.add(value);
        return option && typeof option === 'object' ? { ...option, value } : value;
      })
      .filter(Boolean);
  };
  const optimizers = uniqueOptions(payload.optimizers || payload.optimizer_type);
  const schedulers = uniqueOptions(payload.schedulers || payload.lr_scheduler);
  const familyCapabilitiesChanged = applyAdapterFamilyCapabilities(payload);
  // frontier_optimizer_candidates 已于 2026-08-04 随门闸从后端下发中移除:
  // 它宣传过的每个候选现在都是 optimizers 里的普通条目,没有 opt-in flag。
  if (optimizers.length === 0 && schedulers.length === 0) return familyCapabilitiesChanged;
  const mergedOptimizerOptions = uniqueOptions([...optimizers, ...TARGET_LORA_OPTIMIZERS]);

  for (const [typeId, sections] of Object.entries(SECTIONS_MAP)) {
    for (const section of sections) {
      for (const field of section.fields || []) {
        if (field.key === 'optimizer_type' && optimizers.length > 0 && TARGET_OPTIMIZER_TRAINING_TYPES.has(typeId)) {
          field.options = mergedOptimizerOptions;
        } else if (field.key === 'lr_scheduler' && schedulers.length > 0) {
          field.options = schedulerOptions(schedulers);
        }
      }
    }
  }
  Object.keys(_fmCache).forEach((key) => delete _fmCache[key]);
  return true;
}

export function getSectionsForTab(tabKey, typeId) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  let filtered = sections.filter((s) => {
    if (tabKey === 'dataset') return s.tab === 'dataset' || s.id === 'noise-settings';
    if (tabKey === 'advanced') return s.tab === 'advanced' && s.id !== 'noise-settings';
    if (tabKey === 'frontier') return s.tab === 'frontier';
    if (tabKey === 'model') return (s.tab === 'model' && s.id !== 'save-settings') || s.id === 'v-parameterization-settings' || s.id === 'rf-settings';
    if (tabKey === 'training') return (s.tab === 'training' || s.id === 'save-settings') && s.id !== 'v-parameterization-settings' && s.id !== 'rf-settings';
    return s.tab === tabKey;
  });

  if (tabKey === 'dataset') {
    const dataAugIndex = filtered.findIndex((s) => s.id === 'data-aug-settings');
    const noiseIndex = filtered.findIndex((s) => s.id === 'noise-settings');
    if (dataAugIndex !== -1 && noiseIndex !== -1 && noiseIndex !== dataAugIndex + 1) {
      const [noiseSection] = filtered.splice(noiseIndex, 1);
      filtered.splice(dataAugIndex + 1, 0, noiseSection);
    }
  }

  if (tabKey === 'training') {
    const trainingIndex = filtered.findIndex((s) => s.id === 'training-settings');
    const saveIndex = filtered.findIndex((s) => s.id === 'save-settings');
    if (trainingIndex !== -1 && saveIndex !== -1 && saveIndex !== trainingIndex + 1) {
      const [saveSection] = filtered.splice(saveIndex, 1);
      filtered.splice(trainingIndex + 1, 0, saveSection);
    }
  }

  if (tabKey === 'model') {
    const modelIndex = filtered.findIndex((s) => s.id === 'model-settings');
    const vParamIndex = filtered.findIndex((s) => s.id === 'v-parameterization-settings');
    const rfIndex = filtered.findIndex((s) => s.id === 'rf-settings');
    const moved = [];
    if (vParamIndex !== -1) {
      moved.push(filtered.splice(vParamIndex, 1)[0]);
    }
    const rfCurrentIndex = filtered.findIndex((s) => s.id === 'rf-settings');
    if (rfCurrentIndex !== -1) {
      moved.push(filtered.splice(rfCurrentIndex, 1)[0]);
    }
    if (modelIndex !== -1 && moved.length) {
      filtered.splice(modelIndex + 1, 0, ...moved);
    }
  }

  return filtered;
}

export function getAvailableTabs(typeId, config) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  const tabSet = new Set();
  for (const s of sections) tabSet.add(s.tab);
  // expertMode = 顶栏「高级」= performance_expert_mode；标准模式隐藏 expertOnly 页签（高级/先锋）
  const expertMode = !!(config && config.performance_expert_mode);
  return UI_TABS.filter((t) => tabSet.has(t.key) && (!t.expertOnly || expertMode));
}

export function isFieldVisible(field, config) {
  if (field?.requiresAttentionBackend) {
    const backend = String(config?.attention_backend || config?.attn_mode || config?.anima_attn_mode || '').trim().toLowerCase();
    if (field.requiresAttentionBackend === 'flash2') {
      if (backend !== 'flash2') return false;
    } else if (backend !== field.requiresAttentionBackend) {
      return false;
    }
  }
  if (!field?.visibleWhen) return true;
  return field.visibleWhen(config);
}

export function createDefaultConfig(typeId) {
  const config = {};
  for (const s of getSectionsForType(typeId || 'sdxl-lora'))
    for (const f of s.fields)
      config[f.key] = Array.isArray(f.defaultValue) ? [...f.defaultValue] : (f.defaultValue ?? '');
  return config;
}

export function normalizeDraftValue(field, rawValue) {
  if (!field) return rawValue;
  if (field.type === 'ui_group') return '';
  if (field.key === 'prior_loss_weight' && (rawValue === '' || rawValue === null || rawValue === undefined)) return 1;
  if (field.type === 'boolean') return Boolean(rawValue);
  if (field.type === 'multiSelect') return Array.isArray(rawValue) ? [...rawValue] : [];
  if (field.type === 'number' || field.type === 'slider') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    const p = Number(rawValue);
    return Number.isNaN(p) ? '' : p;
  }
  return rawValue;
}

export function buildRunConfig(config, typeId) {
  return buildRunConfigFromSections(config, typeId, { getSectionsForType, isFieldVisible });
}

