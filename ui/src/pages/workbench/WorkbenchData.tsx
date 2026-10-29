// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'

export function useWorkbenchText() {
  const { language } = useI18n()
  return (zh: string, en: string) => language === 'en' ? en : zh
}

export function metric(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toPrecision(6)).toString()
  if (typeof value === 'boolean') return String(value)
  return '—'
}

export function RawData({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false)
  return <details className="lx-workbench-raw" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>
    {open && <pre>{JSON.stringify(value, null, 2)}</pre>}
  </details>
}

export function ArtifactImage({ url, label }: { url?: string | null; label: string }) {
  const text = useWorkbenchText()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return <figure className="lx-workbench-image">
    <figcaption>{label}</figcaption>
    {url && failedUrl !== url ? <a href={url} target="_blank" rel="noreferrer" title={text('打开原图', 'Open original image')}>
      <img src={url} alt={label} loading="lazy" onError={() => setFailedUrl(url)} />
    </a> : <div className="lx-workbench-image-empty" role="status">
      {url ? text('图像加载失败', 'Image failed to load') : text('此产物未提供图像', 'No image in this artifact')}
    </div>}
  </figure>
}

export function MetricList({ values }: { values?: Record<string, unknown> }) {
  return <dl className="lx-workbench-metrics">
    {Object.entries(values ?? {}).map(([name, value]) => <div key={name}>
      <dt>{name}</dt><dd>{metric(value)}</dd>
    </div>)}
  </dl>
}
