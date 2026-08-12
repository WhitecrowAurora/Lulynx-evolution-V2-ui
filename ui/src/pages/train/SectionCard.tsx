// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useMemo } from 'react'
import type { SchemaField, SchemaSection } from '@/schema/schemaIndex'
import { isFieldVisible } from '@/schema/schemaIndex.js'
import { Panel } from '@/components/layout'
import { FieldControl } from './FieldControl'
import { WeightComposerPreview } from './WeightComposerPreview'
import { TrainingIntentProfilePreview } from './TrainingIntentProfilePreview'
import { ProgressivePhaseEditor } from './ProgressivePhaseEditor'

/* 一个 schema section → 一张面板卡;字段可见性(visibleWhen)+ 搜索过滤,全部不可见则整卡隐藏 */

function matches(field: SchemaField, term: string): boolean {
  if (!term) return true
  const t = term.toLowerCase()
  return (
    field.key.toLowerCase().includes(t) ||
    (field.label ?? '').toLowerCase().includes(t) ||
    (field.title ?? '').toLowerCase().includes(t) ||
    (field.desc ?? '').toLowerCase().includes(t)
  )
}

export function SectionCard({
  section,
  idx,
  config,
  search,
  onChange,
  onHelp,
  explicitFields,
  onApplySuggestions,
}: {
  section: SchemaSection
  idx: number
  config: Record<string, unknown>
  search: string
  onChange: (key: string, raw: unknown) => void
  onHelp: (field: SchemaField) => void
  explicitFields: string[]
  onApplySuggestions: (values: Record<string, unknown>) => void
}) {
  const visibleFields = useMemo(
    () =>
      section.fields.filter(
        (f) => f.type !== 'hidden' && isFieldVisible(f, config) && matches(f, search),
      ),
    [section, config, search],
  )
  const progressiveScheduleField = section.id === 'progressive-training'
    ? visibleFields.find((field) => field.key === 'progressive_phase_schedule')
    : undefined
  const renderedFields = progressiveScheduleField
    ? visibleFields.filter((field) => field.key !== progressiveScheduleField.key)
    : visibleFields

  if (!visibleFields.length) return null

  // 英文副标:section id 连字符转空格 + 大写,仿设计稿 (WEIGHT COMPOSITION)
  const en = section.id.replace(/[-_]+/g, ' ').trim().toUpperCase()

  return (
    <Panel
      title={section.title}
      idx={String(idx + 1).padStart(2, '0')}
      en={en}
      count={`${visibleFields.length} 项设置`}
      className="lx-cfg-section"
    >
      {section.description ? <p className="lx-cfg-desc">{section.description}</p> : null}
      <div className="lx-cfg-grid">
        {renderedFields.map((f) => (
          <FieldControl key={f.key} field={f} value={config[f.key]} onChange={(raw) => onChange(f.key, raw)} onHelp={onHelp} />
        ))}
      </div>
      {progressiveScheduleField ? (
        <ProgressivePhaseEditor
          value={config.progressive_phase_schedule}
          onChange={(raw) => onChange('progressive_phase_schedule', raw)}
        />
      ) : null}
      {section.id === 'weight-composer' ? <WeightComposerPreview config={config} onChange={onChange} /> : null}
      {section.id === 'training-intent-profile' ? (
        <TrainingIntentProfilePreview config={config} explicitFields={explicitFields} onApplySuggestions={onApplySuggestions} />
      ) : null}
    </Panel>
  )
}
