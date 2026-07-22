// partial_repaint prompt 构造器（从 V1 generation-jobs.ts 迁移，保留 7 条硬约束）
//
// 输入：
//   - parentImageUrl:   第 1 张，完整父图（最终画布基准）
//   - cropImageUrl:     第 2 张，框选区域裁片（位置/边缘/光影上下文）
//   - referenceImageUrl:第 3 张（可选），目标参考图（约束区域内的内容物）
//   - region:           归一化 0-1 矩形 {x,y,width,height}
//   - instruction:      用户修图文字指令
//   - size:             输出尺寸 "WxH"，如 "800x800"
//   - parentImageId:    可选，日志/审计用
//   - cropName/referenceName: 可选，人类可读名称
//
// 输出：
//   { prompt, urls, tags } —— 直接喂给 createImages({prompt, urls, size, n})

export interface PartialRepaintRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PartialRepaintInput {
  parentImageUrl: string
  cropImageUrl: string
  referenceImageUrl?: string
  region: PartialRepaintRect
  instruction: string
  size: string
  parentImageId?: string
  cropName?: string
  referenceName?: string
}

export interface PartialRepaintPrompt {
  prompt: string
  urls: string[]
  tags: string[]
}

export function buildPartialRepaintPrompt(input: PartialRepaintInput): PartialRepaintPrompt {
  const {
    parentImageUrl,
    cropImageUrl,
    referenceImageUrl,
    region,
    instruction,
    size,
    parentImageId,
    cropName,
    referenceName,
  } = input

  const pct = (n: number) => (n * 100).toFixed(1)
  const regionText =
    `局部重绘区域（相对原图宽高的 0-1 坐标）：x=${region.x.toFixed(4)}, y=${region.y.toFixed(4)}, width=${region.width.toFixed(4)}, height=${region.height.toFixed(4)}，即约 x=${pct(region.x)}%, y=${pct(region.y)}%, w=${pct(region.width)}%, h=${pct(region.height)}%。这一区域对应第 2 张局部裁片。`

  const cropText = cropImageUrl
    ? `第 2 张是【框选区域裁片】，只代表父图里需要被修复/替换的局部。裁片名称：${cropName || '未命名裁片'}。`
    : '未提供框选区域裁片；请根据坐标和文字要求做最小局部修复。'

  const referenceText = referenceImageUrl
    ? `第 3 张是【目标参考图】，用于约束框选区域内要修正的内容物、赠品、局部物体或细节形态。参考图名称：${referenceName || '未命名参考图'}。`
    : '未提供第 3 张目标参考图；按用户文字要求和第 2 张裁片做最小局部修复。'

  const prompt =
`你是电商图片局部重绘生产引擎。输出尺寸：${size}。
参考图角色：第 1 张是【完整父图】，必须作为最终构图、尺寸、版式和区域外内容的基准。${cropText}${referenceText}
任务：基于完整父图做局部重绘，只修改用户框选区域，生成一张新的候选图。
父图 ID：${parentImageId || 'unknown'}。
局部区域：${regionText}
用户修图要求：${instruction || '修复框选区域的瑕疵'}。
硬性约束：
1. 第 1 张完整父图是最终画布；输出必须仍是完整图片，不要只输出局部裁片。
2. 只允许改动第 2 张裁片对应的矩形区域；矩形区域外的商品、文字、背景、装饰、Logo、价格、色块、版式必须保持不变。
3. 第 2 张裁片用于锁定要处理的局部位置、边缘纹理、光影和上下文，不要把裁片放大成整张画面。
4. 如果提供了第 3 张目标参考图，只能用它约束框选区域内的目标内容，不要把参考图背景、画布、无关元素搬进父图。
5. 框选区域内的目标物体、赠品或内容物应尽量贴近用户要求和目标参考图，同时匹配父图光影、透视、噪声和边缘连续性。
6. 不要重绘整张图，不要改变画面主题，不要新增无关元素。
7. 输出仍必须像同一张电商成图的局部修复版本。`

  const urls = [parentImageUrl, cropImageUrl, referenceImageUrl].filter((u): u is string => Boolean(u))
  const tags = [
    'partial_repaint',
    ...(cropImageUrl ? ['with_crop'] : []),
    ...(referenceImageUrl ? ['with_reference'] : []),
    `parent:${parentImageId || 'unknown'}`,
  ]

  return { prompt, urls, tags }
}
