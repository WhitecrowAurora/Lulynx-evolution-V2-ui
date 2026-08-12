// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/**
 * Anima model-folder smart scan (Evolution).
 * Port of legacy animaFolderScanTool: pick folder → POST /api/scan_anima_folder → write paths.
 * High-confidence auto_selected: silent apply. Multi-candidate: first candidate + toast (minimal conflict UI).
 */
import { trainApi } from '@/api/trainApi'
import { unwrap } from '@/api/transport'
import { useTrainConfigStore } from '@/stores/configStore'
import { toast } from '@/stores/toastStore'

export const ANIMA_SCAN_COMPONENT_META = {
  dit_model: { label: 'Anima DiT', field: 'pretrained_model_name_or_path' },
  vae: { label: 'VAE', field: 'vae' },
  qwen3: { label: 'Qwen3', field: 'qwen3' },
  llm_adapter: { label: 'LLM Adapter', field: 'llm_adapter_path' },
  t5_tokenizer: { label: 'T5 Tokenizer', field: 't5_tokenizer_path' },
} as const

const COMP_ORDER = Object.keys(ANIMA_SCAN_COMPONENT_META) as (keyof typeof ANIMA_SCAN_COMPONENT_META)[]

type ScanComponent = {
  found?: boolean
  auto_selected?: string | null
  candidates?: Array<string | { path?: string; score?: number }>
}

type ScanResult = {
  error?: string
  components?: Record<string, ScanComponent>
}

function candidatePath(c: string | { path?: string }): string {
  if (typeof c === 'string') return c
  return String(c?.path || '')
}

function pickForComponent(comp: ScanComponent | undefined): string {
  if (!comp?.found) return ''
  if (comp.auto_selected) return String(comp.auto_selected)
  const list = comp.candidates || []
  for (const c of list) {
    const p = candidatePath(c)
    if (p) return p
  }
  return ''
}

function applySelections(paths: Record<string, string>): number {
  const values: Record<string, unknown> = {}
  for (const key of COMP_ORDER) {
    const path = paths[key]
    if (!path) continue
    values[ANIMA_SCAN_COMPONENT_META[key].field] = path
  }
  if (!Object.keys(values).length) return 0
  useTrainConfigStore.getState().applyValues(values)
  return Object.keys(values).length
}

/** Open native folder picker, scan, fill model path fields. */
export async function openAnimaFolderScanner(): Promise<void> {
  let folderPath = ''
  try {
    const payload = unwrap<Record<string, unknown>>(await trainApi.pickFile('folder', 'anima_model_root'))
    const path =
      (typeof payload === 'string' && payload) ||
      (payload && typeof payload === 'object' && (payload.path ?? payload.file ?? payload.folder))
    if (typeof path === 'string' && path) folderPath = path
  } catch (e) {
    toast.warn((e as Error).message || 'folder pick failed', 'SCAN')
    return
  }
  if (!folderPath) {
    toast.info('未选择文件夹', 'SCAN')
    return
  }

  toast.info('正在扫描模型文件夹…', 'SCAN')
  let scanResult: ScanResult
  try {
    scanResult = unwrap<ScanResult>(await trainApi.scanAnimaFolder(folderPath))
  } catch (e) {
    toast.warn((e as Error).message || '扫描请求失败', 'SCAN')
    return
  }
  if (!scanResult || scanResult.error) {
    toast.warn(scanResult?.error || '扫描失败', 'SCAN')
    return
  }

  const components = scanResult.components || {}
  const hasAny = COMP_ORDER.some((k) => components[k]?.found)
  if (!hasAny) {
    toast.info('未在该目录找到可识别的模型文件。', 'SCAN')
    return
  }

  const needsConflict = COMP_ORDER.some((k) => {
    const c = components[k]
    return Boolean(c?.found && !c?.auto_selected)
  })

  const picks: Record<string, string> = {}
  for (const k of COMP_ORDER) {
    const p = pickForComponent(components[k])
    if (p) picks[k] = p
  }
  const n = applySelections(picks)
  if (n <= 0) {
    toast.warn('未能写回任何路径', 'SCAN')
    return
  }
  if (needsConflict) {
    toast.info(`已填充 ${n} 个路径（含多候选取首项；请核对）。`, 'SCAN')
  } else {
    toast.info(`已自动填充 ${n} 个模型路径。`, 'SCAN')
  }
}
