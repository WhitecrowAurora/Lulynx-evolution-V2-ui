import { useEffect, useMemo, useState } from 'react'
import { PageHead, Panel } from '@/components/layout'
import { Badge, Button, Empty } from '@/components/primitives'
import { toast } from '@/stores/toastStore'
import { useRouteStore } from '@/stores/routeStore'
import { useTrainConfigStore } from '@/stores/configStore'
import { trainApi } from '@/api/trainApi'
import { resourceCenterApi, buildSemanticProviderPatch, type AdapterStatus, type ProviderRole, type ResourceCatalogItem } from '@/api/resourceCenterApi'
import './resource-center.css'

const roles: Record<ProviderRole, string> = {
  direct_semantic: '直接语义区域',
  mask_proposal: 'Mask Proposal（仅候选掩码）',
  compound_grounded: '组合式 Grounded',
  unknown: '未知角色',
}
const statuses: Record<AdapterStatus, string> = {
  ready: '适配就绪',
  gated: '需授权',
  'manual-review': '需审核',
  'resource-only': '仅资源',
}
const policies: Record<string, string> = { ready: '可安装', 'manual-review': '确认条款', 'resource-only': '仅资源', gated: '授权访问' }
const fmt = (n: number) => n <= 0 ? '未知' : n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`

export default function ResourceCenterPage() {
  const navigate = useRouteStore((s) => s.navigate)
  const applyValues = useTrainConfigStore((s) => s.applyValues)
  const [items, setItems] = useState<ResourceCatalogItem[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<ProviderRole | ''>('')
  const [status, setStatus] = useState<AdapterStatus | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async (roots: string[] = []) => {
    setLoading(true); setError('')
    try { setItems(await resourceCenterApi.listMerged(roots)) } catch (e) { setError((e as Error).message); setItems([]) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const visible = useMemo(() => items.filter((item) => {
    const haystack = `${item.title} ${item.key} ${item.provider_id} ${item.model_id}`.toLowerCase()
    return (!query || haystack.includes(query.toLowerCase())) && (!role || item.provider_role === role) && (!status || item.adapter_status === status)
  }), [items, query, role, status])
  const select = (item: ResourceCatalogItem) => {
    try { applyValues(buildSemanticProviderPatch(item)); toast.ok('已设置当前语义 provider', 'RESOURCE'); navigate('train') } catch (e) { toast.warn((e as Error).message, 'RESOURCE') }
  }
  const download = async (item: ResourceCatalogItem) => {
    const accept = item.requires_license_acceptance || item.install_policy === 'manual-review' || item.install_policy === 'gated'
    if (accept && !window.confirm(`请确认已阅读并接受「${item.license}」的使用条款，然后继续下载。`)) return
    const hfToken = item.requires_auth ? window.prompt('该资源需要 Hugging Face token；token 仅用于本次请求，不会保存。') || '' : ''
    try { await resourceCenterApi.download(item, { acceptLicense: accept, hfToken }); toast.ok('资源下载完成', 'RESOURCE'); await load() } catch (e) { toast.warn((e as Error).message, 'DOWNLOAD') }
  }
  const pickLocal = async () => {
    try {
      const result = await trainApi.pickFile('folder', 'semantic_segmentation_model_path')
      const path = (result as any)?.data?.path || (result as any)?.path || ''
      if (path) { toast.info('正在扫描本地 SEG/SAM 资源', 'RESOURCE'); await load([path]) }
    } catch (e) { toast.warn((e as Error).message, 'PICKER') }
  }
  return <div className="lx-resource-page">
    <PageHead idx="04" tag="RESOURCE CENTER" lines={[{ text: 'SEG / SAM' }, { text: 'RESOURCES', outline: true }]} sub="只有 ready + direct_semantic 且已安装，才能设为当前 provider；SAM mask proposal 不等同于语义分割适配器。" />
    <Panel title="PROVIDER CATALOG" idx="P9" right={<Button size="sm" onClick={() => void load()}>刷新</Button>}>
      <div className="lx-resource-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索模型 / provider" /><select value={role} onChange={(e) => setRole(e.target.value as ProviderRole | '')}><option value="">全部角色</option>{Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value as AdapterStatus | '')}><option value="">全部适配状态</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Button onClick={() => void pickLocal()}>选择本地模型</Button></div>
      {loading ? <Empty title="加载资源目录…" /> : error ? <Empty title="资源目录不可用" desc={error} /> : !visible.length ? <Empty title="没有匹配资源" desc="目录为空或筛选没有结果。" /> : <div className="lx-resource-grid">{visible.map((item) => <article className="lx-resource-card" key={item.key}><header><div><h3>{item.title}</h3><code>{item.provider_id}</code></div><div className="lx-resource-badges"><Badge tone={item.provider_role === 'direct_semantic' ? 'ok' : 'warn'}>{roles[item.provider_role]}</Badge><Badge tone={item.adapter_status === 'ready' ? 'ok' : item.adapter_status === 'gated' ? 'warn' : 'danger'}>{statuses[item.adapter_status]}</Badge></div></header>{item.provider_role === 'mask_proposal' && <p className="lx-resource-warning">此模型只能提出 mask 候选，不能直接输出面部/身体等语义区域。</p>}{item.provider_role === 'compound_grounded' && <p className="lx-resource-warning">组合式模型需要显式概念映射，不能自动猜测语义区域。</p>}<dl><div><dt>模型</dt><dd>{item.model_id}</dd></div><div><dt>大小</dt><dd>{fmt(item.size_bytes)}</dd></div><div><dt>来源</dt><dd>{item.source_label}</dd></div><div><dt>许可证</dt><dd>{item.license}</dd></div><div><dt>设备</dt><dd>{item.device_requirement}</dd></div><div><dt>支持区域</dt><dd>{item.supported_regions.join('、') || '未声明'}</dd></div><div><dt>安装策略</dt><dd>{policies[item.install_policy] || item.install_policy}</dd></div><div><dt>安装状态</dt><dd>{item.installed ? item.local_path || '已安装' : '未安装'}</dd></div></dl><footer>{item.can_select ? <Button variant="primary" onClick={() => select(item)}>设为当前 provider</Button> : item.can_download ? <Button onClick={() => void download(item)}>{item.install_policy === 'gated' ? '授权并下载' : '下载资源'}</Button> : <Button disabled>{item.installed ? '已安装，待适配' : statuses[item.adapter_status]}</Button>}</footer></article>)}</div>}
    </Panel>
  </div>
}
