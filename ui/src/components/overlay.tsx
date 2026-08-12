// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useToastStore } from '@/stores/toastStore'

/* 覆盖层:模态 / Toast 宿主 */

export function Modal({
  open,
  title,
  onClose,
  children,
  width,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="lx-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="lx-modal" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal>
        <div className="lx-modal-head">
          <span className="lx-modal-title">{title}</span>
          <button type="button" className="lx-btn sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="lx-modal-body">{children}</div>
      </div>
    </div>
  )
}

const KIND_TITLE: Record<string, string> = { info: 'INFO', ok: 'OK', warn: 'WARN', err: 'ERROR' }

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (!toasts.length) return null
  return (
    <div className="lx-toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`lx-toast ${t.kind}`} onClick={() => dismiss(t.id)} role="status">
          <b>{t.title ?? KIND_TITLE[t.kind]}</b>
          {t.message}
        </div>
      ))}
    </div>
  )
}
