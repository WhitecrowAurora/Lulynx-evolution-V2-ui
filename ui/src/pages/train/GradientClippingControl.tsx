// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, type ReactNode } from 'react'
import type { SchemaField } from '@/schema/schemaIndex'
import { Input, Switch } from '@/components/form'
import { useI18n } from '@/i18n/useI18n'

export function GradientClippingControl({
  field, value, onChange, help, desc, disabled, disabledReason,
}: {
  field: SchemaField
  value: unknown
  onChange: (raw: unknown) => void
  help: ReactNode
  desc: string
  disabled: boolean
  disabledReason: string
}) {
  const { t } = useI18n()
  const defaultLimit = Number(field.defaultValue ?? 1)
  const norm = value === '' || value == null ? defaultLimit : Number(value)
  const enabled = norm > 0
  const lastLimit = useRef(defaultLimit > 0 ? defaultLimit : 1)
  useEffect(() => {
    if (Number.isFinite(norm) && norm > 0) lastLimit.current = norm
  }, [norm])

  return (
    <div className="lx-gradient-clipping lx-cfg-grid" data-field-key={field.key}>
      <div className={`lx-field lx-field-bool${disabled ? ' is-profile-managed' : ''}`}>
        <span className="lx-field-main">
          <span className="lx-field-label"><span>{t('field.gradient_clipping_enabled')}</span>{help}</span>
          {desc ? <span className="lx-field-desc">{desc}</span> : null}
        </span>
        <Switch checked={enabled} disabled={disabled} ariaLabel={t('field.gradient_clipping_enabled')}
          onChange={(next) => onChange(next ? lastLimit.current : 0)} />
        {disabledReason ? <span className="lx-profile-managed-note">{disabledReason}</span> : null}
      </div>
      {enabled ? (
        <label className={`lx-field${disabled ? ' is-profile-managed' : ''}`}>
          <span className="lx-field-label">{t('field.gradient_clipping_limit')}</span>
          <Input type="number" value={value == null ? defaultLimit : String(value)}
            min={field.min ?? 0} step={field.step ?? 0.1} disabled={disabled}
            onChange={(event) => onChange(event.target.value)} />
        </label>
      ) : null}
    </div>
  )
}
