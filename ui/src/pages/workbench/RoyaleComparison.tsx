// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useState } from 'react'
import { Panel } from '@/components/layout'
import { Badge, Empty } from '@/components/primitives'
import type { RoyaleComparison as RoyaleData, RoyaleEpoch } from '@/api/workbenchApi'
import { ArtifactImage, metric, RawData, useWorkbenchText } from './WorkbenchData'

function EpochScores({ epoch }: { epoch: RoyaleEpoch }) {
  const text = useWorkbenchText()
  return <dl className="lx-workbench-metrics">
    <div><dt>{text('相似度评分', 'Likeness score')}</dt><dd>{metric(epoch.likeness_score)}</dd></div>
    <div><dt>{text('风格评分', 'Style score')}</dt><dd>{metric(epoch.style_score)}</dd></div>
  </dl>
}

export function RoyaleComparison({ data }: { data: RoyaleData }) {
  const text = useWorkbenchText()
  const epochs = data.epochs ?? []
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(Math.max(0, epochs.length - 1))
  const hasMissingScores = epochs.some((epoch) => !Number.isFinite(epoch.likeness_score) || !Number.isFinite(epoch.style_score))
  const hasRecommendation = data.best_epoch != null || epochs.some((epoch) => epoch.best_epoch)
  const epochLabel = (epoch: RoyaleEpoch) => `Epoch ${epoch.epoch}${epoch.step != null ? ` · Step ${epoch.step}` : ''}`
  return <div className="lx-workbench-stack">
    <div className="lx-workbench-notice" role="note">
      <Badge tone="warn">{text('比较依据', 'Comparison evidence')}</Badge>
      <div>
        <strong>{text('比较状态', 'Comparison status')}: <code>{data.comparison_status ?? text('未记录', 'Not recorded')}</code></strong>
        <p>{text('种子依据', 'Seed basis')}: <code>{data.seed_basis ?? text('未记录', 'Not recorded')}</code> · {text('配置 seed', 'Configured seed')}: {data.seed ?? '—'} · {text('实际 seed', 'Effective seed')}: {data.effective_seed ?? text('未记录', 'Not recorded')}</p>
        <p>{text('相同配置 seed 不保证各次生成结果一致。', 'The same configured seed does not guarantee identical results across renders.')}</p>
        <p>{text('评分状态', 'Score status')}: <code>{data.score_status ?? text('未记录', 'Not recorded')}</code>{hasMissingScores ? text(' · 缺失评分不参与推荐计算。', ' · Missing scores are excluded from recommendations.') : ''}</p>
        {data.metric && <p>{text('评分方法', 'Scoring method')}: {data.metric}</p>}
        {data.weights && <p>{text('推荐权重', 'Recommendation weights')}: {Object.entries(data.weights).map(([axis, weight]) => `${axis}: ${weight}`).join(' · ')}</p>}
        {data.epoch_semantics && <p>{text('Epoch 记录口径', 'Epoch convention')}: {data.epoch_semantics}</p>}
        {!hasRecommendation && <p>{text('最佳 epoch 未确定；当前没有产物推荐。', 'Best epoch is undetermined; no artifact recommendation is available.')}</p>}
        {!!data.limitations?.length && <p>{text('已记录限制', 'Recorded limitations')}: {data.limitations.join(' · ')}</p>}
      </div>
    </div>
    {!epochs.length ? <Empty title={text('暂无 epoch 对比', 'No epoch comparisons')} desc={text('此产物尚未保存 epoch 图像与评分。', 'This artifact has no saved epoch images or scores.')} /> :
    <Panel title={text('Epoch 图像对比', 'Epoch image comparison')} en="ROYALE" count={`${epochs.length} epochs`}>
      <div className="lx-workbench-body">
        <p className="lx-workbench-note">{text('评分按产物原值展示；缺失评分显示为 —。推荐 epoch 来自产物记录。', 'Scores are shown as recorded; missing scores display —. Recommended epochs come from the artifact.')}</p>
        <div className="lx-workbench-pair">
          {[{ index: left, set: setLeft, label: text('左侧 epoch', 'Left epoch') }, { index: right, set: setRight, label: text('右侧 epoch', 'Right epoch') }].map((side) => {
            const epoch = epochs[side.index] ?? epochs[0]
            return <div key={side.label}>
              <label className="lx-workbench-field">{side.label}<select value={side.index} onChange={(event) => side.set(Number(event.target.value))}>
                {epochs.map((item, index) => <option key={index} value={index}>{epochLabel(item)}</option>)}
              </select></label>
              <ArtifactImage url={epoch.image_url} label={epochLabel(epoch)} />
              <EpochScores epoch={epoch} />
            </div>
          })}
        </div>
        <div className="lx-workbench-table-wrap"><table className="lx-workbench-table">
          <thead><tr><th>Epoch / Step</th><th>{text('相似度评分', 'Likeness score')}</th><th>{text('风格评分', 'Style score')}</th><th>{text('产物推荐', 'Artifact recommendation')}</th></tr></thead>
          <tbody>{epochs.map((epoch, index) => <tr key={index}>
            <th scope="row"><button type="button" className="lx-workbench-link" onClick={() => setRight(index)}>{epochLabel(epoch)}</button></th>
            <td>{metric(epoch.likeness_score)}</td><td>{metric(epoch.style_score)}</td>
            <td>{epoch.best_epoch || data.best_epoch === epoch.epoch ? <Badge tone="accent">{text('推荐', 'Recommended')}</Badge> : '—'}</td>
          </tr>)}</tbody>
        </table></div>
        {data.prompt && <p className="lx-workbench-note">Prompt: {data.prompt}</p>}
      </div>
    </Panel>}
    <RawData title={text('查看 Royale 原始产物', 'View original Royale artifact')} value={data} />
  </div>
}
