// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { buildRunOutcomeNotices } from '@/lib/runOutcomeNotices'

export function RunOutcomeNotices({ run }: { run: unknown }) {
  const notices = buildRunOutcomeNotices(run)
  if (!notices.length) return null
  return (
    <div style={{ flexBasis: '100%', display: 'grid', gap: 8 }}>
      {notices.map((notice) => (
        <div key={notice.title} role={notice.kind === 'info' ? 'status' : 'alert'}
          style={{ color: notice.kind === 'error' ? 'var(--lx-danger)' : notice.kind === 'warning' ? 'var(--lx-warn)' : 'var(--lx-dim)', fontSize: 12.5 }}>
          <b>{notice.title}</b>
          {notice.messages.map((message) => <p key={message} style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>{message}</p>)}
        </div>
      ))}
    </div>
  )
}
