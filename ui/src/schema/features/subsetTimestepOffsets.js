// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
export function normalizeSubsetTimestepOffsets(value) {
  const raw = typeof value === 'string' ? JSON.parse(value || '{}') : value ?? {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('子集时间步偏移必须是 JSON 对象。');
  }
  const entries = Object.entries(raw).map(([key, value]) => {
    const id = key.trim().replace(/\\/g, '/');
    const offset = Number(value);
    if (!id || !['number', 'string'].includes(typeof value) || String(value).trim() === ''
      || !Number.isFinite(offset) || Math.abs(offset) > 1000) {
      throw new Error(`子集 ${key || '（空）'} 的时间步偏移必须是 -1000 至 1000 的有限数值。`);
    }
    return [id, id === '__regularization__' ? 0 : offset];
  });
  if (new Set(entries.map(([id]) => id)).size !== entries.length) {
    throw new Error('子集时间步偏移包含重复的子集路径。');
  }
  return Object.fromEntries(entries);
}

export function withSubsetTimestepOffsets(sections, typeId) {
  if (['yolo', 'aesthetic-scorer'].includes(typeId)) return sections;
  const index = sections.findIndex(s => s.fields.some(f => f.key === 'train_data_dir'));
  if (index < 0) return sections;
  const fields = [{
    key: 'subset_timestep_offsets', type: 'textarea', label: '子集时间步偏移',
    title: 'subset_timestep_offsets', guideEntryKey: 'subset_timestep_offsets', defaultValue: {},
    desc: '每个相对子集路径一个偏移；根目录为 .，默认 0。按 1000 步归一化域计量：负值偏低噪声，正值偏高噪声，仅 logit_normal 生效。',
  }];
  // Expose the existing shared sampler for DDPM/transport families that had no control.
  const usesDdpm = /^(sdxl|sd-|newbie)/.test(typeId) && !typeId.includes('few-step') && typeId !== 'sdxl-turbo-lora';
  const flow = config => usesDdpm && Boolean(config.flow_model);
  const mode = config => flow(config) ? config.timestep_sampling : config.ddpm_timestep_sampling;
  const existing = new Map(sections.flatMap(s => s.fields.map(f => [f.key, f])));
  if (usesDdpm && !existing.has('ddpm_timestep_sampling')) fields.push({
    key: 'ddpm_timestep_sampling', type: 'select', label: '时间步采样', defaultValue: '',
    desc: '默认沿用原采样；选择 logit_normal 后可使用子集偏移。',
    options: [{ value: '', label: '默认' }, 'uniform', 'logit_normal'], visibleWhen: c => !flow(c),
  });
  if (usesDdpm && !existing.has('timestep_sampling')) fields.push({
    key: 'timestep_sampling', type: 'select', label: 'Flow 时间步采样', defaultValue: '',
    options: [{ value: '', label: '默认' }, 'uniform', 'logit_normal'], visibleWhen: flow,
  });
  const logitVisible = c => mode(c) === 'logit_normal';
  const next = sections.map(s => ({ ...s, fields: s.fields.map(f => {
    if (!usesDdpm || !['flow_logit_mean', 'flow_logit_std'].includes(f.key)) return f;
    return { ...f, visibleWhen: c => logitVisible(c) || !f.visibleWhen || f.visibleWhen(c) };
  }) }));
  if (usesDdpm) for (const [key, label, value] of [
    ['flow_logit_mean', 'Logit 正态均值', 0], ['flow_logit_std', 'Logit 正态标准差', 1],
  ]) if (!existing.has(key)) fields.push({ key, type: 'number', label, defaultValue: value, visibleWhen: logitVisible });
  next.splice(index + 1, 0, {
    id: 'subset-timestep-offsets', tab: 'dataset', title: '子集时间步偏移（高级）',
    description: '按素材子集调节训练噪声分布。默认 0 保持原行为；此调节不保证提升画质。', fields,
  });
  return next;
}
