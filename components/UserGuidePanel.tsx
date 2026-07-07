"use client";

import {
  BookOpen,
  MousePointerClick,
  Palette,
  RefreshCw,
  Ruler,
  ShoppingBag,
  Sparkles,
  Upload,
} from "lucide-react";

const steps = [
  {
    icon: MousePointerClick,
    title: "快速上手",
    color: "#0f766e",
    items: [
      `第一步：在左侧选择一个模板（如「618 主图」或「双11 Banner」）`,
      "第二步：在参数面板中填入主标题、副标题、价格、活动标签",
      `第三步：点击右上角「抽卡生成」按钮，等待 AI 返回 3 张候选图`,
      `选中满意的那张，它会自动归档到「历史成图」`,
    ],
  },
  {
    icon: ShoppingBag,
    title: "模板选择",
    color: "#1d4ed8",
    items: [
      "运营自助台左侧展示所有可用模板，按标签分类（如 618、双11、天猫、小红书）",
      "每个模板卡片标注了画布尺寸和版本号，点击即选中",
      "不同模板适用于不同平台和活动场景：618 活动图、双11 主推、日常上新等",
      "模板管理 Tab 中可以进行模板的新增和编辑",
    ],
  },
  {
    icon: Palette,
    title: "参数填写",
    color: "#7c3aed",
    items: [
      `主标题：商品核心卖点（如「连咖啡爆款组合」），尽量简短有力`,
      `副标题：补充说明（如「囤货正当时」），建议不超过 15 字`,
      `价格/利益点：直接写价格信息（如「到手 ¥59.9」），AI 会自动排版`,
      `活动标签：角标文案（如「618 限时」「新品」），通常 2-4 个字`,
      "商品图：上传 PNG/JPG 商品图，系统自动按模板区域裁剪适配",
      "背景图（可选）：上传自定义背景，不传则使用模板默认背景",
    ],
  },
  {
    icon: Sparkles,
    title: "AI 生成（抽卡机制）",
    color: "#b45309",
    items: [
      `每次点击「抽卡生成」会同时生成 3 张候选图`,
      `候选图直接显示在「本轮候选图」面板中`,
      `点击「选中」按钮标记满意的图片，它会同步到历史归档`,
      "如果都不满意，可以调整参数后重新抽卡",
      "当前模式说明：Mock 模式返回模板预览截图；GRSAI 模式调用 AI 真实生成",
    ],
  },
  {
    icon: RefreshCw,
    title: "复用再调",
    color: "#0891b2",
    items: [
      `在「历史成图」Tab 中浏览所有历史图片`,
      `点击任意图片的「复用再调」按钮，系统自动恢复该图片的模板和参数`,
      "跳转到运营自助台后，可以微调参数重新生成",
      "适合在已有图片基础上做小幅调整（改价格、换文案等）",
    ],
  },
  {
    icon: Ruler,
    title: "导出尺寸",
    color: "#be185d",
    items: [
      "天猫主图：800 x 800 像素（tmall_main）",
      "天猫详情横幅：790 x 400 像素（tmall_banner）",
      "小红书竖图：1080 x 1440 像素（xhs_vertical）",
      "京东主图：800 x 800 像素（jd_main）",
      "在参数面板底部选择目标尺寸，预览实时更新",
    ],
  },
  {
    icon: Upload,
    title: "参考图库",
    color: "#15803d",
    items: [
      `在「参考图库」Tab 中上传参考图片`,
      "参考图用于给 AI 提供风格和构图方向",
      "支持 JPG / PNG / WebP 格式，单张不超过 20MB",
      "点击图片可以查看大图，支持删除不需要的参考图",
    ],
  },
];

export function UserGuidePanel() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <p className="muted" style={{ margin: 0 }}>
        从零开始使用电商视觉自助台，分步骤了解每个功能模块。
      </p>
      <div className="guide-steps-grid">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div className="card guide-step-card" key={step.title}>
              <div className="card-body">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span
                    className="guide-step-number"
                    style={{ background: `${step.color}14`, color: step.color, border: `1px solid ${step.color}33` }}
                  >
                    {idx + 1}
                  </span>
                  <Icon size={18} style={{ color: step.color }} />
                  <h3 style={{ margin: 0, fontSize: 16 }}>{step.title}</h3>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {step.items.map((item, i) => (
                    <li key={i} style={{ fontSize: 13, color: "#334155", lineHeight: 1.55 }}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
