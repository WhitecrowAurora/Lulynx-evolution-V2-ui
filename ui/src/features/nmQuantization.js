// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// Shared N:M checks for schema controls and submission validation.
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const COMPILE_BACKENDS = new Set(['thunder', 'thunder_jit', 'torch_compile', 'torchcompile', 'torch.compile', 'compile']);

export const boolConfig = (value) => typeof value === 'number'
  ? value !== 0
  : value === true || TRUE_VALUES.has(String(value ?? '').trim().toLowerCase());

export const isNmQuantization = (config = {}) => {
  const aliasEnabled = boolConfig(config.training_quantization_enabled);
  const type = String((aliasEnabled && config.training_quantization_type) || config.quantization_type || '').trim().toLowerCase();
  return (aliasEnabled || boolConfig(config.quantization_enabled)) && type === 'w4a16_2_4';
};

export const compileBackendIsActive = (config = {}) => {
  // An explicit backend overrides stale hidden flags, matching the backend contract.
  const key = Object.hasOwn(config, 'execution_backend') ? 'execution_backend'
    : Object.hasOwn(config, 'backend') ? 'backend' : null;
  if (key !== null) {
    return COMPILE_BACKENDS.has(String(config[key] || '').trim().toLowerCase().replaceAll('-', '_'));
  }
  return boolConfig(config.torch_compile) || boolConfig(config.thunder_jit_enabled);
};

export const nmSequentialOffloadDisabled = (config = {}) => (
  isNmQuantization(config) && compileBackendIsActive(config) && !boolConfig(config.enable_sequential_cpu_offload)
);

export const isNmCompileOffloadConflict = (config = {}) => (
  isNmQuantization(config) && compileBackendIsActive(config) && boolConfig(config.enable_sequential_cpu_offload)
);
