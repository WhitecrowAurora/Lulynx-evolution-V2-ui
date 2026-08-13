// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { create } from 'zustand'

/*
 * 顶栏性能开关(经典 UI perfModeToggle / optimizerToggle 的迁移):
 * - lulynxOptimization → lulynx_optimization_enabled(Lulynx Triton 融合优化)
 * - turbocore → turbocore_enabled(TurboCore CUDA 优化器主开关)
 *
 * 全局持久化(跨训练类型共享,与经典 UI 语义一致),默认两者开启。
 * Topbar 负责把状态同步进当前草稿,使 schema 的 visibleWhen 互斥即时生效,
 * payload 透传见 runConfigBuilder。
 */

const LULYNX_KEY = 'lx-perf-lulynx-opt'
const TURBOCORE_KEY = 'lx-perf-turbocore'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

interface PerfModeState {
  lulynxOptimization: boolean
  turbocore: boolean
  setLulynxOptimization(on: boolean): void
  setTurbocore(on: boolean): void
}

export const usePerfModeStore = create<PerfModeState>((set) => ({
  lulynxOptimization: readBool(LULYNX_KEY, true),
  turbocore: readBool(TURBOCORE_KEY, true),
  setLulynxOptimization(on) {
    writeBool(LULYNX_KEY, on)
    set({ lulynxOptimization: on })
  },
  setTurbocore(on) {
    writeBool(TURBOCORE_KEY, on)
    set({ turbocore: on })
  },
}))
