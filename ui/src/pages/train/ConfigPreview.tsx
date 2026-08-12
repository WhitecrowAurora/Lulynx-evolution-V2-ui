// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useMemo, useState } from 'react'
import { buildRunConfig } from '@/schema/schemaIndex.js'
import { toast } from '@/stores/toastStore'
import { useI18n } from '@/i18n/useI18n'

/* 实时 config.json 预览:随草稿变化重新 buildRunConfig 并美化输出。
   与提交走同一 buildRunConfig,所以预览即真实 payload,无二次口径。 */

export function ConfigPreview({
  draft,
  typeId,
}: {
  draft: Record<string, unknown>
  typeId: string
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)

  const { text, count, error } = useMemo(() => {
    try {
      const payload = buildRunConfig(draft, typeId) as Record<string, unknown>
      const json = JSON.stringify(payload, null, 2)
      return { text: json, count: Object.keys(payload).length, error: '' }
    } catch (e) {
      return { text: '', count: 0, error: (e as Error).message }
    }
  }, [draft, typeId])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.ok(t('train.config_copied'), 'CONFIG')
    } catch (e) {
      toast.warn((e as Error).message, 'CONFIG')
    }
  }

  return (
    <aside className={['lx-config-preview', collapsed ? 'is-collapsed' : ''].filter(Boolean).join(' ')}>
      <header className="lx-config-preview-head">
        <div className="lx-config-preview-title">
          <span className="lx-config-preview-dot" aria-hidden />
          config.json
          {!error ? <span className="lx-config-preview-count">{count} keys</span> : null}
        </div>
        <div className="lx-config-preview-actions">
          <button type="button" onClick={() => void copy()} disabled={!!error} title={t('train.config_copy_title')}>
            {t('train.config_copy')}
          </button>
          <button type="button" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '+' : '−'}
          </button>
        </div>
      </header>
      {!collapsed ? (
        error ? (
          <div className="lx-config-preview-error">{error}</div>
        ) : (
          <pre className="lx-config-preview-body">{text}</pre>
        )
      ) : null}
    </aside>
  )
}
