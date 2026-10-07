// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* 命名预设 JSON import/export（纯前端，不经训练入口） */
import { translate } from '@/i18n/useI18n'
import { stripModelCodePermission } from '@/lib/modelCodePermission'

export const SAVED_CONFIG_IO_MAX_BYTES = 2 * 1024 * 1024

export interface SavedConfigBundle {
  name: string
  schema_id?: string
  typeId?: string
  config: Record<string, unknown>
  exported_at?: number
  source?: string
}

export function safeFileStem(name: string): string {
  const cleaned = Array.from(String(name || 'preset').trim())
    .map((ch) => {
      const code = ch.charCodeAt(0)
      if (code < 32) return '_'
      if ('<>:"/\\|?*'.includes(ch)) return '_'
      if (/\s/.test(ch)) return '-'
      return ch
    })
    .join('')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return cleaned || 'preset'
}

export function buildExportBundle(opts: {
  name: string
  config: Record<string, unknown>
  schemaId?: string
}): SavedConfigBundle {
  return {
    name: String(opts.name || 'preset').trim() || 'preset',
    schema_id: opts.schemaId || undefined,
    typeId: opts.schemaId || undefined,
    config: stripModelCodePermission({ ...(opts.config || {}) }),
    exported_at: Date.now(),
    source: 'lulynx-webui',
  }
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const text = JSON.stringify(payload, null, 2)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function exportBundleToDownload(bundle: SavedConfigBundle): void {
  downloadJsonFile(`${safeFileStem(bundle.name)}.json`, stripModelCodePermission(bundle))
}

/** 沿用后端/legacy 的扁平保存格式，只附带已有 schema 身份字段。 */
export function savedConfigPayload(bundle: SavedConfigBundle): Record<string, unknown> {
  const schemaId = bundle.schema_id || bundle.typeId
  return { ...stripModelCodePermission(bundle.config), ...(schemaId ? { schema_id: schemaId, typeId: schemaId } : {}) }
}

/** 解析导入 JSON；非法 / 过大 / 非 object → throw Error 消息 */
export function parseSavedConfigImport(text: string, byteLength?: number): SavedConfigBundle {
  if (byteLength != null && byteLength > SAVED_CONFIG_IO_MAX_BYTES) {
    throw new Error(translate('io.file_too_large', { mb: SAVED_CONFIG_IO_MAX_BYTES / 1024 / 1024 }))
  }
  if (text.length > SAVED_CONFIG_IO_MAX_BYTES) {
    throw new Error(translate('io.file_too_large', { mb: SAVED_CONFIG_IO_MAX_BYTES / 1024 / 1024 }))
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(translate('io.invalid_json'))
  }
  return normalizeSavedConfigBundle(raw)
}

/** 文件与命名预设共用解析边界，兼容 flat/config/data 包且不把身份混进草稿。 */
export function normalizeSavedConfigBundle(raw: unknown): SavedConfigBundle {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(translate('io.root_must_object'))
  }
  const root = raw as Record<string, unknown>
  const body = !('config' in root) && root.data && typeof root.data === 'object' && !Array.isArray(root.data)
    ? root.data as Record<string, unknown> : root
  const wrapped = 'config' in body
  const value = wrapped ? body.config : body
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(translate('io.no_usable_config'))
  }
  const fields = value as Record<string, unknown>
  const identityKeys = ['schema_id', 'schemaId', 'typeId', 'type_id']
  const schemaId = String([body, root, fields]
    .flatMap((source) => identityKeys.map((key) => source[key]))
    .find((id) => typeof id === 'string' && id.trim()) || '').trim()
  const skip = new Set(wrapped ? identityKeys : [...identityKeys, 'name', 'exported_at', 'source', 'version'])
  const config = stripModelCodePermission(Object.fromEntries(Object.entries(fields).filter(([key]) => !skip.has(key))))
  if (!Object.keys(config).length) throw new Error(translate('io.no_usable_config'))
  return {
    name: String(body.name ?? root.name ?? body.id ?? body.title ?? 'imported').trim() || 'imported',
    schema_id: schemaId || undefined,
    typeId: schemaId || undefined,
    config,
  }
}

export async function readFileAsSavedBundle(file: File): Promise<SavedConfigBundle> {
  if (file.size > SAVED_CONFIG_IO_MAX_BYTES) {
    throw new Error(translate('io.file_too_large', { mb: SAVED_CONFIG_IO_MAX_BYTES / 1024 / 1024 }))
  }
  const text = await file.text()
  const bundle = parseSavedConfigImport(text, file.size)
  if (!bundle.name || bundle.name === 'imported') {
    const stem = file.name.replace(/\.json$/i, '').trim()
    if (stem) bundle.name = stem
  }
  return bundle
}
