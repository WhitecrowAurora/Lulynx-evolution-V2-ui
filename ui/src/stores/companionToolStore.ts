// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { create } from 'zustand'

export type CompanionToolId = 'fim_scan' | 'lora_meta' | 'goal_forecast' | 'copilot'

export const COMPANION_HANDLERS: Record<string, CompanionToolId> = {
  openFimScanTool: 'fim_scan',
  openLoraMetaReader: 'lora_meta',
  openGoalForecastTool: 'goal_forecast',
  openCopilotTool: 'copilot',
}

interface CompanionToolState {
  tool: CompanionToolId | null
  config: Record<string, unknown>
  open: (handler: string, config: Record<string, unknown>) => void
  close: () => void
}

export const useCompanionToolStore = create<CompanionToolState>((set) => ({
  tool: null,
  config: {},
  open: (handler, config) => {
    const tool = COMPANION_HANDLERS[handler]
    if (tool) set({ tool, config })
  },
  close: () => set({ tool: null, config: {} }),
}))
