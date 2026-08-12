// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
import type { ReactNode } from 'react'

/* 训练类型左栏图标:内联单色线性 SVG,继承 currentColor(选中态由 CSS 变橙)。
   不引第三方图标库。按 group 分配一套语义图标,个别类型可按 id 覆盖,兜底通用图标。 */

const S = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/* ---- 语义图标(线性,24 网格) ---- */

// 分层方块:LoRA(低秩适配,层叠)
const IconLora = (
  <svg {...S}>
    <rect x="3" y="4" width="18" height="6" rx="1" />
    <rect x="3" y="14" width="12" height="6" rx="1" />
  </svg>
)

// 画笔/编辑:Edit 模型
const IconEdit = (
  <svg {...S}>
    <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2V20z" />
    <path d="M14 7l3 3" />
  </svg>
)

// 闪电:专项/few-step(蒸馏加速)
const IconBolt = (
  <svg {...S}>
    <path d="M13 3L5 13h6l-1 8 8-11h-6z" />
  </svg>
)

// 齿轮/滑块:Finetune(全量微调)
const IconFinetune = (
  <svg {...S}>
    <path d="M5 8h14M5 16h14" />
    <circle cx="10" cy="8" r="2.2" />
    <circle cx="15" cy="16" r="2.2" />
  </svg>
)

// 网状节点:ControlNet(条件控制网)
const IconControl = (
  <svg {...S}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M7.5 7.5L11 16m6-8.5L13 16" />
  </svg>
)

// 文字标记:Textual Inversion
const IconText = (
  <svg {...S}>
    <path d="M5 6h14M12 6v13M9 19h6" />
  </svg>
)

// 靶心:其他模型训练(YOLO/scorer 等检测/评分)
const IconTarget = (
  <svg {...S}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
)

// 层叠概念:概念编辑
const IconConcept = (
  <svg {...S}>
    <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
    <path d="M4 12l8 4.5 8-4.5" />
  </svg>
)

// 兜底:通用立方体
const IconGeneric = (
  <svg {...S}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12v9M12 12l8-4.5M12 12L4 7.5" />
  </svg>
)

/* group 关键词 → 图标。匹配 registry 里的中英文分组名(含隐藏组的关键词)。 */
const GROUP_ICON: { test: (g: string) => boolean; icon: ReactNode }[] = [
  { test: (g) => /edit|编辑模型|编辑 模型|edit 模型/i.test(g), icon: IconEdit },
  { test: (g) => /concept|概念/i.test(g), icon: IconConcept },
  { test: (g) => /专项|few[- ]?step|turbo|distill/i.test(g), icon: IconBolt },
  { test: (g) => /finetune|微调/i.test(g), icon: IconFinetune },
  { test: (g) => /controlnet/i.test(g), icon: IconControl },
  { test: (g) => /textual|inversion|文本反演/i.test(g), icon: IconText },
  { test: (g) => /其他|other|yolo|aesthetic|评分/i.test(g), icon: IconTarget },
  { test: (g) => /lora/i.test(g), icon: IconLora },
]

/* 个别 id 覆盖(优先于 group) */
const ID_ICON: Record<string, ReactNode> = {
  'anima-few-step-lora': IconBolt,
  'newbie-few-step-lora': IconBolt,
  'sdxl-turbo-lora': IconBolt,
  'lab-distiller': IconBolt,
  yolo: IconTarget,
  'aesthetic-scorer': IconTarget,
}

/** 按训练类型 id + 分组名返回内联图标(id 覆盖优先,再按 group,兜底通用)。 */
export function typeIcon(id: string, group: string): ReactNode {
  if (ID_ICON[id]) return ID_ICON[id]
  for (const { test, icon } of GROUP_ICON) {
    if (test(group)) return icon
  }
  return IconGeneric
}
