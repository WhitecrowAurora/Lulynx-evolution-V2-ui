// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* schemaIndex.js 的类型声明(数据层为平移的纯 JS,以 .d.ts 提供精确类型,tsc 不深入推断 4K 行 JS) */

export interface SchemaFieldOption {
  value: string
  label?: string
  disabled?: boolean
  disabledReason?: string
}

export interface SchemaField {
  key: string
  type: string
  label?: string
  title?: string
  desc?: string
  /** Optional short highlight used by help fallback when present. */
  importantDesc?: string
  defaultValue?: unknown
  options?: (string | SchemaFieldOption)[] | Set<string | SchemaFieldOption> | ((config: Record<string, unknown>) => Iterable<string | SchemaFieldOption>)
  pickerType?: string
  allowModelDirectory?: boolean
  min?: number
  max?: number
  step?: number
  placeholder?: string
  visibleWhen?: (config: Record<string, unknown>) => boolean
  /** select 的选项要按当前运行时实测可用性置灰 */
  attentionBackendOptions?: boolean
  /** 该字段只有在这个注意力后端下才有意义(值为后端归一 id) */
  requiresAttentionBackend?: string
  /** 选项来自机器上的显卡表,而不是 schema 自己写死的 options */
  deviceListOptions?: boolean
  /** csvMultiSelect:顺序有语义,按勾选顺序追加而不是按候选表顺序重排 */
  preserveSelectionOrder?: boolean
  /** schema 自己锁死这个控件（不是运行时 profile 接管），后端会拒绝非默认值 */
  disabled?: boolean
  /** 根据当前草稿动态锁定控件 */
  disabledWhen?: (config: Record<string, unknown>) => boolean
  /** 锁死的理由，渲染层拿它当提示文案 */
  disabledReason?: string
  [extra: string]: unknown
}

export interface SchemaSection {
  id: string
  tab: string
  title: string
  description?: string
  fields: SchemaField[]
}

export interface TrainingTypeMeta {
  id: string
  group: string
  label: string
  hidden?: boolean
  disabled?: boolean
  disabledReason?: string
}

export interface UiTab {
  key: string
  label: string
  expertOnly?: boolean
}

export const TRAINING_TYPES: TrainingTypeMeta[]
export const ALL_TRAINING_TYPES: TrainingTypeMeta[]
export const UI_TABS: UiTab[]

export function getSectionsForType(typeId: string): SchemaSection[]
export function getSectionsForTab(tabKey: string, typeId: string): SchemaSection[]
export function getAvailableTabs(typeId: string, config?: Record<string, unknown>): UiTab[]
export function isFieldVisible(field: SchemaField, config: Record<string, unknown>): boolean
export function createDefaultConfig(typeId: string): Record<string, unknown>
export function normalizeDraftValue(field: SchemaField | undefined, rawValue: unknown): unknown
export function buildRunConfig(config: Record<string, unknown>, typeId: string): Record<string, unknown>
export function applyBackendConfigOptions(payload: unknown): boolean
export function getFieldDefinition(key: string, typeId?: string): SchemaField | undefined
