// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/* 表单原子:字段容器/输入/下拉/开关/滑杆 */

export function FieldShell({
  label,
  en,
  right,
  desc,
  children,
  className,
}: {
  label: ReactNode
  en?: string
  right?: ReactNode
  desc?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={['lx-field', className].filter(Boolean).join(' ')}>
      <span className="lx-field-label">
        <span className="lx-field-label-text">
          <span>
            {label}
            {en ? <span style={{ opacity: 0.65 }}> · {en}</span> : null}
          </span>
          {desc ? <span className="lx-field-desc">{desc}</span> : null}
        </span>
        {right}
      </span>
      {children}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={['lx-input', className].filter(Boolean).join(' ')} spellCheck={false} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={['lx-textarea', className].filter(Boolean).join(' ')} spellCheck={false} {...rest} />
})

export function Select({
  options,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string; disabled?: boolean; title?: string }[] }) {
  return (
    <span className="lx-select-wrap">
      <select className={['lx-select', className].filter(Boolean).join(' ')} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      className={['lx-switch', checked ? 'on' : ''].filter(Boolean).join(' ')}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function Slider({
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <input
      id={id}
      type="range"
      className="lx-range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
