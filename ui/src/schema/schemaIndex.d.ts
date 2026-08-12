// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* schemaIndex.js 的类型声明(数据层为平移的纯 JS,以 .d.ts 提供精确类型,tsc 不深入推断 4K 行 JS) */

export interface SchemaFieldOption {
  value: string
  label?: string
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
