// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { postJson, request } from './transport'
import { modelCodePreviewConfig, stripModelCodePermission } from '@/lib/modelCodePermission'

export interface TrainDraftsPayload {
  version?: number
  typeId?: string
  updated_at?: number
  drafts?: Record<string, Record<string, unknown>>
}

/* 实验室训练路由:这 4 个 id 的训练核心只挂在 /api/lulynx-lab/* 上,注册表里没有它们的 schema。
   口径与 LEGACY 的 getLabLaunchApi(actions/trainingActions.js)逐个 id 对齐 —— 两个 few-step
   共用同一条 dit-few-step-lora 端点。端点收的是 { config } 而不是平铺的 config。 */
const LAB_LAUNCH_PATHS: Record<string, string> = {
  'lab-distiller': '/api/lulynx-lab/distiller/start',
  'sdxl-turbo-lora': '/api/lulynx-lab/turbo-lora/start',
  'anima-few-step-lora': '/api/lulynx-lab/dit-few-step-lora/start',
  'newbie-few-step-lora': '/api/lulynx-lab/dit-few-step-lora/start',
}

/* 训练配置域 API(与旧 UI 完全同形:flat spread + allow_attention_fallback) */
export const trainApi = {
  configOptions: () => request('/api/config/options'),
  savedParams: () => request('/api/config/saved_params'),

  modelCodeSources: (config: Record<string, unknown>) =>
    request(`/api/aesthetic_infer/runtime_status?${new URLSearchParams({
      scorer_config: JSON.stringify(modelCodePreviewConfig(config)),
    })}`),

  preflight: (config: Record<string, unknown>) =>
    postJson('/api/train/preflight', { allow_attention_fallback: true, ...config }),

  resolveConfig: (schemaId: string, config: Record<string, unknown>) =>
    postJson('/api/train/config/resolve', {
      schema_id: schemaId,
      config,
      include_trainer_config_preview: false,
    }),

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

  run: (config: Record<string, unknown>) => {
    const typeId = String(config.model_train_type || '').trim().toLowerCase()
    if (typeId === 'yolo') return postJson('/api/yolo/train', config)
    if (typeId === 'aesthetic-scorer') return postJson('/api/aesthetic/train', config)
    // 实验室四型同理:它们在注册表里没有 schema,落到 /api/run 会在 derive_schema_id 之后
    // 抛裸 ValueError(BUG #190)。这条路不过 preflight —— LEGACY 也是整段跳过的。
    const labPath = LAB_LAUNCH_PATHS[typeId]
    if (labPath) return postJson(labPath, { config })
    return postJson('/api/run', { allow_attention_fallback: true, ...config })
  },

  checkOutputConflict: (
    outputDir: string,
    outputName: string,
    extra: { saveTo?: string; resumePath?: string } = {},
  ) =>
    postJson('/api/check_output_conflict', {
      output_dir: outputDir,
      output_name: outputName,
      // save_to 在写盘侧优先于 output_dir，resume_path 是后端唯一允许写同名的豁免;
      // 少传这两个字段就是"查了一个不会被写的目录"。
      save_to: extra.saveTo ?? '',
      resume_path: extra.resumePath ?? '',
    }),

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

  saveConfig: (name: string, config: Record<string, unknown>) =>
    postJson('/api/saved_configs/save', { name, config: stripModelCodePermission(config) }),
  listSavedConfigs: () => request('/api/saved_configs/list'),
  loadSavedConfig: (name: string) => request(`/api/saved_configs/load?name=${encodeURIComponent(name)}`),
  deleteSavedConfig: (name: string) => request(`/api/saved_configs/delete?name=${encodeURIComponent(name)}`, { method: 'DELETE' }),
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
    request('/api/train_drafts', { method: 'PUT', body: JSON.stringify(stripModelCodePermission(payload)) }),
  clearTrainDrafts: (typeId?: string) => {
    const q = typeId ? `?type_id=${encodeURIComponent(typeId)}` : ''
    return request(`/api/train_drafts${q}`, { method: 'DELETE' })
  },

  /* L-F11 上次训练(后端 canonical 路由挂在 /train 下,非 /api 信封也可能直接返回 payload) */
  lastTraining: () => request('/train/last-training'),

  /* 运行历史磁盘 + 按 run 回填 */
  loadRunHistory: () => request('/api/run_history'),
  saveRunHistory: (payload: { version?: number; updated_at?: number; records?: unknown[] }) =>
    request('/api/run_history', { method: 'PUT', body: JSON.stringify(stripModelCodePermission(payload)) }),
  runRestorableConfig: (runId: string) =>
    request(`/api/runs/${encodeURIComponent(runId)}/restorable_config`),
}
