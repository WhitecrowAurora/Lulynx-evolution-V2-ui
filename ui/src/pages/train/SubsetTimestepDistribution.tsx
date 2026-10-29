// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
type Summary = {
  histogram: number[]
  median: number
  low_fraction: number
  mid_fraction: number
  high_fraction: number
}

export type SubsetDistribution = {
  preview_available: boolean
  baseline?: Summary
  current?: Summary
}

export function SubsetTimestepDistribution({ preview, english }: { preview: SubsetDistribution; english: boolean }) {
  const { baseline, current } = preview
  if (!preview.preview_available || !baseline || !current) return null
  const maximum = Math.max(...baseline.histogram, ...current.histogram, 0.01)
  const percent = (v: number) => `${(v * 100).toFixed(1)}%`
  return (
    <div>
      <p className="lx-cfg-desc">{english ? 'Gray: baseline · Blue: with offsets. X: noise level (0–1000); Y: probability per bin.' : '灰色：原分布 · 蓝色：偏移后。横轴为噪声水平（0–1000），纵轴为每个区间的采样概率。'}</p>
      <svg viewBox="0 0 620 180" role="img" aria-label={english ? 'Noise distribution before and after subset offsets' : '子集偏移前后的噪声分布'} style={{ width: '100%', maxHeight: 200 }}>
        {current.histogram.map((v, i) => (
          <g key={i}>
            <rect x={i * 60 + 14} y={145 - baseline.histogram[i] / maximum * 125} width={18} height={baseline.histogram[i] / maximum * 125} fill="#94a3b8" />
            <rect x={i * 60 + 34} y={145 - v / maximum * 125} width={18} height={v / maximum * 125} fill="#38bdf8" />
            <text x={i * 60 + 12} y={168} fill="currentColor" fontSize={11}>{i * 100}</text>
            <title>{i * 100}–{(i + 1) * 100}: {percent(baseline.histogram[i])} → {percent(v)}</title>
          </g>
        ))}
        <text x={590} y={168} fill="currentColor" fontSize={11}>1000</text>
      </svg>
      <p className="lx-cfg-desc">
        {english ? 'Median' : '中位数'} {baseline.median.toFixed(1)} → {current.median.toFixed(1)}
        {' · '}{english ? 'Low noise [0, 300)' : '低噪声 [0, 300)'} {percent(baseline.low_fraction)} → {percent(current.low_fraction)}
        {' · '}{english ? 'High noise [700, 1000]' : '高噪声 [700, 1000]'} {percent(baseline.high_fraction)} → {percent(current.high_fraction)}
      </p>
    </div>
  )
}
