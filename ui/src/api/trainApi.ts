// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { postJson, request } from './transport'

export interface TrainDraftsPayload {
  version?: number
  typeId?: string
  updated_at?: number
  drafts?: Record<string, Record<string, unknown>>
}

/* 训练配置域 API(与旧 UI 完全同形:flat spread + allow_attention_fallback) */
export const trainApi = {
  configOptions: () => request('/api/config/options'),
  savedParams: () => request('/api/config/saved_params'),

  preflight: (config: Record<string, unknown>) =>
    postJson('/api/train/preflight', { allow_attention_fallback: true, ...config }),

  trainingIntentPreview: (config: Record<string, unknown>, intent: string, explicitFields: string[]) =>
    postJson('/api/train/training-intent/preview', { config, intent, explicit_fields: explicitFields }),

  weightComposerPreview: (config: Record<string, unknown>, points = 65) =>
    postJson('/api/train/weight-composer/preview', { config, points }),

  startSampleDifficultyScoring: (payload: Record<string, unknown>) =>
    postJson('/api/train/sample-difficulty/score', payload),

  sampleDifficultyScoringStatus: (jobId: string) =>
    request(`/api/train/sample-difficulty/score/${encodeURIComponent(jobId)}`),

  cancelSampleDifficultyScoring: (jobId: string) =>
    postJson(`/api/train/sample-difficulty/score/${encodeURIComponent(jobId)}/cancel`, {}),

  run: (config: Record<string, unknown>) =>
    postJson('/api/run', { allow_attention_fallback: true, ...config }),

  checkOutputConflict: (outputDir: string, outputName: string) =>
    postJson('/api/check_output_conflict', { output_dir: outputDir, output_name: outputName }),

  checkPathExists: (path: string) => postJson<{ exists?: boolean; type?: string }>('/api/check_path_exists', { path }),

  pickFile: (pickerType: string, context = '') => {
    const params = [`picker_type=${encodeURIComponent(pickerType)}`]
    if (context) params.push(`context=${encodeURIComponent(context)}`)
    return request(`/api/pick_file?${params.join('&')}`)
  },

  /** Anima 模型根目录智能识别（与 legacy /api/scan_anima_folder 同形） */
  scanAnimaFolder: (folderPath: string) =>
    request(`/api/scan_anima_folder?folder_path=${encodeURIComponent(folderPath)}`, {
      method: 'POST',
    }),

  saveConfig: (name: string, config: Record<string, unknown>) => postJson('/api/saved_configs/save', { name, config }),
  listSavedConfigs: () => request('/api/saved_configs/list'),
  loadSavedConfig: (name: string) => request(`/api/saved_configs/load?name=${encodeURIComponent(name)}`),
  deleteSavedConfig: (name: string) => request(`/api/saved_configs/delete?name=${encodeURIComponent(name)}`),
  renameSavedConfig: (oldName: string, newName: string) => postJson('/api/saved_configs/rename', { oldName, newName }),

  /** Kohya TOML / ai-toolkit YAML → flat lulynx fields + notes (does not start training) */
  importExternalConfig: (file: File) => {
    const form = new FormData()
    form.append('file', file, file.name || 'config.bin')
    return request('/api/import_external_config', { method: 'POST', body: form })
  },

  /* 磁盘草稿 working set(与 saved_configs 命名空间隔离) */
  loadTrainDrafts: () => request('/api/train_drafts'),
  saveTrainDrafts: (payload: TrainDraftsPayload) =>
    request('/api/train_drafts', { method: 'PUT', body: JSON.stringify(payload) }),
  clearTrainDrafts: (typeId?: string) => {
    const q = typeId ? `?type_id=${encodeURIComponent(typeId)}` : ''
    return request(`/api/train_drafts${q}`, { method: 'DELETE' })
  },

  /* L-F11 上次训练(同源 /last-training,非 /api 信封也可能直接返回 payload) */
  lastTraining: () => request('/last-training'),

  /* 运行历史磁盘 + 按 run 回填 */
  loadRunHistory: () => request('/api/run_history'),
  saveRunHistory: (payload: { version?: number; updated_at?: number; records?: unknown[] }) =>
    request('/api/run_history', { method: 'PUT', body: JSON.stringify(payload) }),
  runRestorableConfig: (runId: string) =>
    request(`/api/runs/${encodeURIComponent(runId)}/restorable_config`),
}
