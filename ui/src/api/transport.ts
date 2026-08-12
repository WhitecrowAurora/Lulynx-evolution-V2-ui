// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* HTTP 传输层:同源相对路径,信封 {status,data,message} 由调用方拆(与旧 UI 契约一致);
   错误统一格式化并上报 /api/system/webui_error(sendBeacon 优先,30s 去重) */
import { translate } from '@/i18n/useI18n'

const ERROR_ENDPOINT = '/api/system/webui_error'
const MAX_TEXT = 4000
const RECENT_TTL_MS = 30000
const recent = new Map<string, number>()

function compactText(value: unknown, max = MAX_TEXT): string {
  const text = value == null ? '' : String(value)
  return text.length > max ? text.slice(0, max) : text
}

function errorToPayload(error: unknown): Record<string, unknown> {
  if (!error) return {}
  if (error instanceof Error) {
    return {
      name: compactText(error.name, 200),
      message: compactText(error.message),
      stack: compactText(error.stack || ''),
    }
  }
  if (typeof error === 'object') {
    try {
      return JSON.parse(JSON.stringify(error)) as Record<string, unknown>
    } catch {
      return { message: compactText(error) }
    }
  }
  return { message: compactText(error) }
}

export function reportWebuiError(kind: string, error: unknown, context: Record<string, unknown> = {}) {
  const payload = {
    kind: compactText(kind || 'webui_error', 120),
    url: compactText(window.location?.href || '', 1000),
    user_agent: compactText(window.navigator?.userAgent || '', 1000),
    error: errorToPayload(error),
    context,
  }
  const key = `${payload.kind}:${(payload.error as { message?: string })?.message || String(context?.path ?? '')}`
  const now = Date.now()
  for (const [k, ts] of recent.entries()) if (now - ts > RECENT_TTL_MS) recent.delete(k)
  if (now - (recent.get(key) ?? 0) < RECENT_TTL_MS) return
  recent.set(key, now)
  try {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(ERROR_ENDPOINT, blob)) return
    }
    void fetch(ERROR_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    /* 上报失败静默 */
  }
}

export function installGlobalErrorReporter() {
  window.addEventListener('error', (e) => {
    reportWebuiError('window_error', e.error ?? e.message, { source: e.filename, line: e.lineno })
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportWebuiError('unhandled_rejection', e.reason)
  })
}

export function formatApiMessage(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(formatApiMessage).filter(Boolean).join('; ')
  const obj = value as Record<string, unknown>
  for (const key of ['message', 'detail', 'error', 'reason']) {
    const text = formatApiMessage(obj[key])
    if (text) return text
  }
  for (const key of ['errors', 'issues']) {
    const arr = obj[key]
    if (Array.isArray(arr) && arr.length) {
      const text = arr.map(formatApiMessage).filter(Boolean).join('; ')
      if (text) return text
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export class ApiError extends Error {
  status?: number
  payload?: unknown
  constructor(message: string, status?: number, payload?: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

export async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
    const headers: HeadersInit | undefined = isFormData
      ? { ...(options.headers || {}) }
      : options.body
        ? { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> | undefined) }
        : options.headers
    response = await fetch(path, {
      ...options,
      headers,
    })
  } catch {
    const error = new ApiError(translate('api.backend_down'))
    reportWebuiError('api_network_error', error, { path, method: options.method || 'GET' })
    throw error
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    const error = new ApiError(
      response.status === 502 ? translate('api.backend_not_started') : translate('api.invalid_json', { path }),
      response.status,
    )
    reportWebuiError('api_invalid_json', error, { path, status: response.status })
    throw error
  }

  if (!response.ok) {
    const obj = payload as Record<string, unknown> | null
    const error = new ApiError(
      formatApiMessage(obj?.detail ?? obj?.message ?? payload) || translate('api.request_fail', { status: response.status }),
      response.status,
      payload,
    )
    reportWebuiError('api_response_error', error, { path, status: response.status })
    throw error
  }
  return payload as T
}

export function postJson<T = unknown>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(data) })
}

/** 拆信封:{status:'success', data} → data;非信封原样返回 */
export function unwrap<T = unknown>(payload: unknown): T {
  const obj = payload as Record<string, unknown> | null
  if (obj && typeof obj === 'object' && 'status' in obj && 'data' in obj) return obj.data as T
  return payload as T
}
