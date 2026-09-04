// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
/* 显卡表 → 设备勾选项。
   三个界面分叉各持一份同样的实现(分叉是彼此独立的仓库,不抽公共模块),
   由 backend/smoke/functional/webui 的守卫钉住三份输出逐字相同。
   值取 nvidia-smi 自己的 index:那正是 CUDA_VISIBLE_DEVICES / gpu_ids 用的编号。 */

export function deviceOptions(cards) {
  return (Array.isArray(cards) ? cards : []).map((card, position) => {
    const index = Number.isFinite(Number(card?.index)) ? Number(card.index) : position;
    const total = Number(card?.memory_total) || 0;
    const free = Number(card?.memory_free) || 0;
    const size = total ? ` · ${(total / 1024).toFixed(1)} GB` : '';
    const idle = total && free ? `（空闲 ${(free / 1024).toFixed(1)} GB）` : '';
    return { value: String(index), label: `${index} · ${card?.name || 'GPU'}${size}${idle}` };
  });
}
