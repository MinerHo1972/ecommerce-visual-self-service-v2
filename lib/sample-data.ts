import type { GeneratedImage, LayerTemplate, PromptTemplate } from "./types";

export const samplePromptTemplates: PromptTemplate[] = [
  {
    id: 501,
    name: "天猫主图 Prompt",
    scene: "main_image",
    platform: "tmall",
    promptSkeleton: "一张{platform}风格的商品主图，{product_name}在{scene}场景中，{style}风格，画面干净高级，商品清晰突出",
    variables: [
      { key: "platform", label: "平台", type: "text", default: "天猫", required: true },
      { key: "product_name", label: "商品名", type: "text", required: true },
      { key: "scene", label: "场景", type: "text", default: "咖啡馆" },
      { key: "style", label: "风格", type: "select", default: "日系清新" }
    ],
    tags: ["天猫", "主图", "日系清新"],
    status: "active"
  },
  {
    id: 502,
    name: "小红书种草 Prompt",
    scene: "social_seed",
    platform: "xiaohongshu",
    promptSkeleton: "一张小红书种草风格图片，主体是{product_name}，{scene}氛围，{style}调性，自然光，真实生活感",
    variables: [
      { key: "product_name", label: "商品名", type: "text", required: true },
      { key: "scene", label: "场景", type: "text", default: "居家咖啡角" },
      { key: "style", label: "风格", type: "select", default: "生活方式" }
    ],
    tags: ["小红书", "种草图", "生活方式"],
    status: "active"
  }
];

export const sampleLayerTemplates: LayerTemplate[] = [
  {
    id: 1001,
    name: "618 咖啡主图模板 A",
    category: "618",
    canvasWidth: 800,
    canvasHeight: 800,
    status: "active",
    version: 1,
    tags: ["618", "天猫", "主图"],
    templateJson: {
      canvas: { width: 800, height: 800 },
      focusArea: { layerId: "product_main", x: 140, y: 250, width: 520, height: 360 },
      safeMargin: { top: 42, right: 42, bottom: 42, left: 42 },
      exportSizes: [
        { name: "tmall_main", width: 800, height: 800, mode: "rerender" },
        { name: "xiaohongshu", width: 1080, height: 1440, mode: "rerender", crop: "focus_area" }
      ],
      layers: [
        {
          id: "bg",
          type: "background",
          zIndex: 0,
          gradient: {
            angle: 135,
            stops: [
              { offset: 0, color: "#fff7ed" },
              { offset: 0.52, color: "#fecaca" },
              { offset: 1, color: "#fef3c7" }
            ]
          }
        },
        { id: "decor_top", type: "shape", shape: "circle", zIndex: 1, area: { x: -90, y: -80, width: 260, height: 260 }, fill: "rgba(15,118,110,0.18)" },
        { id: "decor_bottom", type: "shape", shape: "rect", zIndex: 1, area: { x: 0, y: 648, width: 800, height: 152 }, fill: "rgba(15,118,110,0.94)", radius: 0 },
        {
          id: "badge_top",
          type: "badge",
          zIndex: 3,
          area: { x: 54, y: 56, width: 170, height: 46 },
          textKey: "badge",
          defaultText: "618 限时",
          fill: "#0f766e",
          radius: 23,
          style: { fontFamily: "system-ui", baseSize: 22, minSize: 14, color: "#ffffff", autoShrink: true }
        },
        {
          id: "title",
          type: "text",
          zIndex: 3,
          area: { x: 58, y: 120, width: 684, height: 82 },
          textKey: "title",
          defaultText: "连咖啡爆款组合",
          style: { fontFamily: "system-ui", baseSize: 48, minSize: 28, weight: "800", color: "#17202a", autoShrink: true, maxChars: 18 }
        },
        {
          id: "product_main",
          type: "product",
          zIndex: 2,
          area: { x: 140, y: 250, width: 520, height: 360 },
          fitMode: "contain",
          placeholderFill: "rgba(255,255,255,0.72)",
          shadow: { blur: 24, color: "rgba(15,23,42,0.18)", offsetX: 0, offsetY: 14 }
        },
        {
          id: "price",
          type: "text",
          zIndex: 3,
          area: { x: 58, y: 670, width: 350, height: 64 },
          textKey: "price",
          defaultText: "到手 ¥59.9",
          style: { fontFamily: "system-ui", baseSize: 44, minSize: 24, weight: "800", color: "#ffffff", autoShrink: true }
        },
        {
          id: "subtitle",
          type: "text",
          zIndex: 3,
          area: { x: 420, y: 684, width: 310, height: 40 },
          textKey: "subtitle",
          defaultText: "囤货正当时",
          style: { fontFamily: "system-ui", baseSize: 28, minSize: 18, weight: "700", color: "#fef3c7", autoShrink: true }
        },
        { id: "logo", type: "logo", zIndex: 4, area: { x: 626, y: 54, width: 112, height: 42 }, text: "连咖啡", editable: false }
      ]
    }
  },
  {
    id: 1002,
    name: "双11 深色促销模板 B",
    category: "双11",
    canvasWidth: 800,
    canvasHeight: 800,
    status: "active",
    version: 1,
    tags: ["双11", "天猫", "主图"],
    templateJson: {
      canvas: { width: 800, height: 800 },
      focusArea: { layerId: "product_main", x: 150, y: 250, width: 500, height: 360 },
      safeMargin: { top: 40, right: 40, bottom: 40, left: 40 },
      exportSizes: [{ name: "tmall_main", width: 800, height: 800, mode: "rerender" }],
      layers: [
        { id: "bg", type: "background", zIndex: 0, fill: "#111827" },
        { id: "decor", type: "shape", shape: "rect", zIndex: 1, area: { x: 44, y: 44, width: 712, height: 712 }, fill: "rgba(245,158,11,0.16)", radius: 28 },
        {
          id: "title",
          type: "text",
          zIndex: 3,
          area: { x: 72, y: 98, width: 656, height: 80 },
          textKey: "title",
          defaultText: "双11 咖啡囤货节",
          style: { fontFamily: "system-ui", baseSize: 48, minSize: 28, weight: "800", color: "#fbbf24", autoShrink: true }
        },
        { id: "product_main", type: "product", zIndex: 2, area: { x: 150, y: 250, width: 500, height: 360 }, fitMode: "contain", placeholderFill: "rgba(255,255,255,0.10)" },
        {
          id: "price",
          type: "text",
          zIndex: 3,
          area: { x: 72, y: 662, width: 656, height: 70 },
          textKey: "price",
          defaultText: "第二件半价",
          style: { fontFamily: "system-ui", baseSize: 46, minSize: 24, weight: "800", color: "#ffffff", autoShrink: true }
        }
      ]
    }
  }
];

export const sampleGeneratedImages: GeneratedImage[] = [
  {
    id: 9001,
    jobId: "job_20260610_001",
    templateId: 1001,
    templateName: "618 咖啡主图模板 A",
    title: "连咖啡爆款组合 618 主图候选 1",
    scene: "main_image",
    platform: "tmall",
    ossKey: "generated/2026/06/10/job_20260610_001/candidate_1.png",
    thumbnailUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=640&auto=format&fit=crop",
    width: 800,
    height: 800,
    status: "succeeded",
    selected: true,
    tags: ["618", "天猫", "已选中"],
    createdAt: "2026-06-10T13:58:00+08:00"
  },
  {
    id: 9002,
    jobId: "job_20260610_001",
    templateId: 1001,
    templateName: "618 咖啡主图模板 A",
    title: "连咖啡爆款组合 618 主图候选 2",
    scene: "main_image",
    platform: "tmall",
    ossKey: "generated/2026/06/10/job_20260610_001/candidate_2.png",
    thumbnailUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=640&auto=format&fit=crop",
    width: 800,
    height: 800,
    status: "succeeded",
    selected: false,
    tags: ["618", "天猫"],
    createdAt: "2026-06-10T13:58:02+08:00"
  },
  {
    id: 9003,
    jobId: "job_20260610_002",
    templateId: 1002,
    templateName: "双11 深色促销模板 B",
    title: "双11 咖啡囤货节候选 1",
    scene: "promotion",
    platform: "tmall",
    ossKey: "generated/2026/06/10/job_20260610_002/candidate_1.png",
    thumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=640&auto=format&fit=crop",
    width: 800,
    height: 800,
    status: "succeeded",
    selected: false,
    tags: ["双11", "天猫"],
    createdAt: "2026-06-10T14:04:00+08:00"
  }
];
