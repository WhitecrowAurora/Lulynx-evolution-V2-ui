// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useMemo } from 'react'
import type { SchemaField, SchemaSection } from '@/schema/schemaIndex'
import { isFieldVisible } from '@/schema/schemaIndex.js'
import { Panel } from '@/components/layout'
import { FieldControl } from './FieldControl'
import { WeightComposerPreview } from './WeightComposerPreview'
import { TrainingIntentProfilePreview } from './TrainingIntentProfilePreview'
import { ProgressivePhaseEditor } from './ProgressivePhaseEditor'
import { MaterialDecouplingEditor } from './MaterialDecouplingEditor'

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
  managedKeys,
  managedMessage,
}: {
  section: SchemaSection
  idx: number
  config: Record<string, unknown>
  search: string
  onChange: (key: string, raw: unknown) => void
  onHelp: (field: SchemaField) => void
  explicitFields: string[]
  onApplySuggestions: (values: Record<string, unknown>) => void
  managedKeys: ReadonlySet<string>
  managedMessage: string
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
  const materialDecouplingField = section.id === 'material-decoupling'
    ? visibleFields.find((field) => field.key === 'subset_content_roles')
    : undefined
  // 被自定义编辑器接管的字段不再交给 FieldControl 渲染(仿 progressive)
  const interceptedKeys = new Set(
    [progressiveScheduleField?.key, materialDecouplingField?.key].filter(Boolean) as string[],
  )
  const renderedFields = interceptedKeys.size
    ? visibleFields.filter((field) => !interceptedKeys.has(field.key))
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
          <FieldControl
            key={f.key}
            field={f}
            value={config[f.key]}
            onChange={(raw) => onChange(f.key, raw)}
            onHelp={onHelp}
            disabled={Boolean(f.disabled) || managedKeys.has(f.key)}
            disabledReason={f.disabled ? String(f.disabledReason || '') : managedKeys.has(f.key) ? managedMessage : ''}
          />
        ))}
      </div>
      {progressiveScheduleField ? (
        <ProgressivePhaseEditor
          value={config.progressive_phase_schedule}
          onChange={(raw) => onChange('progressive_phase_schedule', raw)}
        />
      ) : null}
      {materialDecouplingField ? (
        <MaterialDecouplingEditor
          value={config.subset_content_roles}
          onChange={(raw) => onChange('subset_content_roles', raw)}
        />
      ) : null}
      {section.id === 'weight-composer' ? <WeightComposerPreview config={config} onChange={onChange} /> : null}
      {section.id === 'training-intent-profile' ? (
        <TrainingIntentProfilePreview config={config} explicitFields={explicitFields} onApplySuggestions={onApplySuggestions} />
      ) : null}
    </Panel>
  )
}
