// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// Keep one numeric wire field: zero disables clipping, positive values set its limit.
export function withGradientClippingControls(sections) {
  const target = sections.find((section) => section.fields.some((field) => field.key === 'safeguard_enabled'));
  if (!target) return sections;
  const existing = sections.flatMap((section) => section.fields).find((field) => field.key === 'max_grad_norm');
  const clipping = {
    ...existing,
    key: 'max_grad_norm', type: 'number', title: 'max_grad_norm',
    label: '梯度裁剪', label_en: 'Gradient clipping',
    desc: '按比例缩小过大的梯度。关闭时不裁剪；此选项独立于 NaN 保护。',
    desc_en: 'Scale down oversized gradients. Disable to leave them unclipped; this choice is independent of NaN protection.',
    defaultValue: existing?.defaultValue ?? 1.0, min: 0, step: existing?.step ?? 0.1,
    visibleWhen: undefined, clippingControl: true,
  };
  return sections.map((section) => ({
    ...section,
    fields: section.fields.flatMap((field) => {
      if (field.key === 'max_grad_norm') return [];
      return section === target && field.key === 'safeguard_enabled' ? [field, clipping] : [field];
    }),
  }));
}
