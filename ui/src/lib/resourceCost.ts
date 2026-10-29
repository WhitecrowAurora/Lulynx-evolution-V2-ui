// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
export interface ByteBand { lower_bytes: number; upper_bytes: number }
export interface ResidencyCandidate {
  id: string
  effective_config: Record<string, unknown>
  config_changes: Record<string, unknown>
  memory: { cache_target_weight_bytes?: ByteBand; prefetch_payload_reference_bytes?: ByteBand }
  transfer: { one_cold_forward_weight_h2d_bytes?: ByteBand }
}
export interface ResourceCost {
  status?: string
  candidates?: ResidencyCandidate[]
  parameter_profile?: { basis?: string }
}
export const RESIDENCY_KEYS = ['krea2_block_offload_gpu_slots', 'krea2_block_offload_prefetch_depth'] as const

export function residencyEdits(candidate: ResidencyCandidate): Record<string, unknown> {
  return Object.fromEntries(RESIDENCY_KEYS.filter((key) => key in candidate.config_changes)
    .map((key) => [key, candidate.config_changes[key]]))
}
export function bytesLabel(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(3)} GiB` : '—'
}
export function bandLabel(band?: ByteBand): string {
  if (!band) return '—'
  return band.lower_bytes === band.upper_bytes ? bytesLabel(band.lower_bytes)
    : `${bytesLabel(band.lower_bytes)} – ${bytesLabel(band.upper_bytes)}`
}
