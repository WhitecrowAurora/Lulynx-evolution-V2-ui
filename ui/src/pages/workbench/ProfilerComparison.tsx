// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useMemo, useState } from 'react'
import { Panel } from '@/components/layout'
import { Badge, Empty } from '@/components/primitives'
import type { BlockMeasurement, ProfilerComparison as ProfilerData } from '@/api/workbenchApi'
import { ArtifactImage, metric, MetricList, RawData, useWorkbenchText } from './WorkbenchData'
import { ModelSemanticJudgments } from './ModelSemanticJudgments'
import { PropositionObservations } from './PropositionObservations'

/** Competition ranks preserve ties; distances from different teachers are never combined. */
function distanceRanks(rows: BlockMeasurement[], teacher: string, axis: string) {
  const sorted = rows.filter((row) => typeof row.teachers?.[teacher]?.[axis] === 'number')
    .map((row) => ({ row, value: row.teachers![teacher][axis] as number }))
    .filter(({ value }) => Number.isFinite(value)).sort((a, b) => b.value - a.value)
  let rank = 0
  return new Map(sorted.map(({ row, value }, index) => {
    if (index === 0 || value !== sorted[index - 1].value) rank = index + 1
    return [row, rank]
  }))
}

export function ProfilerComparison({ data }: { data: ProfilerData }) {
  const text = useWorkbenchText()
  const measurements = data.measurements ?? []
  const blockMeasurements = useMemo(() => measurements.filter((row) => row.block_index != null
    && (row.kind == null || row.kind === 'perturbed')), [measurements])
  const fixtures = [...new Set(blockMeasurements.map((row) => row.fixture || 'default'))]
  const [chosenFixture, setFixture] = useState(fixtures[0] ?? '')
  const fixture = fixtures.includes(chosenFixture) ? chosenFixture : fixtures[0] ?? ''
  const rows = useMemo(() => blockMeasurements.filter((row) => (row.fixture || 'default') === fixture), [blockMeasurements, fixture])
  const [chosenRow, setRow] = useState(0)
  const selected = rows[chosenRow] ?? rows[0]
  const teachers = [...new Set(rows.flatMap((row) => Object.keys(row.teachers ?? {})))]
  const [axis, setAxis] = useState('content_distance')
  const ranks = useMemo(() => Object.fromEntries(teachers.map((teacher) => [teacher, distanceRanks(rows, teacher, axis)])), [rows, teachers.join('|'), axis])
  const review = data.semantic_review

  return <div className="lx-workbench-stack">
    <div className="lx-workbench-notice" role="note">
      <Badge tone="warn">{text('语义未确认', 'Semantics unconfirmed')}</Badge>
      <div><strong>{text('原始响应与模型辅助观察', 'Raw responses and model-assisted observations')}</strong>
        <p>{text('pass 仅表示测量完成，非质量验收结果。', 'Pass only means the measurement completed; it is not a quality acceptance result.')}</p>
        {review?.status && <p>{text('产物审核状态', 'Artifact review status')}: <code>{review.status}</code>{review.reason ? ` · ${review.reason}` : ''}</p>}
      </div>
    </div>
    <PropositionObservations data={data.model_assisted_semantics} fixture={fixture} blockIndex={selected?.block_index}
      baselineSha256={selected?.baseline_sha256} imageSha256={selected?.image_sha256} />
    {!rows.length ? <Panel title={text('Block 响应', 'Block responses')}>
      <Empty title={text('没有可展示的逐 block 图像测量', 'No per-block image measurements')} desc={text('可以展开下方原始产物，查看已有 unit 或审核记录。', 'Expand the artifact below to inspect its units and review records.')} />
    </Panel> : <>
      <Panel title={text('Block 原始响应', 'Raw block response')} en="PROFILER" count={`${rows.length} blocks`}>
        <div className="lx-workbench-body">
          <div className="lx-workbench-toolbar">
            <label className="lx-workbench-field">{text('输入样本', 'Input fixture')}<select value={fixture} onChange={(event) => { setFixture(event.target.value); setRow(0) }}>
              {fixtures.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <label className="lx-workbench-field">{text('选择 block', 'Select block')}<select value={rows.indexOf(selected)} onChange={(event) => setRow(Number(event.target.value))}>
              {rows.map((row, index) => <option key={index} value={index}>Block {row.block_index}{row.operation ? ` · ${row.operation}` : ''}{data.model_assisted_semantics?.judgments.some((item) => item.fixture === fixture && item.block_index === row.block_index) ? text(' · 有模型判读', ' · model observation') : ''}</option>)}
            </select></label>
          </div>
          <div className="lx-workbench-pair">
            <ArtifactImage url={selected.baseline_url} label={text(`${fixture} · 基线`, `${fixture} · Baseline`)} />
            <ArtifactImage url={selected.image_url} label={`${fixture} · Block ${selected.block_index}`} />
          </div>
          <div className="lx-workbench-pair">
            <section><h3>{text('像素响应', 'Pixel response')}</h3><MetricList values={selected.pixel_metrics} /></section>
            <section><h3>{text('Latent 响应', 'Latent response')}</h3><MetricList values={selected.latent_metrics} /></section>
          </div>
          <div className="lx-workbench-teachers">{Object.entries(selected.teachers ?? {}).map(([teacher, values]) => <section key={teacher}>
            <h3>{teacher}</h3><MetricList values={values} />
          </section>)}</div>
          <RawData title={text('查看所选 block 原始测量', 'View selected block measurement')} value={selected} />
        </div>
      </Panel>
      <ModelSemanticJudgments data={data.model_assisted_semantics} fixture={fixture} blockIndex={selected.block_index} />
      <Panel title={text('Teacher 排序对照', 'Teacher ranking comparison')} en="DISAGREEMENT">
        <div className="lx-workbench-body">
          <div className="lx-workbench-toolbar">
            <label className="lx-workbench-field">{text('原始距离指标', 'Raw distance metric')}<select value={axis} onChange={(event) => setAxis(event.target.value)}>
              <option value="content_distance">content_distance</option><option value="detail_distance">detail_distance</option>
            </select></label>
          </div>
          <p className="lx-workbench-note">{text('各 teacher 按距离独立排序，数值不跨模型合并。', 'Each teacher is ranked independently by distance; values are not combined across models.')}</p>
          {!teachers.length ? <Empty title={text('没有 teacher 测量', 'No teacher measurements')} /> : <div className="lx-workbench-table-wrap"><table className="lx-workbench-table">
            <thead><tr><th>Block</th>{teachers.map((teacher) => <th key={teacher}>{teacher}<small>{axis} / {text('排序', 'rank')}</small></th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index} className={row === selected ? 'is-selected' : ''}>
              <th scope="row"><button type="button" className="lx-workbench-link" aria-pressed={row === selected} onClick={() => setRow(index)}>Block {row.block_index}</button></th>
              {teachers.map((teacher) => <td key={teacher}>{metric(row.teachers?.[teacher]?.[axis])}<span className="lx-workbench-rank">{ranks[teacher]?.get(row) ? `#${ranks[teacher].get(row)}` : '—'}</span></td>)}
            </tr>)}</tbody>
          </table></div>}
        </div>
      </Panel>
    </>}
    {data.response_audit && <RawData title={text('查看响应审计与跨进程重放记录', 'View response audit and cross-process replays')} value={data.response_audit} />}
    {data.teachers && <RawData title={text('查看 teacher 来源与权重记录', 'View teacher provenance and weights')} value={data.teachers} />}
    <RawData title={text('查看 Profiler 完整原始产物', 'View complete Profiler artifact')} value={data} />
  </div>
}
