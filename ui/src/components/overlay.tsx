// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useToastStore } from '@/stores/toastStore'

/* 覆盖层:模态 / Toast 宿主 */

const modalStack: HTMLElement[] = []
const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0)
}

export function Modal({
  open,
  title,
  onClose,
  children,
  width,
  busy = false,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  width?: number
  busy?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const behavior = useRef({ onClose, busy })
  behavior.current = { onClose, busy }
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current!
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const childIndex = modalStack.findIndex((element) => dialog.contains(element))
    modalStack.splice(childIndex < 0 ? modalStack.length : childIndex, 0, dialog)
    ;(focusableElements(dialog)[0] ?? dialog).focus()
    const isTop = () => modalStack.at(-1) === dialog
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (!behavior.current.busy) behavior.current.onClose()
      } else if (e.key === 'Tab') {
        const elements = focusableElements(dialog)
        const index = elements.indexOf(document.activeElement as HTMLElement)
        if (!elements.length || index < 0 || (e.shiftKey ? index === 0 : index === elements.length - 1)) {
          e.preventDefault()
          ;(elements[e.shiftKey ? elements.length - 1 : 0] ?? dialog).focus()
        }
      }
    }
    const onFocus = (e: FocusEvent) => {
      if (isTop() && !dialog.contains(e.target as Node)) (focusableElements(dialog)[0] ?? dialog).focus()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      const wasTop = isTop()
      modalStack.splice(modalStack.indexOf(dialog), 1)
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      if (wasTop) {
        const top = modalStack.at(-1)
        if (previous?.isConnected && (!top || top.contains(previous))) previous.focus()
        else if (top) (focusableElements(top)[0] ?? top).focus()
      }
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="lx-modal-backdrop"
      onMouseDown={(e) => {
        if (!busy && modalStack.at(-1) === dialogRef.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className="lx-modal" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal aria-labelledby={titleId} aria-busy={busy}>
        <div className="lx-modal-head">
          <span id={titleId} className="lx-modal-title">{title}</span>
          <button type="button" className="lx-btn sm" disabled={busy} onClick={onClose} aria-label="Close">
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
