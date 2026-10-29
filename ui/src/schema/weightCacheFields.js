// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { all, pcieDeltaCacheField, pcieDeltaCacheModeFields } from './schemaCommon.js';

export const blockWeightCacheFields = (residencyKey, mode = 'block_offload') => [
  pcieDeltaCacheField(residencyKey),
  ...pcieDeltaCacheModeFields(residencyKey),
].map((field) => ({
  ...field,
  visibleWhen: all(
    (config) => !String(config.model_train_type || '').includes('finetune'),
    (config) => (Array.isArray(mode) ? mode : [mode]).includes(config[residencyKey]), field.visibleWhen,
  ),
}));

export const blockResidencyWithCacheFields = (residencyKey) => [
  {
    key: residencyKey, type: 'select', label: 'DiT 块驻留',
    defaultValue: 'block_offload',
    options: [{ value: 'resident', label: '全部驻留 GPU' },
      { value: 'block_offload', label: '分块卸载到 CPU' }],
  },
  ...blockWeightCacheFields(residencyKey),
];

// Reuse each schema's existing swap controls; do not introduce a second mode.
export function withSwapWeightCache(sections, typeId) {
  if (/finetune|^anima|^newbie/.test(typeId || '')) return sections;
  const keys = new Set(sections.flatMap((s) => s.fields.map((f) => f.key)));
  const hasCache = keys.has('pcie_delta_cache_enabled');
  const isSdxl = String(typeId || '').startsWith('sdxl-');
  if (hasCache && !isSdxl) return sections;
  const swapKeys = ['swap_granularity', 'blocks_to_swap', 'h3_blocks_to_swap'];
  const index = sections.findIndex((s) => s.fields.some((f) => swapKeys.includes(f.key)));
  if (index < 0) return sections;
  const visible = (c) => c.sdxl_unet_backend !== 'lulynx_native' && (
    Number(c.h3_blocks_to_swap) > 0 || Number(c.blocks_to_swap) > 0 ||
    (['auto', 'block', 'merged_block', 'layer'].includes(c.swap_granularity) &&
      (Number(c.swap_count) > 0 || Number(c.swap_ratio) > 0))
  );
  const fields = [pcieDeltaCacheField('swap_granularity'), ...pcieDeltaCacheModeFields('swap_granularity')]
    .map((field) => ({ ...field, visibleWhen: (c) => visible(c) && (
      field.key === 'pcie_delta_cache_enabled' || (c.pcie_delta_cache_enabled &&
        (field.key === 'pcie_delta_cache_mode' || c.pcie_delta_cache_mode === 'cache_v0'))
    ) }));
  if (hasCache) {
    return sections.map((s) => ({ ...s, fields: s.fields.map((f) => {
      const fallback = fields.find((field) => field.key === f.key);
      return fallback ? { ...f, visibleWhen: (c) => Boolean(f.visibleWhen?.(c) || fallback.visibleWhen(c)) } : f;
    }) }));
  }
  return sections.map((s, i) => i === index ? { ...s, fields: [...s.fields, ...fields] } : s);
}
