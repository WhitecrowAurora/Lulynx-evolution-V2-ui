// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
export interface ModelCodePermission {
  allow_model_code: boolean
  model_code_sources: string[]
}

export interface ModelCodeSource {
  source: string
  kind: string
  location: string
  requires_confirmation: boolean
}

export const MODEL_CODE_SOURCE_FIELDS = [
  'jtp3_model_path', 'jtp3_extractor_path', 'jtp3_model_id', 'jtp3_fallback_model_id',
  'waifu_model_path', 'waifu_extractor_path', 'waifu_model_id', 'waifu_clip_model_name',
  'waifu_clip_pretrained', 'waifu_v3_head_path', 'wv3_head_path',
  'include_waifu_score', 'extractor_type',
] as const

export const isModelCodePermissionKey = (key: string) =>
  key === 'allow_model_code' || key === 'model_code_sources'

/** Authorization is never part of a preset, checkpoint restore, or persisted draft. */
export function stripModelCodePermission<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripModelCodePermission) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isModelCodePermissionKey(key))
    .map(([key, item]) => [key, stripModelCodePermission(item)])) as T
}

export function modelCodePreviewConfig(config: Record<string, unknown>): Record<string, unknown> {
  // Do not serialize tokens or replace absent values with different backend defaults.
  return Object.fromEntries(MODEL_CODE_SOURCE_FIELDS
    .filter((key) => config[key] !== undefined)
    .map((key) => [key, config[key]]))
}

export function parseModelCodeSources(value: unknown): ModelCodeSource[] {
  if (!Array.isArray(value) || !value.length || !value.every((row) =>
    row && typeof row === 'object' && ['source', 'kind', 'location'].every((key) =>
      typeof row[key] === 'string' && row[key].trim()) && typeof row.requires_confirmation === 'boolean')) {
    return []
  }
  return value.map(({ source, kind, location, requires_confirmation }) =>
    ({ source, kind, location, requires_confirmation }))
}

export interface ModelCodeScope { typeId: string; config: Record<string, unknown> }
const sameScope = (a: ModelCodeScope | null, b: ModelCodeScope) =>
  a?.typeId === b.typeId && a.config === b.config
const denied = (): ModelCodePermission => ({ allow_model_code: false, model_code_sources: [] })

/** Memory-only, one submission. A new draft (including import/restore) revokes consent. */
export class ModelCodeTrustSession {
  private revision = 0
  private scope: ModelCodeScope | null = null
  private offered: ModelCodeSource[] = []
  private approved = false

  reset(): void {
    this.revision += 1
    this.scope = null
    this.offered = []
    this.approved = false
  }

  begin(scope: ModelCodeScope): number {
    this.reset()
    this.scope = scope
    return this.revision
  }

  offer(ticket: number, scope: ModelCodeScope, sources: unknown): boolean {
    if (ticket !== this.revision || !sameScope(this.scope, scope)) return false
    this.offered = parseModelCodeSources(sources)
    return this.offered.length > 0
  }

  pending(scope: ModelCodeScope): ModelCodeSource[] {
    return sameScope(this.scope, scope) && !this.approved ? this.offered : []
  }

  confirm(scope: ModelCodeScope): boolean {
    this.approved = sameScope(this.scope, scope) && this.offered.length > 0
    return this.approved
  }

  enabled(scope: ModelCodeScope): boolean {
    return sameScope(this.scope, scope) && this.approved
  }

  consume(scope: ModelCodeScope): ModelCodePermission {
    const permission = this.enabled(scope)
      ? { allow_model_code: true, model_code_sources: this.offered.map((row) => row.source) }
      : denied()
    this.reset()
    return permission
  }
}
