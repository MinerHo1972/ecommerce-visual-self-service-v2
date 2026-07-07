"use client";

import { BookOpen, ChevronLeft, ChevronRight, History, LayoutDashboard, Paintbrush, Recycle, Settings, Type, WandSparkles } from "lucide-react";
import { useState } from "react";
import { GeneratedImageHistory } from "@/components/GeneratedImageHistory";
import { RecycleBinPanel } from "@/components/RecycleBinPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TemplateLibraryPanel } from "@/components/TemplateLibraryPanel";
import { TemplateReplacePanel } from "@/components/TemplateReplacePanel";
import { UserGuidePanel } from "@/components/UserGuidePanel";
import type { GeneratedImage } from "@/lib/types";

const navItems = [
  { key: "workbench", label: "操作工作台", icon: LayoutDashboard },
  { key: "library", label: "图库", icon: History },
  { key: "recycle", label: "回收站", icon: Recycle },
  { key: "guide", label: "使用手册", icon: BookOpen },
  { key: "settings", label: "设置", icon: Settings }
] as const;

type ActiveNav = (typeof navItems)[number]["key"];

type ReusedProductInput = {
  id: number;
  name: string;
  url: string;
  notice: string;
};

const pageCopy: Record<ActiveNav, { title: string; subtitle: string }> = {
  workbench: {
    title: "操作工作台",
    subtitle: "从这里选择工作流、输入素材、微调提示词并发起抽卡；结果可以继续调用任意工作流或存入图库。",
  },
  library: {
    title: "图库",
    subtitle: "统一管理上传图、生成图、产品图和模板图；通过类型、评分和其他标签完成资产流转。",
  },
  recycle: {
    title: "回收站",
    subtitle: "查看已移入回收站的产品、模板和图库图片，必要时恢复到原列表。",
  },
  guide: {
    title: "使用手册",
    subtitle: "新手友好的操作指南，分步骤带你上手。",
  },
  settings: {
    title: "设置",
    subtitle: "查看当前运行时配置和系统状态。",
  },
};

export default function Page() {
  const [activeNav, setActiveNav] = useState<ActiveNav>("workbench");
  const [activeWorkflow, setActiveWorkflow] = useState<"templateReplace" | "partialRepaint" | "textEdit">("templateReplace");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [reusedProduct, setReusedProduct] = useState<ReusedProductInput | null>(null);

  function handleStartWorkflow(image: GeneratedImage, workflow: "templateReplace" | "partialRepaint" | "textEdit") {
    setReusedProduct({
      id: image.id,
      name: image.title,
      url: image.thumbnailUrl,
      notice: `已带入${workflow === "templateReplace" ? "产品换模板" : workflow === "partialRepaint" ? "局部重绘" : "文案替换"}工作流：${image.title}`,
    });
    setActiveNav("workbench");
    setActiveWorkflow(workflow);
  }

  const currentCopy = pageCopy[activeNav];

  return (
    <div className={`shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-head">
          <div className="brand" aria-hidden={isSidebarCollapsed}>电商视觉自助台</div>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          >
            {isSidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={`nav-item ${activeNav === item.key ? "active" : ""}`} title={item.label} aria-label={item.label} onClick={() => setActiveNav(item.key)}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <div className="toolbar">
          <div className="title-block">
            <h1>{currentCopy.title}</h1>
            <p>{currentCopy.subtitle}</p>
          </div>
        </div>

        {activeNav === "workbench" && (
          <section className="workbench-layout">
            <div className="workflow-switcher panel" aria-label="工作流模式选择">
              <div className="workflow-switcher-head">
                <p className="eyebrow">工作流模式</p>
                <h2>选择后会切换下方整套操作界面</h2>
                <p className="muted">每个模式对应不同输入、提示词和生成动作，不只是页内筛选。</p>
              </div>
              <div className="workflow-tabs">
                <button className={`workflow-tab ${activeWorkflow === "templateReplace" ? "active" : ""}`} onClick={() => setActiveWorkflow("templateReplace")} type="button">
                  <WandSparkles size={18} />
                  <span>模板换产品</span>
                  <small>任意图 + 任意模板图 → 抽候选</small>
                </button>
                <button className={`workflow-tab ${activeWorkflow === "partialRepaint" ? "active" : ""}`} onClick={() => setActiveWorkflow("partialRepaint")} type="button">
                  <Paintbrush size={18} />
                  <span>局部重绘</span>
                  <small>选基准图 → 框选区域 → 可选参考图</small>
                </button>
                <button className={`workflow-tab ${activeWorkflow === "textEdit" ? "active" : ""}`} onClick={() => setActiveWorkflow("textEdit")} type="button">
                  <Type size={18} />
                  <span>文案替换</span>
                  <small>选模板图 → 指定原文和新文案</small>
                </button>
              </div>
            </div>
            {activeWorkflow === "templateReplace" && (
              <TemplateReplacePanel
                mode="templateReplace"
                reusedProduct={reusedProduct}
                onReusedProductConsumed={() => setReusedProduct(null)}
              />
            )}
            {activeWorkflow === "partialRepaint" && (
              <TemplateReplacePanel
                mode="partialRepaint"
                reusedProduct={reusedProduct}
                onReusedProductConsumed={() => setReusedProduct(null)}
              />
            )}
            {activeWorkflow === "textEdit" && <TemplateLibraryPanel variant="workbench" />}
          </section>
        )}

        {activeNav === "library" && <GeneratedImageHistory refreshKey={historyRefreshKey} onStartWorkflow={handleStartWorkflow} />}


        {activeNav === "recycle" && <RecycleBinPanel />}

        {activeNav === "guide" && <UserGuidePanel />}
        {activeNav === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
