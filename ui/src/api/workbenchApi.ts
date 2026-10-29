// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { request, unwrap } from './transport'

export interface WorkbenchArtifact {
  id: string
  title: string
  type: 'royale' | 'profiler'
  status: string
  updated_at?: string
  model?: string
  review_status?: string
  source?: string
}

export interface RoyaleEpoch {
  epoch: number
  step?: number | null
  image_url?: string | null
  likeness_score?: number | null
  style_score?: number | null
  best_epoch?: boolean
  [key: string]: unknown
}

export interface RoyaleComparison {
  schema?: string
  metric?: string
  weights?: Record<string, number>
  epoch_semantics?: string
  run_id?: string
  seed?: number | null
  seed_basis?: string
  effective_seed?: number | null
  comparison_status?: string
  score_status?: string
  limitations?: string[]
  prompt?: string
  epochs: RoyaleEpoch[]
  best_epoch?: number | null
  [key: string]: unknown
}

export interface BlockMeasurement {
  fixture?: string
  kind?: string | null
  block_index?: number | null
  operation?: string | null
  image_url?: string | null
  baseline_url?: string | null
  image_sha256?: string
  baseline_sha256?: string
  pixel_metrics?: Record<string, number | boolean | null>
  latent_metrics?: Record<string, number | boolean | null>
  teachers?: Record<string, Record<string, number | null>>
  [key: string]: unknown
}

export interface ProfilerComparison {
  model?: string
  units?: unknown[]
  measurements?: BlockMeasurement[]
  teachers?: Record<string, unknown>[]
  semantic_review?: { status?: string; reason?: string; limits?: string; [key: string]: unknown }
  response_audit?: Record<string, unknown>
  model_assisted_semantics?: ModelAssistedSemantics
  [key: string]: unknown
}

export type SemanticAxis = 'identity' | 'style' | 'detail'

export interface ModelSemanticJudgment {
  pair_id: string
  block_index: number
  fixture: string
  judge: string
  judge_version: string
  axes: Record<SemanticAxis, { status: string; impact?: number | null; confidence?: number | null; rationale?: string }>
  [key: string]: unknown
}

export interface PropositionCalibration {
  id?: string
  judge?: string
  judge_version?: string
  status: 'measured' | 'inconclusive'
  domain?: { characters?: string[]; scope?: string }
  counts?: { total: number; correct: number; answered: number; unknown: number; schema_error: number }
  ab_ba?: { total_pairs: number; joint_answered_pairs: number; consistent_pairs: number }
  source_image_count?: number
  character_count?: number
  split?: string
  errors?: string[]
  [key: string]: unknown
}

export interface PropositionObservation {
  id?: string
  calibration_ref?: string
  fixture?: string
  block_index?: number | null
  image_sha256?: string
  baseline_sha256?: string
  judge?: string
  comparison?: 'reference_to_baseline' | 'reference_to_candidate' | 'baseline_to_candidate'
  answer?: 'SAME' | 'DIFFERENT' | 'UNKNOWN' | null
  reverse_answer?: 'SAME' | 'DIFFERENT' | 'UNKNOWN' | null
  status: 'model_observation' | 'inconclusive'
  errors?: string[]
  reasons?: string[]
  [key: string]: unknown
}

export interface ModelAssistedSemantics {
  status: string
  judgments: ModelSemanticJudgment[]
  controls?: {
    judges?: { judge: string; judge_version?: string; axes?: Partial<Record<SemanticAxis, { status?: string; reasons?: string[] }>>;
      known_operation_response?: { status?: string; checks?: { pair_id: string; operation: string; status: string }[] } }[]
  }
  provenance?: Record<string, unknown>
  limitations?: string[]
  errors?: string[]
  calibration_refs?: PropositionCalibration[]
  proposition_observations?: PropositionObservation[]
  proposition_errors?: string[]
}

export interface WorkbenchDetail extends WorkbenchArtifact {
  royale?: RoyaleComparison | null
  profiler?: ProfilerComparison | null
  errors?: unknown[]
}

export const workbenchApi = {
  async list(): Promise<{ items: WorkbenchArtifact[]; total: number }> {
    return unwrap(await request('/api/workbench/artifacts'))
  },
  async detail(id: string): Promise<WorkbenchDetail> {
    return unwrap(await request(`/api/workbench/artifacts/${encodeURIComponent(id)}`))
  },
}
