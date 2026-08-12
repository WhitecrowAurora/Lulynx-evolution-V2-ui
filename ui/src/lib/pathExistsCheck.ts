// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { isPlaceholderDefault } from '@/lib/modelPathMatch'
import type { SchemaFieldLike } from '@/lib/modelPathMatch'
import { translate } from '@/i18n/useI18n'

export type PathCheckStatus = 'idle' | 'checking' | 'ok' | 'missing' | 'type_mismatch' | 'error'

export interface PathCheckResult {
  status: PathCheckStatus
  message: string
  exists?: boolean
  pathType?: string
}

const cache = new Map<string, { at: number; result: PathCheckResult }>()
const CACHE_TTL_MS = 15_000

function cacheKey(path: string, expect: string) {
  return `${expect}::${path}`
}

/** 空/占位不检查 */
export function shouldCheckPath(path: string, field?: SchemaFieldLike | null): boolean {
  const text = String(path ?? '').trim()
  if (!text) return false
  if (isPlaceholderDefault(text, field || undefined)) return false
  return true
}

export function statusMessage(status: PathCheckStatus, fieldType?: string): string {
  if (status === 'missing') return translate('path.missing')
  if (status === 'type_mismatch') {
    return fieldType === 'folder' ? translate('path.expect_dir') : translate('path.expect_file')
  }
  if (status === 'error') return translate('path.check_fail')
  if (status === 'checking') return translate('path.checking')
  return ''
}

function toFieldLike(
  field: { type?: string; key?: string; defaultValue?: unknown } | null | undefined,
): SchemaFieldLike | null {
  if (!field) return null
  return {
    key: String(field.key || ''),
    type: field.type,
    defaultValue: field.defaultValue,
  }
}

export async function checkPathStatus(
  path: string,
  field: { type?: string; key?: string; defaultValue?: unknown } | null,
): Promise<PathCheckResult> {
  const text = String(path ?? '').trim()
  const expect = field?.type === 'folder' ? 'dir' : 'file'
  const like = toFieldLike(field)
  if (!shouldCheckPath(text, like)) {
    return { status: 'idle', message: '' }
  }
  const key = cacheKey(text, expect)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result

  try {
    const resp = await trainApi.checkPathExists(text)
    const data = unwrap<{ exists?: boolean; type?: string }>(resp) || {}
    const exists = Boolean(data.exists)
    const pathType = String(data.type || (exists ? 'file' : 'missing'))
    let status: PathCheckStatus = 'ok'
    if (!exists || pathType === 'missing') status = 'missing'
    else if (expect === 'file' && pathType === 'dir') status = 'type_mismatch'
    else if (expect === 'dir' && pathType === 'file') status = 'type_mismatch'
    const result: PathCheckResult = {
      status,
      message: statusMessage(status, field?.type),
      exists,
      pathType,
    }
    cache.set(key, { at: Date.now(), result })
    return result
  } catch {
    return { status: 'error', message: statusMessage('error', field?.type) }
  }
}
