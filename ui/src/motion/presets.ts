// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { gsap } from 'gsap'
import type { ThemeId } from '@/stores/themeStore'

/** 把 .lx-page-title 的每个 .line 按字符拆成 .ch(幂等),供逐字动效 */
export function splitTitleChars(scope: HTMLElement) {
  scope.querySelectorAll<HTMLElement>('.lx-page-title .line').forEach((line) => {
    if (line.dataset.split) return
    line.dataset.split = '1'
    const txt = line.textContent ?? ''
    line.textContent = ''
    for (const c of txt) {
      const s = document.createElement('span')
      s.className = 'ch'
      s.textContent = c === ' ' ? ' ' : c
      line.appendChild(s)
    }
  })
}

const SCRAM = '!<>-_\\/[]{}=+*^?#01'

/** 字符乱序解码效果(editorial/acid 风味) */
export function scramble(node: HTMLElement | null, dur = 0.7) {
  if (!node) return
  const fin = node.dataset.final ?? (node.dataset.final = node.textContent ?? '')
  const len = fin.length
  if (!len) return
  const t0 = performance.now()
  const frame = (now: number) => {
    const p = Math.min(1, (now - t0) / (dur * 1000))
    let out = ''
    for (let i = 0; i < len; i++) {
      out += i / len < p ? fin[i] : SCRAM[(Math.random() * SCRAM.length) | 0]
    }
    node.textContent = out
    if (p < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/** 页面入场时间线:Stitch 工业风克制淡入,目标从 scope 内查找,缺了就跳过 */
export function buildPageEnter(_theme: ThemeId, scope: HTMLElement): gsap.core.Timeline {
  splitTitleChars(scope)
  const q = (sel: string) => scope.querySelector<HTMLElement>(sel)
  const eyebrow = q('.lx-page-eyebrow')
  const title = q('.lx-page-title')
  const sub = q('.lx-page-sub')
  const panels = Array.from(scope.querySelectorAll<HTMLElement>('.lx-panel')).slice(0, 10)
  const tl = gsap.timeline()

  const heads = [eyebrow, title, sub].filter(Boolean) as HTMLElement[]
  if (heads.length)
    tl.from(heads, { autoAlpha: 0, y: 10, duration: 0.34, stagger: 0.05, ease: 'power2.out' })
  if (panels.length)
    tl.from(panels, { autoAlpha: 0, y: 12, duration: 0.34, stagger: 0.045, ease: 'power2.out' }, '-=.18')

  const tag = q('.lx-page-eyebrow [data-scramble]')
  if (tag) tl.call(() => scramble(tag), undefined, 0.15)
  return tl
}
