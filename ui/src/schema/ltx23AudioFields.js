// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import { when } from './schemaCommon.js';

export const LTX23_AUDIO_FIELDS = [
  {
    key: 'ltx23_train_audio', type: 'boolean', label: '联合训练音频',
    title: 'ltx23_train_audio', defaultValue: false,
    desc: '同时训练视频、音频及跨模态交互。训练视频须有音轨，帧步长须为 1；开启后自动取消模态隔离。',
  },
  {
    key: 'ltx23_audio_vae_path', type: 'file', pickerType: 'model-file',
    label: 'LTX-2.3 音频 VAE', title: 'ltx23_audio_vae_path', defaultValue: '',
    desc: '可选；留空从模型中加载匹配的音频 VAE，自定义组件布局时指定。',
    visibleWhen: when('ltx23_train_audio', true),
  },
  {
    key: 'ltx23_audio_loss_weight', type: 'number', label: '音频损失权重',
    title: 'ltx23_audio_loss_weight', defaultValue: 1.0, min: 0.001, step: 0.1,
    desc: '音频训练损失相对于视频损失的权重，须大于 0。',
    visibleWhen: when('ltx23_train_audio', true),
  },
];

export const LTX23_AUDIO_FIELD_KEYS = new Set(LTX23_AUDIO_FIELDS.map(({ key }) => key));
