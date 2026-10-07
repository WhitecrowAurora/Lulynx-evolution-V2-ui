// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import schemaFieldLabelsEn from './schemaFieldLabelsEn.json'
import schemaFieldDescsEn from './schemaFieldDescsEn.json'
import schemaFieldLabelsEnByType from './schemaFieldLabelsEnByType.json'
import schemaFieldDescsEnByType from './schemaFieldDescsEnByType.json'
import schemaFieldOptionsEn from './schemaFieldOptionsEn.json'
import schemaTabsEn from './schemaTabsEn.json'
import schemaGroupsEn from './schemaGroupsEn.json'

type ByTypeTable = Record<string, Record<string, string> | undefined>

function byTypeText(table: ByTypeTable, key?: string, typeId?: string): string | undefined {
  if (!key || !typeId) return undefined
  const bucket = table[key]
  const text = bucket ? bucket[typeId] : undefined
  return typeof text === 'string' && text.trim() ? text : undefined
}

export function resolveFieldLabel(field: { key?: string; label?: string; label_zh?: string; label_en?: string; [k: string]: unknown }, language: string, typeId?: string): string {
  const preferEn = language === 'en'
  const primary = preferEn ? field.label_en : field.label_zh
  const secondary = preferEn ? field.label_zh : field.label_en
  if (typeof primary === 'string' && primary.trim()) return primary
  if (preferEn) {
    const scoped = byTypeText(schemaFieldLabelsEnByType as ByTypeTable, field.key, typeId)
    if (scoped) return scoped
    if (field.key && typeof (schemaFieldLabelsEn as Record<string, string>)[field.key] === 'string') return (schemaFieldLabelsEn as Record<string, string>)[field.key]
  }
  if (typeof secondary === 'string' && secondary.trim()) return secondary
  if (typeof field.label === 'string' && field.label.trim()) return field.label
  return String(field.key ?? '')
}

export function resolveTabLabel(tab: { key: string; label?: string }, language: string): string {
  if (language === 'en') {
    const en = (schemaTabsEn as Record<string, string>)[tab.key]
    if (en) return en
  }
  return tab.label || tab.key
}

export function resolveGroupLabel(group: string, language: string): string {
  if (language === 'en') {
    const en = (schemaGroupsEn as Record<string, string>)[group]
    if (en) return en
  }
  return group
}

export function resolveFieldDesc(field: { key?: string; desc?: string; desc_zh?: string; desc_en?: string; title?: string; [k: string]: unknown }, language: string, typeId?: string): string {
  const preferEn = language === 'en'
  const primary = preferEn ? field.desc_en : field.desc_zh
  const secondary = preferEn ? field.desc_zh : field.desc_en
  if (typeof primary === 'string' && primary.trim()) return primary
  if (preferEn) {
    const scoped = byTypeText(schemaFieldDescsEnByType as ByTypeTable, field.key, typeId)
    if (scoped) return scoped
    if (field.key && typeof (schemaFieldDescsEn as Record<string, string>)[field.key] === 'string') return (schemaFieldDescsEn as Record<string, string>)[field.key]
  }
  if (typeof secondary === 'string' && secondary.trim()) return secondary
  if (typeof field.desc === 'string' && field.desc.trim()) return field.desc
  if (typeof field.title === 'string' && field.title.trim()) return field.title
  return ''
}

export function resolveOptionLabel(fieldKey: string | undefined, option: { value?: string | number; label?: string; label_en?: string; label_zh?: string }, language: string): string {
  const preferEn = language === 'en'
  const value = option.value == null ? '' : String(option.value)
  if (preferEn) {
    if (typeof option.label_en === 'string' && option.label_en.trim()) return option.label_en
    if (fieldKey && value) {
      const hit = (schemaFieldOptionsEn as Record<string, string>)[`${fieldKey}|${value}`]
      if (typeof hit === 'string' && hit.trim()) return hit
    }
  } else if (typeof option.label_zh === 'string' && option.label_zh.trim()) return option.label_zh
  if (typeof option.label === 'string' && option.label.trim()) return option.label
  return value
}
