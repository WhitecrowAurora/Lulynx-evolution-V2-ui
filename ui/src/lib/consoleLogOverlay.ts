// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/**
 * Display-only console log localization for the training monitor.
 *
 * The webUI monitor reads output.log lines verbatim (telemetry_store streams
 * raw lines, no prefix stripping), so each line still carries its emit prefix:
 *   - `LOG: <message>`                      (trainer print channel)
 *   - `<ts> - ERROR - FAILED: <message>`    (logger.error channel)
 *   - `LOG: [precision] ...`                (prefixed structured logs)
 * We strip the LOG:/timestamp-level prefix, translate the bare message, then
 * re-attach nothing (bare message localized). Raw lines are preserved by the
 * caller for copy/export; only the rendered text is localized.
 *
 * Rule set mirrors backend/launcher/api/infra/console_i18n.py — keep in sync.
 */

type Rule = { re: RegExp; zh: string };

const LIFECYCLE_RULES: Rule[] = [
  { re: /^Starting training\.\.\.$/, zh: "开始训练..." },
  { re: /^Dataset: (\d+) samples$/, zh: "数据集：{0} 个样本" },
  { re: /^Steps per epoch: (\d+)$/, zh: "每轮步数：{0}" },
  { re: /^Total steps: (\d+)$/, zh: "总步数：{0}" },
  { re: /^Loading base model\.\.\.$/, zh: "正在加载底模..." },
  { re: /^Injecting LoRA layers\.\.\.$/, zh: "正在注入 LoRA 层..." },
  { re: /^Seed applied: (\d+)$/, zh: "已应用随机种子：{0}" },
  { re: /^Trainable parameters: ([\d,]+)$/, zh: "可训练参数量：{0}" },
  {
    re: /^Epoch (\d+)\/(\d+) completed, avg loss: ([\d.]+), duration: (.+)$/,
    zh: "第 {0}/{1} 轮完成，平均 loss：{2}，耗时：{3}",
  },
  {
    re: /^Epoch (\d+) report — avg_loss=([\d.]+), steps=(\d+), duration=(.+)$/,
    zh: "第 {0} 轮报告 — 平均 loss={1}，步数={2}，耗时={3}",
  },
  {
    re: /^Reached max_train_steps; stopping epoch loop after epoch (\d+)$/,
    zh: "已达到 max_train_steps；将在第 {0} 轮后停止轮次循环",
  },
  { re: /^Training completed in ([\d.]+)s$/, zh: "训练完成，耗时 {0}s" },
  {
    re: /^Running Anima validation sampling \(epoch (\d+)\)$/,
    zh: "正在运行 Anima 验证采样（第 {0} 轮）",
  },
];

const ERROR_RULES: Rule[] = [
  { re: /^FAILED: Training returned unsuccessful status\.$/, zh: "[错误] 训练返回了失败状态。" },
  { re: /^FAILED: Could not load config: (.+)$/, zh: "[错误] 无法加载配置：{0}" },
  { re: /^FAILED: Missing dependencies: (.+)$/, zh: "[错误] 缺少依赖：{0}" },
  { re: /^FAILED: TurboCore resolution failed: (.+)$/, zh: "[错误] TurboCore 解析失败：{0}" },
  { re: /^FAILED: Unexpected error during training: (.+)$/, zh: "[错误] 训练过程中发生意外错误：{0}" },
  { re: /^FAILED: (.+)$/, zh: "[错误] {0}" },
  { re: /^Validation sampling failed: (.+)$/, zh: "[警告] 验证采样失败：{0}" },
  { re: /^Validation failed at epoch (\d+): (.+)$/, zh: "[警告] 第 {0} 轮验证失败：{1}" },
  { re: /^Sampling failed: (.+)$/, zh: "[警告] 采样失败：{0}" },
  { re: /^Sampling initialization failed: (.+)$/, zh: "[警告] 采样初始化失败：{0}" },
  { re: /^Step checkpoint save failed at step (\d+): (.+)$/, zh: "[警告] 第 {0} 步检查点保存失败：{1}" },
];

// `[precision]` / `[runtime-opt]` / `[weight-compression]` structured banners:
// prefix kept, trailing content passed through. These fire on the common case
// without enumerating every message (the launcher overlay has the full table;
// here we localize the generic warn/info wrappers users most often see).
const PREFIX_PASSTHROUGH_RULES: Rule[] = [
  { re: /^(\[precision\])\[warn\] (.+)$/, zh: "{0}[警告] {1}" },
  { re: /^(\[weight-compression\])\[warn\] (.+)$/, zh: "{0}[警告] {1}" },
];

const ALL_RULES: Rule[] = [...LIFECYCLE_RULES, ...ERROR_RULES, ...PREFIX_PASSTHROUGH_RULES];

// Strip the trainer `LOG: ` channel prefix and the logging `<ts> - LEVEL - `
// prefix so rules match the bare message. Returns the bare message.
const LOG_PREFIX_RE = /^LOG:\s+/;
const LOGGER_PREFIX_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\s+-\s+\w+\s+-\s+/;

function stripPrefix(line: string): string {
  let s = line;
  const logger = s.match(LOGGER_PREFIX_RE);
  if (logger) s = s.slice(logger[0].length);
  const log = s.match(LOG_PREFIX_RE);
  if (log) s = s.slice(log[0].length);
  return s;
}

function formatTemplate(template: string, groups: string[]): string {
  return template.replace(/\{(\d+)\}/g, (_, idx) => groups[Number(idx)] ?? "");
}

/** Translate one monitor log line to Chinese when a rule matches; else unchanged. */
export function translateMonitorLine(line: string): string {
  const bare = stripPrefix(line);
  for (const rule of ALL_RULES) {
    const m = bare.match(rule.re);
    if (m) return formatTemplate(rule.zh, m.slice(1));
  }
  return line;
}

/**
 * Display-layer overlay: localize only when language is zh and enabled.
 * Raw lines (for copy/export) must bypass this.
 */
export function overlayMonitorLine(
  line: string,
  opts: { language?: string; enabled?: boolean },
): string {
  if (opts.enabled === false) return line;
  const lang = (opts.language || "en").toLowerCase();
  if (!lang.startsWith("zh")) return line;
  return translateMonitorLine(line);
}
