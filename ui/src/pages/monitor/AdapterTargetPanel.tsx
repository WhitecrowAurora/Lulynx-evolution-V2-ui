// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { Panel } from '@/components/layout'
import type { AdapterTargetInventory } from '@/api/monitorApi'

export function AdapterTargetPanel({ inventory }: { inventory?: AdapterTargetInventory }) {
  if (!inventory || inventory.status !== 'matched') return null
  return (
    <Panel title="已注入的 Adapter" idx="A" panelId="ADAPTER.TARGETS" className="lx-cfg-section">
      <p>
        实际匹配 {inventory.matched_modules ?? 0} 个模块 · 可训练参数 {(inventory.trainable_parameters ?? 0).toLocaleString()}
        {' · '}冻结模块 {inventory.frozen_modules ?? 0}
      </p>
      <p className="dim">
        存储 Rank：{Object.entries(inventory.rank_counts ?? {}).map(([rank, count]) => `${rank} × ${count}`).join('、') || '未提供'}
        {inventory.unknown_rank_modules ? `；${inventory.unknown_rank_modules} 个模块未提供 Rank` : ''}
      </p>
      <table style={{ width: '100%', textAlign: 'left' }}>
        <thead><tr><th>组件</th><th>匹配模块</th><th>可训练参数</th></tr></thead>
        <tbody>
          {Object.entries(inventory.groups ?? {}).map(([name, group]) => (
            <tr key={name}><td>{name}</td><td>{group.matched_modules}</td><td>{group.trainable_parameters.toLocaleString()}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="dim">仅统计 Adapter 中可训练参数；跨组件共享参数在总数中只计一次。存储 Rank 不代表当前生效的掩码或调度 Rank。</p>
    </Panel>
  )
}
