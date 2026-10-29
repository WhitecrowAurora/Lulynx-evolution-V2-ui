// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { bandLabel, bytesLabel, type ByteBand } from '@/lib/resourceCost'

type HostCandidate = {
  id: string; worker_lifetime_peak_bytes?: Record<string, ByteBand>
  pinned_allocator_reported_peak_bytes?: ByteBand; pinned_traced_CUDA_peak_bytes?: ByteBand
}
type HostFit = { candidates?: HostCandidate[] }
type Resource = {
  host_memory?: { process?: { os_lifetime_peak_metrics?: Record<string, number> }; pinned_allocator?: { metrics?: Record<string, number> } }
  cuda_trace?: { pinned_memory?: { status?: string; processes?: { peak_bytes: number }[] }; transfer_dependencies?: { event_edges?: unknown[] } }
}

export function ComparisonHostResources({ runs, predictions, en }: {
  runs: Record<string, unknown>[]; predictions?: HostFit; en: boolean
}) {
  if (!runs.some(run => (run.resource_comparison as Resource | undefined)?.host_memory?.process)) return null
  return <>
    <div className="lx-resource-scroll"><table>
      <thead><tr><th>{en ? 'Run' : '训练'}</th><th>{en ? 'Resident peak' : '驻留内存峰值'}</th><th>{en ? 'Private commit peak' : '私有提交峰值'}</th><th>{en ? 'Pinned allocator approximation' : '锁页 allocator 近似峰值'}</th><th>{en ? 'Traced CUDA pinned peak' : 'CUDA 记录的锁页峰值'}</th><th>{en ? 'Event dependencies' : '事件依赖'}</th></tr></thead>
      <tbody>{runs.map(run => {
        const resource = run.resource_comparison as Resource | undefined
        const peaks = resource?.host_memory?.process?.os_lifetime_peak_metrics ?? {}
        const pinned = resource?.cuda_trace?.pinned_memory
        return <tr key={String(run.run_id)}><td>{String(run.run_id).slice(0, 8)}</td>
          <td>{bytesLabel(peaks.working_set_bytes ?? peaks.resident_set_bytes)}</td><td>{bytesLabel(peaks.private_commit_bytes)}</td>
          <td>{bytesLabel(resource?.host_memory?.pinned_allocator?.metrics?.reported_peak_reserved_bytes)}</td>
          <td>{pinned?.status === 'observed' && pinned.processes?.length === 1 ? bytesLabel(pinned.processes[0].peak_bytes) : '—'}</td>
          <td>{resource?.cuda_trace?.transfer_dependencies?.event_edges?.length ?? '—'}</td></tr>
      })}</tbody>
    </table></div>
    <p>{en ? 'Native worker peaks include loading and prior callbacks. CUDA pinned ranges include external registrations when traced; OS-only locking is separate. Event dependencies do not establish full-step speedup.' : 'worker 原生峰值包含加载和先前回调。CUDA 锁页记录可覆盖外部注册，系统其他锁页另计。事件依赖尚不能推导完整整步加速。'}</p>
    {predictions?.candidates?.length ? <>
      <p>{en ? 'Host estimates interpolate measured slots at the same workload and prefetch depth. Phase intervals and held-out errors are in the evidence details; these are not capacity guarantees.' : '内存估算仅在相同负载、预取深度的实测驻留范围内插值。分阶段区间与留出误差见证据详情，不作为容量保证。'}</p>
      <div className="lx-resource-scroll"><table><thead><tr><th>{en ? 'Candidate' : '候选'}</th><th>{en ? 'Resident peak estimate' : '驻留峰值估算'}</th><th>{en ? 'Commit peak estimate' : '提交峰值估算'}</th><th>{en ? 'Pinned approximation' : '锁页近似估算'}</th></tr></thead>
        <tbody>{predictions.candidates.map(item => <tr key={item.id}><td>{item.id}</td>
          <td>{bandLabel(item.worker_lifetime_peak_bytes?.working_set_bytes ?? item.worker_lifetime_peak_bytes?.resident_set_bytes)}</td>
          <td>{bandLabel(item.worker_lifetime_peak_bytes?.private_commit_bytes)}</td><td>{bandLabel(item.pinned_allocator_reported_peak_bytes)}</td></tr>)}</tbody>
      </table></div>
    </> : null}
  </>
}
