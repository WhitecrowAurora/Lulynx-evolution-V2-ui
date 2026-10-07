// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/**
 * Training wiki loader with manifest aliases + schema fallback.
 * Parity target: lora-scripts-ui-main/ui/src/utils/trainingWiki.js (P2 dual-tree).
 */
import type { SchemaField } from '@/schema/schemaIndex'
import { resolveFieldDesc, resolveFieldLabel } from '@/i18n/schemaI18n'

const WIKI_ROOT = 'training-wiki'

export type WikiStandard = {
  summary?: string
  effect?: string
  whenToUse?: string
  avoidWhen?: string
  recommendedValues?: Record<string, string>
  optionDescriptions?: Record<string, string>
  [key: string]: unknown
}

export type WikiAdvanced = {
  principle?: string
  tradeoffs?: string
  [key: string]: unknown
}

export type WikiEntry = {
  key?: string
  title?: string
  title_en?: string
  category?: string
  category_en?: string
  appliesTo?: string[]
  layers?: string[]
  layers_en?: string[]
  standard?: WikiStandard | null
  standard_en?: WikiStandard | null
  advanced?: WikiAdvanced | null
  advanced_en?: WikiAdvanced | null
  relatedConfigs?: string[]
  optionDescriptions?: Record<string, string>
  fallback?: boolean
  resolvedVia?: string
  language?: string
}

type ManifestItem = {
  key?: string
  entry?: string
  aliases?: string[]
}

type Manifest = {
  entries?: ManifestItem[]
}

let manifestPromise: Promise<Manifest> | null = null
const entryPromises = new Map<string, Promise<WikiEntry | null>>()

export async function loadTrainingWikiManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetchJson<Manifest>(`${WIKI_ROOT}/manifest.json`).catch(() => ({ entries: [] }))
  }
  return manifestPromise
}

export async function loadTrainingWikiEntry(fieldKey: string): Promise<WikiEntry | null> {
  const key = String(fieldKey || '').trim()
  if (!key) return null
  if (!entryPromises.has(key)) {
    entryPromises.set(key, resolveEntry(key))
  }
  return entryPromises.get(key) ?? null
}

/** Test/dev helper — clear in-memory caches between smoke runs. */
export function clearTrainingWikiCache(): void {
  manifestPromise = null
  entryPromises.clear()
}

/** `en`/`en-US`/... 都算英文；其它一律按中文渲染。 */
function prefersEnglish(language: unknown): boolean {
  return String(language || '').toLowerCase().startsWith('en')
}

function pickText(zh: unknown, en: unknown): unknown {
  if (typeof en === 'string' && en.trim()) return en
  if (Array.isArray(en) && en.length) return en
  return zh
}

/** 一个 prose/map 块的逐字段回退：`standard_en` 缺哪个字段，那个字段就用中文那一份。 */
function pickBlock<T extends Record<string, unknown>>(
  zh: T | null | undefined,
  en: T | null | undefined,
): T | null {
  if (!en) return zh ?? null
  if (!zh) return en
  const merged: Record<string, unknown> = { ...zh }
  for (const [field, value] of Object.entries(en)) {
    const base = zh[field]
    if (value && typeof value === 'object' && !Array.isArray(value)
        && base && typeof base === 'object' && !Array.isArray(base)) {
      // optionDescriptions / recommendedValues：按选项值再逐格回退。
      const inner: Record<string, unknown> = { ...(base as Record<string, unknown>) }
      for (const [option, text] of Object.entries(value as Record<string, unknown>)) {
        inner[option] = pickText(inner[option], text)
      }
      merged[field] = inner
      continue
    }
    merged[field] = pickText(base, value)
  }
  return merged as T
}

/**
 * 按当前界面语言挑一条词条的可渲染形状。
 *
 * 逐字段回退，不整块回退：`advanced_en` 本轮只留字段位不填，整块回退会让英文用户
 * 在「原理」那一栏看到整段中文；逐字段回退看到的是英文正文里还没译的那一行。
 */
export function pickLocalizedEntry(
  entry: WikiEntry | null | undefined,
  language: unknown,
): WikiEntry | null {
  if (!entry) return null
  if (!prefersEnglish(language)) return entry
  return {
    ...entry,
    title: pickText(entry.title, entry.title_en) as string | undefined,
    category: pickText(entry.category, entry.category_en) as string | undefined,
    layers: pickText(entry.layers, entry.layers_en) as string[] | undefined,
    standard: pickBlock(entry.standard as Record<string, unknown> | null, entry.standard_en as Record<string, unknown> | null) as WikiStandard | null,
    advanced: pickBlock(entry.advanced as Record<string, unknown> | null, entry.advanced_en as Record<string, unknown> | null) as WikiAdvanced | null,
    language: 'en',
  }
}

/**
 * 没有词条的字段由 schema 现造一条。**第五个渲染面** —— 英文模式下它也必须出英文，
 * 否则「英文界面全是中文」在没有词条的字段上原样保留（780 条词条覆盖不到全部字段）。
 *
 * label/desc 走 `resolveFieldLabel` / `resolveFieldDesc`（表单里已经在用的那两个解析器，
 * 带 by-type 维度），套话由本模块按语言分两套。
 */
export function buildSchemaFallbackEntry(
  field: SchemaField | null | undefined,
  language: unknown = 'zh',
  typeId?: string,
): WikiEntry | null {
  if (!field) return null
  const en = prefersEnglish(language)
  const lang = en ? 'en' : 'zh'
  const key = String(field.key || '').trim()
  // 两个解析器只在英文模式下用：中文路径保持一个字节不动 —— zh 模式下解析器会在
  // 没有 desc_zh 时回退到 desc_en / title，那会把中文界面上的这一段换成别的东西。
  const rawLabel = en ? resolveFieldLabel(field as Record<string, unknown>, 'en', typeId) : ''
  const label = stripKeySuffix(String(rawLabel || field.label || key || (en ? 'Parameter' : '参数说明')))
  const resolvedDesc = en ? resolveFieldDesc(field as Record<string, unknown>, 'en', typeId) : ''
  const desc = String(resolvedDesc || field.desc || field.importantDesc || '').trim()
  const summary =
    desc ||
    (en
      ? (key
          ? `"${label}" maps to the training config key ${key}. Its wiki entry is still being written; what follows is inferred from the schema.`
          : 'This parameter comes from the current training schema; its wiki entry is still being written.')
      : (key
          ? `「${label}」对应训练配置键 ${key}。完整 Wiki 条目还在补充中，以下为 schema 推断。`
          : '这个参数来自当前训练 schema，完整 Wiki 条目还在补充中。'))

  const type = String(field.type || 'string').toLowerCase()
  const defaultText = formatDefault(field.defaultValue)
  const effect = en
    ? buildEffectLineEn(type, label, desc, defaultText)
    : buildEffectLine(type, label, desc, defaultText)
  const whenToUse = en
    ? buildWhenToUseLineEn(type, desc, defaultText)
    : buildWhenToUseLine(type, desc, defaultText)
  const avoidWhen = en ? buildAvoidWhenLineEn(type, field) : buildAvoidWhenLine(type, field)

  return {
    key,
    title: label,
    category: en ? 'Training Parameters' : '训练参数',
    standard: {
      summary,
      effect,
      whenToUse,
      avoidWhen,
    },
    advanced: null,
    relatedConfigs: [],
    fallback: true,
    resolvedVia: 'schema_fallback',
    language: lang,
  }
}

async function resolveEntry(key: string): Promise<WikiEntry | null> {
  const manifest = await loadTrainingWikiManifest()
  const item = findManifestEntry(manifest, key)
  if (item?.entry) {
    const fromManifest = await fetchJson<WikiEntry>(`${WIKI_ROOT}/${item.entry}`).catch(() => null)
    if (fromManifest) {
      return {
        ...fromManifest,
        key: fromManifest.key || item.key || key,
        resolvedVia: item.key === key ? 'manifest_key' : 'manifest_alias',
      }
    }
  }
  // Manifest lag safety: still try entries/{key}.json when registered path fails or is missing.
  const direct = await fetchJson<WikiEntry>(
    `${WIKI_ROOT}/entries/${encodeURIComponent(key)}.json`,
  ).catch(() => null)
  if (direct) {
    return { ...direct, key: direct.key || key, resolvedVia: 'entries_direct' }
  }
  return null
}

function findManifestEntry(manifest: Manifest | null | undefined, key: string): ManifestItem | null {
  const entries = Array.isArray(manifest?.entries) ? manifest!.entries! : []
  return (
    entries.find(
      (item) => item.key === key || (Array.isArray(item.aliases) && item.aliases.includes(key)),
    ) || null
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Wiki resource not found: ${url}`)
  return (await response.json()) as T
}

function stripKeySuffix(label: string): string {
  return String(label || '')
    .replace(/（[^）]+）\s*$/, '')
    .trim()
}

function formatDefault(value: unknown): string {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}…` : value
  try {
    const s = JSON.stringify(value)
    return s.length > 80 ? `${s.slice(0, 77)}…` : s
  } catch {
    return ''
  }
}

function buildEffectLine(type: string, label: string, desc: string, defaultText: string): string {
  if (desc) {
    if (defaultText !== '') return `${desc}（schema 默认：${defaultText}）`
    return desc
  }
  if (type === 'boolean') {
    return defaultText === 'true'
      ? `默认开启。关闭「${label}」会改变训练/运行时行为，请结合预检确认。`
      : `默认关闭。开启「${label}」后才会进入对应训练/运行时路径。`
  }
  if (type === 'select') {
    return defaultText
      ? `从选项中选择；schema 默认值为 ${defaultText}。`
      : '从下拉选项中选择合适的取值。'
  }
  if (type === 'number') {
    return defaultText !== ''
      ? `数值参数；schema 默认 ${defaultText}。建议小步调整并短测。`
      : '数值参数；建议小步调整并短测。'
  }
  return '具体效果取决于当前训练类型和后端运行时解析。'
}

function buildWhenToUseLine(type: string, desc: string, defaultText: string): string {
  const lower = desc.toLowerCase()
  if (/debug|调试|诊断|probe|实验|experimental|research/.test(lower)) {
    return '主要用于调试/实验场景；确认问题后再考虑长期打开。'
  }
  if (/hdd|整片|shard|缓存|cache|磁盘/.test(desc)) {
    return '按磁盘介质与缓存策略选择；HDD 更宜整片，SSD/调试可 per_file。'
  }
  if (type === 'boolean' && defaultText === 'false') {
    return '需要对应能力时再开启；不确定时先保持默认关闭并短测。'
  }
  if (type === 'boolean' && defaultText === 'true') {
    return '产品默认路径通常保持开启；仅在明确冲突或预检建议时再关。'
  }
  return '不确定时先保持默认值，小步数短测确认再调整。'
}

function buildAvoidWhenLine(type: string, field: SchemaField): string {
  const parts: string[] = []
  if (typeof field.visibleWhen === 'function') {
    parts.push('它可能受其它选项显隐/互斥约束，界面隐藏时不要强行写进导出配置')
  }
  const desc = String(field.desc || '')
  if (/互斥|冲突|不要|勿|禁止|exclusive|incompatible/.test(desc)) {
    parts.push('描述中已提示互斥或风险，优先按预检与描述处理')
  }
  if (type === 'boolean') {
    parts.push('与预检/依赖冲突时优先关实验开关')
  }
  if (!parts.length) {
    return '如果它与其它选项互斥、预检提示冲突，优先按预检建议处理。'
  }
  return `${parts.join('；')}。`
}

function buildEffectLineEn(type: string, label: string, desc: string, defaultText: string): string {
  if (desc) {
    if (defaultText !== '') return `${desc} (schema default: ${defaultText})`
    return desc
  }
  if (type === 'boolean') {
    return defaultText === 'true'
      ? `On by default. Turning "${label}" off changes training/runtime behaviour -- confirm against preflight.`
      : `Off by default. Turning "${label}" on is what enters the corresponding training/runtime path.`
  }
  if (type === 'select') {
    return defaultText
      ? `Pick one of the options; the schema default is ${defaultText}.`
      : 'Pick the value that fits from the dropdown.'
  }
  if (type === 'number') {
    return defaultText !== ''
      ? `Numeric parameter; schema default ${defaultText}. Change it in small steps and short-test.`
      : 'Numeric parameter; change it in small steps and short-test.'
  }
  return 'What it does depends on the current training type and how the backend runtime resolves it.'
}

function buildWhenToUseLineEn(type: string, desc: string, defaultText: string): string {
  const lower = desc.toLowerCase()
  if (/debug|调试|诊断|probe|实验|experimental|research/.test(lower)) {
    return 'Mainly for debugging/experiments; leave it on long-term only once the issue is understood.'
  }
  if (/hdd|整片|shard|缓存|cache|磁盘/.test(desc)) {
    return 'Choose by disk medium and cache policy: whole-shard suits an HDD, per_file suits an SSD or debugging.'
  }
  if (type === 'boolean' && defaultText === 'false') {
    return 'Turn it on when you need that capability; when unsure keep the default off and short-test first.'
  }
  if (type === 'boolean' && defaultText === 'true') {
    return 'The product default path usually keeps this on; turn it off only on a clear conflict or a preflight hint.'
  }
  return 'When unsure keep the default, then short-test a few steps before changing it.'
}

function buildAvoidWhenLineEn(type: string, field: SchemaField): string {
  const parts: string[] = []
  if (typeof field.visibleWhen === 'function') {
    parts.push('it may be constrained by other options (visibility/mutual exclusion), so do not force it into an exported config while the form hides it')
  }
  const desc = String(field.desc || '')
  if (/互斥|冲突|不要|勿|禁止|exclusive|incompatible/.test(desc)) {
    parts.push('the description already flags a conflict or a risk -- follow preflight and the description first')
  }
  if (type === 'boolean') {
    parts.push('when it conflicts with preflight or a dependency, turn the experimental switch off first')
  }
  if (!parts.length) {
    return 'If it is mutually exclusive with another option or preflight flags a conflict, follow the preflight advice.'
  }
  return `${parts.join('; ')}.`
}
