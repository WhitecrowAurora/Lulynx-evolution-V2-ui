// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0

/** Project the supported Anima controls without changing shared SD schemas. */
export function withAnimaRuntimeFields(sections, typeId) {
  if (!String(typeId || '').startsWith('anima-')) return sections;
  return sections.map((section) => ({
    ...section,
    fields: section.fields
      .filter((field) => !field.key.startsWith('lr_finder_'))
      .map((field) => {
        if (field.key === 'cpu_offload_checkpointing'
          || field.key.startsWith('cpu_offload_checkpointing_')) {
          return {
            ...field,
            desc: field.key === 'cpu_offload_checkpointing'
              ? '通用检查点 CPU 卸载仅用于非忠实前向；忠实原生前向请使用「激活 CPU Offload」。'
              : field.desc,
            visibleWhen: (config) => config.anima_faithful_forward === false
              && (!field.visibleWhen || field.visibleWhen(config)),
          };
        }
        if (field.key === 'activation_cpu_offload_enabled') {
          return {
            ...field,
            desc: '将大激活搬到 CPU 内存降低显存，支持 Anima 忠实原生前向。需要 CPU 卸载时使用此开关；可与 interval>1 组合。',
          };
        }
        return field;
      }),
  }));
}
