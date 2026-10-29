// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { Panel } from '@/components/layout'
import { Badge, Empty } from '@/components/primitives'
import type { ModelAssistedSemantics, SemanticAxis } from '@/api/workbenchApi'
import { metric, RawData, useWorkbenchText } from './WorkbenchData'

const axes: SemanticAxis[] = ['identity', 'style', 'detail']

export function ModelSemanticJudgments({ data, fixture, blockIndex }: {
  data?: ModelAssistedSemantics; fixture: string; blockIndex?: number | null
}) {
  const text = useWorkbenchText()
  const rows = (data?.judgments ?? []).filter((row) => row.fixture === fixture && row.block_index === blockIndex)
  const labels = { identity: text('身份变化', 'Identity change'), style: text('风格变化', 'Style change'), detail: text('细节变化', 'Detail change') }
  const controls = Array.isArray(data?.controls?.judges) ? data.controls.judges : []
  return <Panel title={text('三轴模型评分', 'Three-axis model scores')} en="IDENTITY · STYLE · DETAIL" count={`${rows.length}`}>
    <div className="lx-workbench-body">
      <p className="lx-workbench-note">{text('按 identity/style/detail 展示变化幅度，分数未经校准。', 'Shows change impact per identity/style/detail axis; scores are uncalibrated.')}</p>
      {!!data?.errors?.length && <div className="lx-workbench-notice" role="status">{data.errors.join(' · ')}</div>}
      {!rows.length ? <Empty title={text('此 block 暂无三轴评分', 'No three-axis scores for this block')} desc={text('请选择其他 block 或刷新。', 'Select another block or refresh.')} /> : rows.map((row) => {
        const control = controls.find((item) => item?.judge === row.judge && item.judge_version === row.judge_version)
        const sensitivity = control?.known_operation_response?.status
        return <section className="lx-workbench-model-observation" key={`${row.pair_id}/${row.judge}`}>
          <h3>{row.judge} <Badge tone="warn">{text('模型观察 · 未校准', 'Model observation · uncalibrated')}</Badge></h3>
          <p className="lx-workbench-note">{text('来源版本', 'Source version')}: <code>{row.judge_version}</code></p>
          <p className="lx-workbench-note">{text('已知操作响应', 'Known-operation response')}: {sensitivity === 'response_observed'
            ? text('观察到变化响应；尚未验证语义准确率', 'Change response observed; semantic accuracy unverified')
            : text('未确认，可能缺少有效响应或控制记录', 'Inconclusive: responses or control records are insufficient')}</p>
          <div className="lx-workbench-semantic-axes">{axes.map((axis) => {
            const score = row.axes[axis]
            const check = control?.axes?.[axis]
            return <section key={axis}>
              <h4>{labels[axis]}</h4>
              <dl className="lx-workbench-metrics">
                <div><dt>{text('变化幅度', 'Change impact')}</dt><dd>{metric(score?.impact)}</dd></div>
                <div><dt>{text('自报把握度', 'Self-reported confidence')}</dt><dd>{metric(score?.confidence)}</dd></div>
              </dl>
              {(score?.status === 'inconclusive' || (score?.confidence != null && score.confidence < 0.7)) && <Badge tone="warn">{text('不确定', 'Uncertain')}</Badge>}
              <p className="lx-workbench-rationale">{score?.rationale || text('模型未提供可用说明。', 'No usable model rationale.')}</p>
              <p className="lx-workbench-note">{text('同图及顺序一致性', 'Identical-image and order consistency')}: {check?.status === 'control_consistent' ? text('一致性符合当前容差', 'Within current consistency tolerances') : text('未确认', 'Inconclusive')}</p>
              {Array.isArray(check?.reasons) && check.reasons.length > 0 && <p className="lx-workbench-note">{check.reasons.join(' · ')}</p>}
            </section>
          })}</div>
          <RawData title={text('查看此判读的图像指纹与原始字段', 'View image fingerprints and raw observation')} value={row} />
        </section>
      })}
      {data && <RawData title={text('查看模型来源、控制实验与限制', 'View model provenance, controls and limitations')} value={{ provenance: data.provenance, controls: data.controls, limitations: data.limitations }} />}
    </div>
  </Panel>
}
