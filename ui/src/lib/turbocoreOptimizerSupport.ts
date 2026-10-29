// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0

// 与后端 TurboCore 原生优化器运行时的支持集合保持一致
export const TURBOCORE_NATIVE_OPTIMIZERS = ['AdamW', 'AdaMod', 'AdamG'] as const

const NATIVE_KEYS = new Set<string>(TURBOCORE_NATIVE_OPTIMIZERS.map((name) => name.toLowerCase()))
const NAME_KEYS = ['name', 'optimizer_name', 'optimizer']
const PLUGIN_ROUTE = /^PytorchOptimizer[:/](.+)$|^pytorch_optimizer\.(.+)$/i
const NAME_LINE = /^\s*(name|optimizer_name|optimizer)\s*=/
const ARG_SEPARATOR = /[\n,;]|\s+(?=[A-Za-z_][\w.-]*\s*=)/

// 训练器读 optimizer_args 的方式：键名区分大小写、同名后者覆盖、name > optimizer_name > optimizer
function argOptimizerName(lines: string[]): string {
  const args = new Map<string, string>()
  for (const chunk of lines.join(' ').split(ARG_SEPARATOR)) {
    const eq = chunk.indexOf('=')
    const key = eq < 0 ? '' : chunk.slice(0, eq).trim()
    if (key) args.set(key, chunk.slice(eq + 1).trim().replace(/^['"]+|['"]+$/g, ''))
  }
  return NAME_KEYS.map((key) => args.get(key)?.trim()).find(Boolean) ?? ''
}

/**
 * 当前草稿的优化器 TurboCore 无法原生执行时返回其显示名;受支持或尚未选择(后端按 AdamW)时返回 ''。
 * 名字解析同 runConfigBuilder:自定义参数逐行 key=value,插件路线里行首的名字参数压过下拉选择。
 */
export function turbocoreUnsupportedOptimizer(optimizerType: unknown, optimizerArgsCustom: unknown): string {
  const raw = String(optimizerType ?? '').trim()
  if (!raw) return ''
  const lines = String(optimizerArgsCustom ?? '').trim().split(/[\n\r]+/).map((line) => line.trim()).filter((line) => line.includes('='))
  const plugin = raw.match(PLUGIN_ROUTE)
  let name = raw
  if (plugin) {
    const selected = (plugin[1] ?? plugin[2]).trim()
    name = argOptimizerName(lines.some((line) => NAME_LINE.test(line)) ? lines : [`name=${selected}`, ...lines])
  } else if (raw.replace(/ /g, '').toLowerCase() === 'pytorchoptimizer') {
    name = argOptimizerName(lines)
  }
  return NATIVE_KEYS.has(name.toLowerCase()) ? '' : name || raw
}
