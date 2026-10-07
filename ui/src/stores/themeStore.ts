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

function fromLauncherTheme(theme: unknown): ThemeId | null {
  if (theme === 'light') return 'stitch-light'
  if (theme === 'dark') return 'stitch-dark'
  return null
}

function trustedParentOrigin(): string | null {
  try {
    const referrer = document.referrer
    if (referrer) {
      const origin = new URL(referrer).origin
      return origin === 'null' ? null : origin
    }
  } catch {
    return null
  }

  // Same-origin embeds have no useful referrer in some hosts. This fallback
  // remains restrictive and never broadens the channel to arbitrary origins.
  return window.location.origin === 'null' ? null : window.location.origin
}

function initialTheme(): ThemeId {
  if (window.parent !== window) {
    const embeddedTheme = fromLauncherTheme(new URLSearchParams(window.location.search).get('launcher_theme'))
    if (embeddedTheme) return embeddedTheme
  }
  const saved = readLS(THEME_KEY, 'stitch-dark')
  return THEMES.includes(saved as ThemeId) ? saved as ThemeId : 'stitch-dark'
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
  theme: initialTheme(),
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

export function subscribeLauncherTheme() {
  if (window.parent === window) return
  const parentOrigin = trustedParentOrigin()
  if (!parentOrigin) return
  const onMessage = (event: MessageEvent) => {
    if (
      event.source !== window.parent ||
      event.origin !== parentOrigin ||
      event.data?.type !== 'launcher:theme-change'
    ) return
    const theme = fromLauncherTheme(event.data.theme)
    if (!theme) return
    // Host updates affect this embedded view without overwriting the standalone preference.
    useThemeStore.setState({ theme })
    const state = useThemeStore.getState()
    applyToDom(theme, state.motionMode, state.trainingActive)
  }
  window.addEventListener('message', onMessage)
  // Request the latest value after subscribing; iframe load can precede React effects.
  window.parent.postMessage({ type: 'webui:theme-ready' }, parentOrigin)
  return () => window.removeEventListener('message', onMessage)
}

/** React 挂载前同步应用,避免主题闪烁 */
export function initTheme() {
  const s = useThemeStore.getState()
  applyToDom(s.theme, s.motionMode, s.trainingActive)
}

/** 当前是否处于 eco 降档(供 JS 驱动的循环动效判断) */
export function isEcoMotion(): boolean {
  return document.documentElement.dataset.motion === 'eco'
}
