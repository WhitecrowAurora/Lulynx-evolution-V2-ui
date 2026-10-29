// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useRef, useState } from 'react'
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { useDraftRequestScope } from './useDraftRequestScope'
import './trainingVisualization.css'

interface Curve {
  status: string
  x?: number[]
  curves?: Record<string, number[]>
  warnings?: string[]
  axis?: string
}

interface Visualization {
  status: string
  warnings?: string[]
  learning_rate?: Curve
  sampling_prior?: Curve
  sigma?: Curve
  adapter_targets?: { status: string; patterns?: string[]; warnings?: string[] }
}

function CurvePlot({ title, data, axis }: { title: string; data?: Curve; axis: string }) {
  if (!data) return null
  const x = data.x || []
  const curves = Object.entries(data.curves || {})
  const values = curves.flatMap(([, series]) => series)
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(...values, minimum + Number.EPSILON)
  const span = Math.max((x.at(-1) ?? 1) - (x[0] ?? 0), Number.EPSILON)
  const px = (value: number) => 12 + (value - (x[0] ?? 0)) / span * 456
  const py = (value: number) => 138 - (value - minimum) / (maximum - minimum) * 124
  return (
    <section>
      <strong>{title}</strong>
      {curves.length > 0 && x.length > 0 ? <>
        <svg viewBox="0 0 480 160" role="img" aria-label={`${title}，横轴 ${axis}`}>
          <path d="M12 14 V138 H468" fill="none" stroke="currentColor" opacity=".3" />
          {curves.map(([name, series], index) => (
            <g key={name} style={{ color: ['#42c5ad', '#e9ae56', '#b39df3'][index % 3] }}>
              <polyline fill="none" stroke="currentColor" strokeWidth="1.5"
                points={series.map((value, i) => `${px(x[i])},${py(value)}`).join(' ')} />
              {series.map((value, i) => <circle key={i} cx={px(x[i])} cy={py(value)} r={x.length === 1 ? 3 : 1} fill="currentColor">
                <title>{`${name}: ${axis}=${x[i]}, 值=${value}`}</title>
              </circle>)}
            </g>
          ))}
          <text x="12" y="156" fill="currentColor" fontSize="10">{x[0]}</text>
          <text x="468" y="156" fill="currentColor" fontSize="10" textAnchor="end">{x.at(-1)}</text>
        </svg>
        <div>{axis} · {minimum.toPrecision(4)} → {maximum.toPrecision(4)}</div>
        <details><summary>查看曲线数值</summary>
          <div className="lx-training-visualization-table"><table>
            <thead><tr><th>{axis}</th>{curves.map(([name]) => <th key={name}>{name}</th>)}</tr></thead>
            <tbody>{x.map((value, index) => <tr key={index}><td>{value}</td>
              {curves.map(([name, series]) => <td key={name}>{series[index]?.toPrecision(7)}</td>)}
            </tr>)}</tbody>
          </table></div>
        </details>
      </> : <p>暂无可静态绘制的曲线。</p>}
      {(data.warnings || []).map((warning, index) => <p key={index}>{warning}</p>)}
    </section>
  )
}

export function TrainingVisualization({ config, schemaId }: { config: Record<string, unknown>; schemaId: string }) {
  const [result, setResult] = useState<Visualization | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const captureScope = useDraftRequestScope(config)
  useEffect(() => {
    generation.current += 1
    setResult(null)
    setLoading(false)
    setError('')
    return () => { generation.current += 1 }
  }, [config, schemaId])

  const refresh = async () => {
    const requestId = ++generation.current
    const isCurrent = captureScope()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = unwrap(await trainApi.trainingVisualization(schemaId, config)) as { training_visualization?: Visualization }
      if (isCurrent() && generation.current === requestId) {
        if (!response.training_visualization) throw new Error('后端尚未提供训练可视化结果。')
        setResult(response.training_visualization)
      }
    } catch (exception) {
      if (isCurrent() && generation.current === requestId) setError((exception as Error).message)
    } finally {
      if (isCurrent() && generation.current === requestId) setLoading(false)
    }
  }
  return <div className="lx-training-visualization">
    <button type="button" onClick={() => void refresh()} disabled={loading}>
      {loading ? '正在解析…' : '解析训练曲线'}
    </button>
    {error ? <p role="alert">{error}</p> : null}
    {(result?.warnings || []).map((warning, index) => <p key={index}>{warning}</p>)}
    <CurvePlot title="学习率" data={result?.learning_rate} axis="更新步（从 0 开始）" />
    <CurvePlot title="时间步采样先验" data={result?.sampling_prior} axis={result?.sampling_prior?.axis || 'timestep / 1000'} />
    <CurvePlot title="Sigma 基础采样分布" data={result?.sigma} axis="sigma" />
    {result?.adapter_targets ? <section>
      <strong>Adapter 目标声明</strong>
      <div className="lx-training-visualization-targets">
        {(result.adapter_targets.patterns || []).map((pattern) => <code key={pattern}>{pattern}</code>)}
      </div>
      {(result.adapter_targets.warnings || []).map((warning, index) => <p key={index}>{warning}</p>)}
    </section> : null}
  </div>
}
