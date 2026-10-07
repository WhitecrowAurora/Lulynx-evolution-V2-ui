import { Textarea } from '@/components/form'
import { Button } from '@/components/primitives'
import { readConceptDirectionPairs, editConceptDirectionPairs } from '@/schema/features/conceptDirectionPairs.js'

export function ConceptDirectionPairs({ value, onChange, disabled = false }: {
  value: unknown
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { pairs, text, error } = readConceptDirectionPairs(value)
  const change = (action: string, index = -1, key = '', next = '') => {
    onChange(editConceptDirectionPairs(value, action, index, key, next))
  }
  if (error) {
    return (
      <div data-concept-direction-pairs>
        <p role="status">{error}</p>
        <Textarea rows={5} aria-label="原始概念对配置" disabled={disabled}
          value={text} onChange={(event) => onChange(event.target.value)} />
      </div>
    )
  }
  return (
    <div data-concept-direction-pairs style={{ display: 'grid', gap: 12 }}>
      <p>正向描述希望增强的概念，负向描述对应的对照；两侧都需填写。每对建议只改变一个概念。</p>
      {!pairs.length && <p>添加一对描述开始，例如“a smiling person”与“a person”。</p>}
      {pairs.map((pair, index) => (
        <fieldset key={index} data-concept-pair-index={index}
          style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
          <legend>概念对 {index + 1}</legend>
          <label>
            <span>正向提示词</span>
            <Textarea rows={2} aria-label={`概念对 ${index + 1} 正向提示词`} disabled={disabled}
              value={pair.positive || ''} onChange={(event) => change('update', index, 'positive', event.target.value)} />
          </label>
          <label>
            <span>负向提示词（对照）</span>
            <Textarea rows={2} aria-label={`概念对 ${index + 1} 负向提示词`} disabled={disabled}
              value={pair.negative || ''} onChange={(event) => change('update', index, 'negative', event.target.value)} />
          </label>
          <Button size="sm" variant="ghost" aria-label={`移除概念对 ${index + 1}`} disabled={disabled}
            onClick={() => change('remove', index)}>移除此对</Button>
        </fieldset>
      ))}
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => change('add')}>添加概念对</Button>
    </div>
  )
}
