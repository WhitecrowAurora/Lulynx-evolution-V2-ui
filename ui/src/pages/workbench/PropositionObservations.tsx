// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { Panel } from '@/components/layout'
import { Badge } from '@/components/primitives'
import type { ModelAssistedSemantics } from '@/api/workbenchApi'
import { RawData, useWorkbenchText } from './WorkbenchData'

const label = (value: unknown) => typeof value === 'string' ? value : '—'
const answer = (value: unknown) => ['SAME', 'DIFFERENT', 'UNKNOWN'].includes(label(value)) ? label(value) : '—'

export function PropositionObservations({ data, fixture, blockIndex, baselineSha256, imageSha256 }: {
  data?: ModelAssistedSemantics; fixture: string; blockIndex?: number | null
  baselineSha256?: string; imageSha256?: string
}) {
  const text = useWorkbenchText()
  const calibrations = data?.calibration_refs ?? []
  const observations = (data?.proposition_observations ?? []).filter((row) =>
    blockIndex != null && row.fixture === fixture && row.block_index === blockIndex
    && baselineSha256 && imageSha256 && row.baseline_sha256 === baselineSha256 && row.image_sha256 === imageSha256)
  if (!calibrations.length && !observations.length && !data?.proposition_errors?.length) return null
  const comparisons = {
    reference_to_baseline: text('参考图 ↔ 基线', 'Reference ↔ baseline'),
    reference_to_candidate: text('参考图 ↔ 当前图', 'Reference ↔ candidate'),
    baseline_to_candidate: text('基线 ↔ 当前图', 'Baseline ↔ candidate'),
  }
  const reasons: Record<string, string> = {
    order_sensitive: text('顺序影响判断', 'Answer depends on image order'),
    reverse_not_measured: text('未测反向', 'Reverse direction not measured'),
    observer_abstained: text('模型拒答', 'Observer abstained'),
  }
  return <Panel title={text('固定身份命题与校准', 'Fixed identity proposition and calibration')} en="CHARACTER IDENTITY">
    <div className="lx-workbench-body">
      <p><strong>{text('两张图是否描绘同一虚构角色？', 'Do the two pictures depict the same fictional character?')}</strong></p>
      <p className="lx-workbench-note">{text('校准仅覆盖下方列出的角色，准确率不代表本图可信度。', 'Calibration covers only the characters listed below; its accuracy does not represent confidence for this image.')}</p>
      {calibrations.map((row, index) => <section key={index}>
        <h3>{label(row.judge)} <Badge tone="warn">{row.status === 'measured' ? text('有限范围测量', 'Limited-scope measurement') : text('校准未确认', 'Calibration inconclusive')}</Badge></h3>
        {row.status === 'measured' && row.counts && row.ab_ba ? <>
          <p>{text('确认集核心方向题', 'Confirmation core directional tasks')}: <strong>{row.counts.correct}/{row.counts.total}</strong>
            {' · '}{text('拒答 UNKNOWN', 'Abstained UNKNOWN')}: {row.counts.unknown}/{row.counts.total}
            {' · '}{text('格式错误', 'Schema errors')}: {row.counts.schema_error}/{row.counts.total}</p>
          <p>{text('AB/BA 一致', 'AB/BA consistent')}: {row.ab_ba.consistent_pairs}/{row.ab_ba.joint_answered_pairs}
            {' · '}{text('双向均回答', 'Both directions answered')}: {row.ab_ba.joint_answered_pairs}/{row.ab_ba.total_pairs}</p>
          <p className="lx-workbench-note">{row.character_count} {text('角色', 'characters')} ({Array.isArray(row.domain?.characters) ? row.domain.characters.join(', ') : '—'})
            {' · '}{row.source_image_count} {text('张源图（AB/BA 共享图片不计为独立样本）。', 'source images (AB/BA pairs sharing images do not count as independent samples).')}</p>
        </> : <p>{text('校准信息不完整，暂不可用。', 'Calibration data is incomplete and unavailable.')}</p>}
        <RawData title={text('查看校准来源与完整计数', 'View calibration provenance and full counts')} value={row} />
      </section>)}
      {!!observations.length && <>
        <h3>{fixture} · Block {blockIndex}</h3>
        <div className="lx-workbench-table-wrap"><table className="lx-workbench-table">
          <thead><tr><th>{text('观察器 / 图片对', 'Observer / pair')}</th><th>AB</th><th>BA</th><th>{text('状态', 'Status')}</th></tr></thead>
          <tbody>{observations.map((row, index) => <tr key={index}>
            <th scope="row">{label(row.judge)}<small>{row.comparison ? comparisons[row.comparison] : '—'}</small>
              {row.comparison?.startsWith('reference_') && typeof row.reference_sha256 === 'string'
                && <small title={row.reference_sha256}>{text('参考图', 'Reference')} <code>{row.reference_sha256.slice(0, 8)}</code></small>}</th>
            <td><code>{answer(row.answer)}</code></td><td><code>{answer(row.reverse_answer)}</code></td>
            <td>{row.status === 'model_observation' ? text('模型观察', 'Model observation') : text('无法确定', 'Inconclusive')}
              {row.reasons?.filter((reason) => reasons[reason]).map((reason) => <small key={reason}> · {reasons[reason]}</small>)}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="lx-workbench-note">{text('结果仅为观察记录，不代表审核通过。', 'Results are observations only, not an approval decision.')}</p>
        <RawData title={text('查看命题回答与绑定证据', 'View proposition answers and bindings')} value={observations} />
      </>}
      {!observations.length && <p className="lx-workbench-note">{text('当前 block 没有已绑定的固定身份命题回答。', 'No fixed identity proposition answers are bound to this block.')}</p>}
      {!!data?.proposition_errors?.length && <RawData title={text('查看命题数据错误', 'View proposition data errors')} value={data.proposition_errors} />}
    </div>
  </Panel>
}
