// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// Shared save fields for the existing trainer state-upload request.
const hubStateEnabled = (config) => config.save_state_to_huggingface === true;
hubStateEnabled.deps = new Set(['save_state_to_huggingface']);

export const HUB_STATE_SAVE_FIELDS = [
  {
    key: 'save_state_to_huggingface', type: 'boolean', label: '上传训练状态到 Hugging Face',
    title: 'save_state_to_huggingface', defaultValue: false,
    desc: '每次保存时仅上传训练状态文件，不上传模型权重；需要已有仓库和 Hugging Face 登录。',
  },
  {
    key: 'huggingface_repo_id', type: 'string', label: 'Hugging Face 仓库 ID（必填）',
    title: 'huggingface_repo_id', defaultValue: '', placeholder: '用户名/仓库名',
    desc: '填写已有仓库，例如 owner/training-state。使用当前 Hugging Face 登录或 HF_TOKEN。',
    visibleWhen: hubStateEnabled,
  },
  {
    key: 'huggingface_path_in_repo', type: 'string', label: '仓库内保存目录',
    title: 'huggingface_path_in_repo', defaultValue: 'training_state',
    desc: '训练状态文件在仓库中的相对目录；留空保存到仓库根目录。',
    visibleWhen: hubStateEnabled,
  },
];
