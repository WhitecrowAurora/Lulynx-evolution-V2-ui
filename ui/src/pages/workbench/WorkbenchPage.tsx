// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageHead, Panel } from '@/components/layout'
import { Badge, Button, Empty } from '@/components/primitives'
import { workbenchApi, type WorkbenchArtifact, type WorkbenchDetail } from '@/api/workbenchApi'
import { formatApiMessage } from '@/api/transport'
import { ProfilerComparison } from './ProfilerComparison'
import { RoyaleComparison } from './RoyaleComparison'
import { RawData, useWorkbenchText } from './WorkbenchData'
import './workbench.css'

export default function WorkbenchPage() {
  const text = useWorkbenchText()
  const [items, setItems] = useState<WorkbenchArtifact[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<WorkbenchDetail | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const visible = useMemo(() => items.filter((item) => (!kind || item.type === kind) &&
    `${item.title} ${item.model ?? ''} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase())), [items, kind, query])
  const activeId = visible.some((item) => item.id === selectedId) ? selectedId : visible[0]?.id ?? ''
  const statusLabel = (item: WorkbenchArtifact) => item.type === 'profiler'
    ? item.status === 'pass' ? text('测量成功', 'Measurement succeeded') : `${text('测量状态', 'Measurement status')}: ${item.status}`
    : `${text('产物状态', 'Artifact status')}: ${item.status}`

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    workbenchApi.list().then((result) => {
      if (!active) return
      const next = result.items ?? []
      setItems(next)
      setSelectedId((id) => next.some((item) => item.id === id) ? id : next[0]?.id ?? '')
    }).catch((cause: unknown) => {
      if (active) { setError(formatApiMessage(cause instanceof Error ? cause.message : cause)); setItems([]); setSelectedId('') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])

  useEffect(() => {
    let active = true
    setDetail(null); setDetailError('')
    if (!activeId) { setDetailLoading(false); return }
    setDetailLoading(true)
    workbenchApi.detail(activeId).then((result) => { if (active) setDetail(result) })
      .catch((cause: unknown) => { if (active) setDetailError(formatApiMessage(cause instanceof Error ? cause.message : cause)) })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [activeId, refresh])

  return <div className="lx-workbench-page">
    <PageHead idx="06" tag="SIGNAL CURATION / POST-PROCESSING" lines={[{ text: text('信号策展与后处理工作台', 'Signal curation workbench') }]}
      sub={text('查看产物，比较 Royale 结果与 Profiler 响应。', 'View artifacts, compare Royale results and Profiler responses.')} />
    <div className="lx-workbench-layout">
      <aside className="lx-workbench-catalog">
        <Panel title={text('已有产物', 'Saved artifacts')} count={items.length} right={<Button size="sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)} aria-label={text('刷新产物', 'Refresh artifacts')}><RefreshCw size={14} />{text('刷新', 'Refresh')}</Button>}>
          <div className="lx-workbench-body">
            <label className="lx-workbench-field">{text('搜索任务 / 产物', 'Search tasks / artifacts')}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('名称、模型或任务 ID', 'Name, model or task ID')} /></label>
            <label className="lx-workbench-field">{text('产物类型', 'Artifact type')}<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">{text('全部类型', 'All types')}</option><option value="royale">Royale</option><option value="profiler">Profiler</option></select></label>
          </div>
          {loading ? <div role="status"><Empty title={text('正在加载产物…', 'Loading artifacts…')} /></div> : error ? <div role="alert"><Empty title={text('产物列表加载失败', 'Could not load artifacts')} desc={error}><Button onClick={() => setRefresh((value) => value + 1)}>{text('重试', 'Retry')}</Button></Empty></div> : !visible.length ? <Empty title={text(items.length ? '没有匹配产物' : '暂无可用产物', items.length ? 'No matching artifacts' : 'No artifacts available')} desc={text(items.length ? '调整搜索内容或类型筛选。' : '已有任务保存对比或分析产物后，可在这里刷新查看。', items.length ? 'Adjust the search or type filter.' : 'Refresh after an existing task saves comparison or analysis artifacts.')} /> : <ul className="lx-workbench-artifacts">
            {visible.map((item) => <li key={item.id}><button type="button" aria-pressed={activeId === item.id} className={activeId === item.id ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}>
              <span className="lx-workbench-artifact-type">{item.type === 'royale' ? 'ROYALE' : 'PROFILER'}<Badge>{statusLabel(item)}</Badge></span>
              <strong>{item.title}</strong><span>{item.model || item.id}</span>
              {item.updated_at && <time dateTime={item.updated_at}>{item.updated_at.replace('T', ' ').replace(/\.\d+/, '')}</time>}
            </button></li>)}
          </ul>}
        </Panel>
      </aside>
      <main className="lx-workbench-detail" aria-busy={detailLoading}>
        {detailLoading ? <div role="status"><Empty title={text('正在加载产物详情…', 'Loading artifact details…')} /></div> : detailError ? <div role="alert"><Empty title={text('产物详情加载失败', 'Could not load artifact')} desc={detailError}><Button onClick={() => setRefresh((value) => value + 1)}>{text('重试', 'Retry')}</Button></Empty></div> : detail && detail.id === activeId ? <>
          <header className="lx-workbench-detail-head"><div><span>{detail.type.toUpperCase()}</span><h2>{detail.title}</h2></div><Badge>{statusLabel(detail)}</Badge></header>
          {!!detail.errors?.length && <div className="lx-workbench-notice" role="alert">{formatApiMessage(detail.errors)}</div>}
          {detail.royale && <RoyaleComparison key={`${detail.id}:royale`} data={detail.royale} />}
          {detail.profiler && <ProfilerComparison key={`${detail.id}:profiler`} data={detail.profiler} />}
          {!detail.royale && !detail.profiler && <Empty title={text('产物暂无可比较数据', 'No comparison data in this artifact')} />}
          <RawData title={text('查看完整任务产物记录', 'View complete task artifact record')} value={detail} />
        </> : <Empty title={text('选择产物开始查看', 'Select an artifact')} desc={text('从左侧选择已有 Royale 或 Profiler 产物。', 'Choose a saved Royale or Profiler artifact from the list.')} />}
      </main>
    </div>
  </div>
}
