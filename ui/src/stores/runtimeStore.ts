// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* 启动运行时能力:launcher 起的是哪个运行时、该运行时实测可用哪些注意力后端、机器上有哪些卡。
   两个只读接口在启动时并行拉一次(首次调用会为每个已安装运行时拉起解释器子进程做
   前向/反向验证,之后按环境指纹走缓存,所以不阻塞首屏)。
   profiles === null 表示还没到位;判可用的一侧必须按「未知」处理,不能按「不可用」。 */

import { create } from 'zustand'
import { request, unwrap } from '@/api/transport'

export interface GpuCard {
  index?: number
  name?: string
  memory_total?: number
  memory_used?: number
  memory_free?: number
}

export interface GraphicCardsPayload {
  cards?: GpuCard[]
  runtime?: { environment?: string; runtime_id?: string; launcher_selection?: string }
}

export interface ExecutionProfile {
  id?: string
  label_zh?: string
  installed?: boolean
  default_attention_backend?: string
  supported_attention_backends?: string[]
  available_attention_backends?: string[]
  attention_backends?: Record<string, unknown>[]
  module_attention_capabilities?: Record<string, unknown>[]
  /** 本运行时会强制/影响哪些字段:{字段键: {effect: 'forced'|'advisory', zh, en}} */
  field_constraints?: Record<string, Record<string, string>>
  /** 本运行时上逐选项不可用的理由:{字段键: {选项值: {zh, en}}},全是 forced */
  option_constraints?: Record<string, Record<string, Record<string, string>>>
}

export interface RuntimeCapabilitySnapshot {
  cards: GpuCard[]
  runtimeId: string
  /** launcher 启动时选的卡(CUDA_VISIBLE_DEVICES);空=没指定,将用全部可见显卡 */
  launcherSelection: string
  /** null = 还没拉到 / 请求失败;[] = 拉到了但一个 profile 都没有 */
  profiles: ExecutionProfile[] | null
  loaded: boolean
}

export const useRuntimeStore = create<RuntimeCapabilitySnapshot>(() => ({
  cards: [],
  runtimeId: '',
  launcherSelection: '',
  profiles: null,
  loaded: false,
}))

let hydrated = false

export async function hydrateRuntimeCapabilities(): Promise<void> {
  if (hydrated) return
  hydrated = true
  const [cardsResult, profilesResult] = await Promise.allSettled([
    request('/api/graphic_cards'),
    request('/api/train/execution-profiles'),
  ])
  const next: Partial<RuntimeCapabilitySnapshot> = { loaded: true }
  if (cardsResult.status === 'fulfilled') {
    try {
      const data = unwrap<GraphicCardsPayload>(cardsResult.value)
      next.cards = Array.isArray(data?.cards) ? data.cards : []
      next.runtimeId = String(data?.runtime?.runtime_id || data?.runtime?.environment || '')
      next.launcherSelection = String(data?.runtime?.launcher_selection || '')
    } catch {
      /* 显卡表拉不到:设备选择退回成只能留空,不编一份假卡表 */
    }
  }
  if (profilesResult.status === 'fulfilled') {
    try {
      const data = unwrap<{ profiles?: ExecutionProfile[] }>(profilesResult.value)
      next.profiles = Array.isArray(data?.profiles) ? data.profiles : []
    } catch {
      /* 留 null:让判可用的一侧知道这是「未知」而不是「都不可用」 */
    }
  }
  useRuntimeStore.setState(next)
}


