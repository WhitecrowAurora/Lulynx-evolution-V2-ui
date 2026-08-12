// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { create } from 'zustand'

export type ThemeId = 'stitch-light' | 'stitch-dark'
export type MotionMode = 'auto' | 'full' | 'eco'

export const THEME_META: Record<ThemeId, { label: string; zh: string }> = {
  'stitch-light': { label: 'L', zh: '浅色' },
  'stitch-dark': { label: 'D', zh: '深色' },
}

const THEME_KEY = 'lx-stitch-theme'
const MOTION_KEY = 'lx-stitch-motion'
const THEMES: ThemeId[] = ['stitch-light', 'stitch-dark']
const MODES: MotionMode[] = ['auto', 'full', 'eco']

function readLS(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: ThemeId
  motionMode: MotionMode
  /** 由 taskStore 根据是否有 RUNNING 任务驱动;auto 档据此降档 */
  trainingActive: boolean
  setTheme(theme: ThemeId): void
  setMotionMode(mode: MotionMode): void
  setTrainingActive(active: boolean): void
}

function applyToDom(theme: ThemeId, mode: MotionMode, trainingActive: boolean) {
  const el = document.documentElement
  el.dataset.theme = theme
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const eco = reduced || mode === 'eco' || (mode === 'auto' && trainingActive)
  el.dataset.motion = eco ? 'eco' : 'full'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (THEMES as string[]).includes(readLS(THEME_KEY, 'stitch-dark'))
    ? (readLS(THEME_KEY, 'stitch-dark') as ThemeId)
    : 'stitch-dark',
  motionMode: (MODES as string[]).includes(readLS(MOTION_KEY, 'auto'))
    ? (readLS(MOTION_KEY, 'auto') as MotionMode)
    : 'auto',
  trainingActive: false,
  setTheme(theme) {
    writeLS(THEME_KEY, theme)
    set({ theme })
    applyToDom(theme, get().motionMode, get().trainingActive)
  },
  setMotionMode(motionMode) {
    writeLS(MOTION_KEY, motionMode)
    set({ motionMode })
    applyToDom(get().theme, motionMode, get().trainingActive)
  },
  setTrainingActive(trainingActive) {
    if (trainingActive === get().trainingActive) return
    set({ trainingActive })
    applyToDom(get().theme, get().motionMode, trainingActive)
  },
}))

/** React 挂载前同步应用,避免主题闪烁 */
export function initTheme() {
  const s = useThemeStore.getState()
  applyToDom(s.theme, s.motionMode, s.trainingActive)
}

/** 当前是否处于 eco 降档(供 JS 驱动的循环动效判断) */
export function isEcoMotion(): boolean {
  return document.documentElement.dataset.motion === 'eco'
}
